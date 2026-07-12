import { describe, expect, it } from "vitest";
import { scrubDeep, scrubErrorEvent, scrubEventSafe, scrubText } from "./scrub";

describe("scrubText", () => {
  it("replaces emails with [EMAIL]", () => {
    expect(scrubText("user ivan.petrov+test@example.co.uk failed login")).toBe(
      "user [EMAIL] failed login",
    );
  });

  it("replaces RU phone formats with [PHONE]", () => {
    expect(scrubText("call +7 (912) 345-67-89 now")).toBe("call [PHONE] now");
    expect(scrubText("phone 89123456789")).toBe("phone [PHONE]");
    expect(scrubText("phone 8 912 345 67 89 ok")).toBe("phone [PHONE] ok");
    expect(scrubText("+79123456789")).toBe("[PHONE]");
  });

  it("does not treat longer digit runs as phones", () => {
    // 13-digit id starting with 8 — the trailing boundary must reject it.
    expect(scrubText("id 8123456789012 kept")).toBe("id 8123456789012 kept");
    // unix-ms timestamp
    expect(scrubText("at 1752230000000")).toBe("at 1752230000000");
  });

  it("replaces JWT-shaped tokens with [TOKEN]", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9P";
    expect(scrubText(`auth failed for ${jwt}!`)).toBe("auth failed for [TOKEN]!");
  });

  it("replaces opaque Bearer values", () => {
    expect(scrubText("header Bearer abc.DEF-123~xyz rejected")).toBe(
      "header Bearer [TOKEN] rejected",
    );
  });

  it("filters sensitive query-string params but keeps the param name", () => {
    expect(scrubText("GET /rest/v1/rpc?apikey=secret123&x=1")).toBe(
      "GET /rest/v1/rpc?apikey=[FILTERED]&x=1",
    );
    expect(scrubText("url?a=1&refresh_token=r3fr3sh#frag")).toBe(
      "url?a=1&refresh_token=[FILTERED]#frag",
    );
  });

  it("replaces RU address fragments with [ADDRESS]", () => {
    expect(scrubText("живу на ул. Ленина 15, кв. 3")).toBe("живу на [ADDRESS], [ADDRESS]");
    expect(scrubText("г. Москва, дом 5")).toBe("[ADDRESS], [ADDRESS]");
  });

  it("keeps technical error messages intact", () => {
    const msg = 'column "estimate_id" of relation "estimate_lines" does not exist (SQLSTATE 42703)';
    expect(scrubText(msg)).toBe(msg);
    const stack = "TypeError: Cannot read properties of undefined (reading 'id') at applyStages";
    expect(scrubText(stack)).toBe(stack);
  });
});

describe("scrubDeep", () => {
  it("scrubs nested strings, arrays and object keys", () => {
    const result = scrubDeep({
      "ivan@mail.ru": { list: ["+79123456789", 42, null] },
    }) as Record<string, unknown>;
    expect(result).toEqual({ "[EMAIL]": { list: ["[PHONE]", 42, null] } });
  });

  it("survives circular references", () => {
    const obj: Record<string, unknown> = { a: "x@y.ru" };
    obj.self = obj;
    const result = scrubDeep(obj) as Record<string, unknown>;
    expect(result.a).toBe("[EMAIL]");
    expect(result.self).toBe("[CIRCULAR]");
  });

  it("caps recursion depth", () => {
    type Nested = { child?: Nested };
    const root: Nested = {};
    let cursor = root;
    for (let i = 0; i < 20; i++) {
      cursor.child = {};
      cursor = cursor.child;
    }
    expect(() => scrubDeep(root)).not.toThrow();
  });
});

describe("scrubErrorEvent", () => {
  it("scrubs message, exception values and breadcrumbs but keeps stack frames", () => {
    const event = {
      message: "failed for ivan@mail.ru",
      exception: {
        values: [
          {
            type: "Error",
            value: "user +79123456789 not found",
            stacktrace: {
              frames: [
                { filename: "app.js", function: "loadUser", lineno: 10, vars: { email: "a@b.ru" } },
              ],
            },
          },
        ],
      },
      breadcrumbs: [
        { message: "clicked ivan@mail.ru", data: { url: "/x?token=abc123" } },
      ],
    };

    const result = scrubErrorEvent(event) as typeof event;
    expect(result.message).toBe("failed for [EMAIL]");
    expect(result.exception.values[0].value).toBe("user [PHONE] not found");
    const frame = result.exception.values[0].stacktrace.frames[0] as Record<string, unknown>;
    expect(frame.filename).toBe("app.js");
    expect(frame.function).toBe("loadUser");
    expect(frame.vars).toBeUndefined();
    expect(result.breadcrumbs[0].message).toBe("clicked [EMAIL]");
    expect(result.breadcrumbs[0].data).toEqual({ url: "/x?token=[FILTERED]" });
  });

  it("reduces user to id only and strips cookies/headers", () => {
    const event = {
      user: { id: "uuid-1", email: "ivan@mail.ru", ip_address: "1.2.3.4" },
      request: {
        url: "https://rovno.ai/home?access_token=abc",
        cookies: "sb-token=secret",
        headers: {
          Authorization: "Bearer eyJa.aaaa.bbbb",
          "User-Agent": "Mozilla/5.0",
        },
      },
      tags: { contact: "ivan@mail.ru" },
      extra: { note: "тел 89123456789" },
    };

    const result = scrubErrorEvent(event) as Record<string, never> & typeof event;
    expect(result.user).toEqual({ id: "uuid-1" });
    expect(result.request.url).toBe("https://rovno.ai/home?access_token=[FILTERED]");
    expect(result.request.cookies).toBeUndefined();
    expect(result.request.headers.Authorization).toBeUndefined();
    expect(result.request.headers["User-Agent"]).toBe("Mozilla/5.0");
    expect(result.tags.contact).toBe("[EMAIL]");
    expect(result.extra.note).toBe("тел [PHONE]");
  });

  it("handles breadcrumbs wrapped in {values} and missing sections", () => {
    const event = {
      breadcrumbs: { values: [{ message: "go a@b.ru" }] },
    };
    const result = scrubErrorEvent(event) as { breadcrumbs: { values: [{ message: string }] } };
    expect(result.breadcrumbs.values[0].message).toBe("go [EMAIL]");
    expect(() => scrubErrorEvent({})).not.toThrow();
  });
});

describe("scrubEventSafe", () => {
  it("returns the scrubbed event on success", () => {
    const result = scrubEventSafe({ message: "hi a@b.ru" });
    expect(result).toEqual({ message: "hi [EMAIL]" });
  });

  it("fail-closed: drops the event when scrubbing throws", () => {
    const poisoned: Record<string, unknown> = {};
    Object.defineProperty(poisoned, "message", {
      enumerable: true,
      get() {
        throw new Error("boom");
      },
    });
    expect(scrubEventSafe(poisoned)).toBeNull();
  });
});
