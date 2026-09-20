import { describe, expect, it } from "vitest";
import { isWalletProviderRejection } from "./third-party-noise";

describe("isWalletProviderRejection", () => {
  it("matches the plain JSON-RPC objects wallet extensions reject with", () => {
    expect(isWalletProviderRejection({ code: -32603, message: "Internal JSON-RPC error" })).toBe(true);
    expect(isWalletProviderRejection({ code: -32000, message: "Invalid input" })).toBe(true);
    expect(isWalletProviderRejection({ code: -32768, message: "Reserved" })).toBe(true);
    expect(isWalletProviderRejection({ code: 4001, message: "User rejected the request." })).toBe(true);
    expect(isWalletProviderRejection({ code: 4900, message: "Disconnected" })).toBe(true);
  });

  it("leaves everything this codebase can produce alone", () => {
    expect(isWalletProviderRejection(new Error("Internal JSON-RPC error"))).toBe(false);
    // A real Error carries a stack worth reporting, whatever code is hung on it.
    expect(
      isWalletProviderRejection(Object.assign(new Error("Internal JSON-RPC error"), { code: -32603 })),
    ).toBe(false);
    expect(isWalletProviderRejection({ code: "NO_SESSION", message: "No authenticated session" })).toBe(false);
    expect(
      isWalletProviderRejection({ code: "42501", message: "permission denied", details: "", hint: "" }),
    ).toBe(false);
    expect(isWalletProviderRejection({ code: -31999, message: "outside the reserved range" })).toBe(false);
    expect(isWalletProviderRejection({ code: 4002, message: "not an EIP-1193 code" })).toBe(false);
    expect(isWalletProviderRejection({ code: "-32603", message: "a string code is not ours" })).toBe(false);
    expect(isWalletProviderRejection({ code: -32603 })).toBe(false);
    expect(isWalletProviderRejection("Internal JSON-RPC error")).toBe(false);
    expect(isWalletProviderRejection(null)).toBe(false);
    expect(isWalletProviderRejection(undefined)).toBe(false);
  });
});
