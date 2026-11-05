import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const shell = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

describe("document referrer policy", () => {
  it("sends only the origin, even on a same-origin load of a page whose URL carries a token", () => {
    const policies = [...shell.matchAll(/<meta\s+name="referrer"\s+content="([^"]*)"\s*\/?>/g)].map((m) => m[1]);
    expect(policies).toEqual(["strict-origin"]);
  });

  it("is declared before the first script, so the host redirect already carries it", () => {
    const policyAt = shell.search(/<meta\s+name="referrer"/);
    expect(policyAt).toBeGreaterThan(-1);
    expect(policyAt).toBeLessThan(shell.indexOf("<script"));
  });
});
