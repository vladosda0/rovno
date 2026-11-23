// site-redesign 1.3: the link card and the web manifest.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const publicFile = (name: string) => path.resolve(process.cwd(), "public", name);

describe("link card and manifest (1.3)", () => {
  it("og-image.png exists and is 1200x630", () => {
    const png = readFileSync(publicFile("og-image.png"));
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it("the manifest carries start_url, scope, lang and description", () => {
    const manifest = JSON.parse(readFileSync(publicFile("site.webmanifest"), "utf8"));
    expect(manifest.start_url).toBe("/home");
    expect(manifest.scope).toBe("/");
    expect(manifest.lang).toBe("ru");
    expect(manifest.description).toMatch(/стройк/);
  });
});
