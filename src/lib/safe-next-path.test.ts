import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-next-path";

describe("safeNextPath", () => {
  it.each([
    ["/invite/accept/token-123", "/invite/accept/token-123"],
    ["/billing/checkout?plan=pro&period=year", "/billing/checkout?plan=pro&period=year"],
    ["/share/estimate/abc#totals", "/share/estimate/abc#totals"],
    ["/", "/"],
    ["/a/../b", "/b"],
  ])("keeps the same-origin path %s", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });

  it.each([
    ["//evil.example"],
    ["//evil.example/path"],
    ["/\\evil.example"],
    ["/\\/evil.example"],
    ["/\t/evil.example"],
    ["/\n/evil.example"],
    ["/\r/evil.example"],
    ["//["],
    ["/.//evil.example"],
    ["/..//evil.example"],
    ["/x/..//evil.example"],
    ["/%2e//evil.example"],
    ["/./\\evil.example"],
    ["/.\t//evil.example"],
    ["/.//"],
    ["https://evil.example"],
    ["javascript:alert(1)"],
    ["evil.example"],
    [""],
    [null],
  ])("rejects %j", (next) => {
    expect(safeNextPath(next)).toBeNull();
  });

  it("does not return a path starting with // for these inputs", () => {
    for (const next of ["/.//evil.example/x", "/a/..//evil.example", "/./\\/evil.example/p?x=1#h", "/a//b", "/x?y=//z"]) {
      expect(safeNextPath(next)?.startsWith("//") ?? false).toBe(false);
    }
  });
});
