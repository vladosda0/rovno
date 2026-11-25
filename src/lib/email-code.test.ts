import { describe, expect, it } from "vitest";
import { isJustConfirmed } from "@/lib/email-code";

describe("isJustConfirmed", () => {
  it.each([
    [{ email_confirmed_at: "2026-10-29T15:00:00Z", last_sign_in_at: "2026-10-29T15:00:01Z" }, true],
    [{ email_confirmed_at: "2026-01-10T10:00:00Z", last_sign_in_at: "2026-10-29T15:00:01Z" }, false],
    [{ email_confirmed_at: undefined, last_sign_in_at: "2026-10-29T15:00:01Z" }, false],
    [{ email_confirmed_at: "2026-10-29T15:00:00Z", last_sign_in_at: undefined }, false],
    [{ email_confirmed_at: "not a date", last_sign_in_at: "2026-10-29T15:00:01Z" }, false],
  ])("%j -> %s", (user, expected) => {
    expect(isJustConfirmed(user)).toBe(expected);
  });
});
