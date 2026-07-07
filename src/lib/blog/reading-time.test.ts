import { describe, expect, it } from "vitest";
import { countWords, formatReadingTime, readingTimeMinutes } from "./reading-time";

describe("countWords", () => {
  it("counts Cyrillic and latin words", () => {
    expect(countWords("Как вести смету в Excel")).toBe(5);
  });

  it("ignores punctuation-only tokens", () => {
    expect(countWords("Раз, два — три!")).toBe(3);
  });

  it("counts numbers as words", () => {
    expect(countWords("Топ 10 ошибок")).toBe(3);
  });

  it("returns 0 for empty/whitespace", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n ")).toBe(0);
  });
});

describe("readingTimeMinutes", () => {
  it("never returns less than a minute", () => {
    expect(readingTimeMinutes(0)).toBe(1);
    expect(readingTimeMinutes(50)).toBe(1);
  });

  it("rounds at 180 wpm", () => {
    expect(readingTimeMinutes(180)).toBe(1);
    expect(readingTimeMinutes(900)).toBe(5);
    expect(readingTimeMinutes(1000)).toBe(6);
  });
});

describe("formatReadingTime", () => {
  it("formats minutes in Russian", () => {
    expect(formatReadingTime(5)).toBe("5 мин чтения");
  });

  it("returns null for missing values", () => {
    expect(formatReadingTime(null)).toBeNull();
    expect(formatReadingTime(0)).toBeNull();
  });
});
