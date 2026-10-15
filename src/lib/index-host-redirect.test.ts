import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Runs the inline host-redirect script at the top of index.html against a fake
// `location`, so the hosts it moves and the hosts it leaves alone are pinned.
const shell = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
const script = /<head>[\s\S]*?<script>([\s\S]*?)<\/script>/.exec(shell)?.[1] ?? "";

function run(url: string): string | null {
  const parsed = new URL(url);
  let target: string | null = null;
  const location = {
    protocol: parsed.protocol,
    host: parsed.host,
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
    replace: (next: string) => {
      target = next;
    },
  };
  new Function("location", script)(location);
  return target;
}

describe("index.html host redirect", () => {
  it("is the script it claims to be", () => {
    expect(script).toContain("location.replace");
  });

  it("sends every page of стройагент.рф to the same page on rovno.ai", () => {
    expect(run("https://стройагент.рф/")).toBe("https://rovno.ai/");
    expect(run("https://стройагент.рф/billing/checkout?plan=brigade#x")).toBe(
      "https://rovno.ai/billing/checkout?plan=brigade#x",
    );
    expect(run("https://www.стройагент.рф/blog/")).toBe("https://rovno.ai/blog/");
    expect(run("https://xn--80aggnxbnhjh.xn--p1ai/offer/")).toBe("https://rovno.ai/offer/");
    expect(run("http://стройагент.рф/offer/")).toBe("https://rovno.ai/offer/");
  });

  it("keeps the www -> apex redirect", () => {
    expect(run("https://www.rovno.ai/blog/?a=1#b")).toBe("https://rovno.ai/blog/?a=1#b");
  });

  it("leaves the canonical, staging and local hosts alone", () => {
    for (const url of [
      "https://rovno.ai/",
      "https://vladosda0-rovno-90e7.twc1.net/home",
      "https://vladosda0-rovno-91d8.twc1.net/",
      "http://localhost:8080/billing/success",
      "http://www.localhost:8080/",
    ]) {
      expect(run(url), url).toBeNull();
    }
  });
});
