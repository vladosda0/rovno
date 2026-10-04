import { describe, expect, it } from "vitest";

import { importOptional, isOptionalImportPending } from "@/lib/observability/optional-import";

describe("importOptional", () => {
  it("is pending only while the loader runs, and returns its module", async () => {
    let release!: (value: { default: number }) => void;
    const loading = importOptional(
      () => new Promise<{ default: number }>((resolve) => (release = resolve)),
    );

    expect(isOptionalImportPending()).toBe(true);
    release({ default: 7 });

    await expect(loading).resolves.toEqual({ default: 7 });
    expect(isOptionalImportPending()).toBe(false);
  });

  it("stops being pending when the loader rejects, and passes the rejection on", async () => {
    const failure = new TypeError("Failed to fetch dynamically imported module");

    await expect(importOptional(() => Promise.reject(failure))).rejects.toBe(failure);

    expect(isOptionalImportPending()).toBe(false);
  });

  it("stays pending until the last of two overlapping loaders settles", async () => {
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const first = importOptional(() => new Promise<void>((resolve) => (releaseFirst = resolve)));
    const second = importOptional(() => new Promise<void>((resolve) => (releaseSecond = resolve)));

    releaseFirst();
    await first;
    expect(isOptionalImportPending()).toBe(true);

    releaseSecond();
    await second;
    expect(isOptionalImportPending()).toBe(false);
  });
});
