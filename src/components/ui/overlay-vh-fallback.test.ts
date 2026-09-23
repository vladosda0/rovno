import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import postcss, { type Rule } from "postcss";
import tailwindcss from "tailwindcss";
import { describe, expect, it } from "vitest";

import tailwindConfig from "../../../tailwind.config";

// The overlay primitives clamp with `max-h-[100dvh]`. Chrome < 108 and Safari < 15.4
// drop a `dvh` declaration, so without a `vh` declaration emitted BEFORE it those
// engines get no clamp at all. It cannot be written as a second class: cn() collapses
// `max-h-[100vh] max-h-[100dvh]` into one. A call site's own `max-h-*` (base or
// responsive) must still come after the fallback, or the fallback would override it.
const CALL_SITE_CLASSES = "max-h-[100dvh] max-h-[85vh] sm:max-h-[90vh]";

// Every max-height declaration in source order, keyed by its rule's selector.
const maxHeightDecls = async () => {
  const source = readFileSync(resolve(__dirname, "../../index.css"), "utf8");
  const result = await postcss([
    tailwindcss({ ...tailwindConfig, content: [{ raw: CALL_SITE_CLASSES, extension: "html" }] }),
  ]).process(source, { from: undefined });
  const decls: string[] = [];
  result.root.walkDecls("max-height", (decl) => {
    decls.push(`${(decl.parent as Rule).selector} ${decl.value}`);
  });
  return decls;
};

describe("the dvh height clamp has a vh fallback for engines without dvh", () => {
  it("declares max-height: 100vh on .max-h-[100dvh] before the dvh value", async () => {
    const decls = await maxHeightDecls();
    const fallback = decls.indexOf(".max-h-\\[100dvh\\] 100vh");
    expect(fallback).toBeGreaterThanOrEqual(0);
    expect(decls.indexOf(".max-h-\\[100dvh\\] 100dvh")).toBeGreaterThan(fallback);
  });

  it("keeps a call site's own clamp winning over the fallback", async () => {
    const decls = await maxHeightDecls();
    const fallback = decls.indexOf(".max-h-\\[100dvh\\] 100vh");
    expect(fallback).toBeGreaterThanOrEqual(0);
    expect(decls.indexOf(".max-h-\\[85vh\\] 85vh")).toBeGreaterThan(fallback);
    expect(decls.indexOf(".sm\\:max-h-\\[90vh\\] 90vh")).toBeGreaterThan(fallback);
  });
});
