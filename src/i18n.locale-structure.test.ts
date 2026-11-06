import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const LANGUAGES = ["ru", "en"] as const;

function localeText(language: (typeof LANGUAGES)[number]): string {
  return readFileSync(resolve(__dirname, "locales", `${language}.json`), "utf8");
}

/**
 * Keys written more than once in the same object. Read from the raw text, because
 * JSON.parse keeps only the last occurrence and the duplicate is gone by then.
 */
function duplicateKeys(text: string): string[] {
  const duplicates: string[] = [];
  const scopes: Set<string>[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "{") scopes.push(new Set());
    if (char === "}") scopes.pop();
    if (char !== '"') {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < text.length && text[end] !== '"') end += text[end] === "\\" ? 2 : 1;
    if (end >= text.length) throw new Error(`unterminated string at ${index}`);
    let next = end + 1;
    while (/\s/.test(text[next] ?? "")) next += 1;
    const scope = scopes[scopes.length - 1];
    if (text[next] === ":" && scope) {
      const key = JSON.parse(text.slice(index, end + 1)) as string;
      if (scope.has(key)) duplicates.push(key);
      scope.add(key);
    }
    index = end + 1;
  }
  return duplicates;
}

function emptyValues(tree: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) return emptyValues(value as Record<string, unknown>, path);
    return value === "" ? [path] : [];
  });
}

describe("locale file structure", () => {
  it("finds a duplicate key in the same object, and only there", () => {
    expect(duplicateKeys('{"a": "x", "b": "y", "a": "z"}')).toEqual(["a"]);
    expect(duplicateKeys('{"a": "said \\"a\\": twice", "n": {"a": "x"}, "b": ["a", "a"]}')).toEqual([]);
    expect(duplicateKeys('{"n": {"a": "x", "a": "y"}}')).toEqual(["a"]);
    expect(duplicateKeys('{"a": "q\\", \\"a\\": \\"r"}')).toEqual([]);
    expect(() => duplicateKeys('{"a": "x')).toThrow("unterminated string");
  });

  it.each(LANGUAGES)("has no key written twice in %s.json", (language) => {
    expect(duplicateKeys(localeText(language))).toEqual([]);
  });

  it.each(LANGUAGES)("has no empty translation in %s.json", (language) => {
    expect(emptyValues(JSON.parse(localeText(language)) as Record<string, unknown>)).toEqual([]);
  });
});
