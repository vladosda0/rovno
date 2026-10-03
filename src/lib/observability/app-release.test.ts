import { describe, expect, it, vi } from "vitest";

import {
  releaseFromDocument,
  releaseLabel,
  resolveAppRelease,
} from "@/lib/observability/app-release";

const FULL_SHA = "0665d7b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7";

function sources(overrides: Partial<Parameters<typeof resolveAppRelease>[0]> = {}) {
  return {
    env: {},
    gitShortSha: () => "0665d7b",
    warn: vi.fn(),
    ...overrides,
  };
}

describe("resolveAppRelease", () => {
  it("prefers VITE_COMMIT_SHA over everything else", () => {
    const gitShortSha = vi.fn(() => "1111111");

    const release = resolveAppRelease(
      sources({ env: { VITE_COMMIT_SHA: "abc1234", GITHUB_SHA: FULL_SHA }, gitShortSha }),
    );

    expect(release).toBe("abc1234");
    expect(gitShortSha).not.toHaveBeenCalled();
  });

  it.each(["GITHUB_SHA", "CI_COMMIT_SHA", "SOURCE_COMMIT", "GIT_COMMIT"])(
    "reads the SHA a build platform injects as %s",
    (name) => {
      expect(resolveAppRelease(sources({ env: { [name]: FULL_SHA } }))).toBe("0665d7b");
    },
  );

  it("shortens a full SHA so one commit is one release wherever it was built", () => {
    expect(resolveAppRelease(sources({ env: { VITE_COMMIT_SHA: FULL_SHA } }))).toBe("0665d7b");
  });

  it("passes a tag or branch name through untouched", () => {
    expect(resolveAppRelease(sources({ env: { VITE_COMMIT_SHA: "v1.4.0" } }))).toBe("v1.4.0");
  });

  it("skips a blank variable and keeps looking", () => {
    expect(
      resolveAppRelease(sources({ env: { VITE_COMMIT_SHA: "   ", SOURCE_COMMIT: FULL_SHA } })),
    ).toBe("0665d7b");
  });

  it("falls back to git when the environment carries nothing", () => {
    const warn = vi.fn();

    expect(resolveAppRelease(sources({ gitShortSha: () => " 0665d7b\n", warn }))).toBe("0665d7b");
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns unknown and says why when git fails", () => {
    const warn = vi.fn();

    const release = resolveAppRelease(
      sources({
        gitShortSha: () => {
          throw new Error("fatal: not a git repository");
        },
        warn,
      }),
    );

    expect(release).toBe("unknown");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not a git repository"));
  });

  it("returns unknown and says why when git prints nothing", () => {
    const warn = vi.fn();

    expect(resolveAppRelease(sources({ gitShortSha: () => "", warn }))).toBe("unknown");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("releaseLabel", () => {
  const BUILT_AT = new Date("2026-10-03T07:05:09.123Z");

  it("keeps a resolved release as it is", () => {
    expect(releaseLabel("0665d7b", BUILT_AT)).toBe("0665d7b");
  });

  it("names an unresolved build by the minute it was built, in UTC", () => {
    expect(releaseLabel("unknown", BUILT_AT)).toBe("build-20261003T0705Z");
  });
});

describe("releaseFromDocument", () => {
  function documentWith(content: string | null): Pick<Document, "querySelector"> {
    const doc = document.implementation.createHTMLDocument("");
    if (content !== null) {
      const meta = doc.createElement("meta");
      meta.name = "rovno-release";
      meta.content = content;
      doc.head.appendChild(meta);
    }
    return doc;
  }

  it("prefers the label the build wrote into the document", () => {
    expect(releaseFromDocument(documentWith("build-20261003T0705Z"), "unknown")).toBe(
      "build-20261003T0705Z",
    );
  });

  it("falls back to the baked value when the document carries no label", () => {
    expect(releaseFromDocument(documentWith(null), "0665d7b")).toBe("0665d7b");
  });

  it("falls back to the baked value when the label is blank", () => {
    expect(releaseFromDocument(documentWith("  "), "0665d7b")).toBe("0665d7b");
  });

  it("falls back to the baked value outside a browser", () => {
    expect(releaseFromDocument(undefined, "0665d7b")).toBe("0665d7b");
  });
});
