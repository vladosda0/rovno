import { describe, expect, it } from "vitest";
import {
  MIN_INDEXABLE_TAG_POSTS,
  collectTagHubs,
  isIndexableTag,
  postsForTagSlug,
  tagNamesForSlug,
  tagPath,
  tagSlug,
  relatedPosts,
  pluralizeRu,
} from "./tagsConfig.mjs";

const post = (id: string, ...tags: string[]) => ({ id, tags });

describe("tagSlug / tagPath", () => {
  it("transliterates a Russian tag", () => {
    expect(tagSlug("закупки")).toBe("zakupki");
    expect(tagSlug("Смета")).toBe("smeta");
    expect(tagPath("закупки")).toBe("/blog/tag/zakupki/");
  });

  it("returns empty for a tag that transliterates to nothing", () => {
    expect(tagSlug("!!!")).toBe("");
  });
});

describe("postsForTagSlug", () => {
  const posts = [post("a", "стройка", "смета"), post("b", "смета"), post("c", "AI")];

  it("matches on the slug, not the tag text", () => {
    expect(postsForTagSlug(posts, "smeta").map((p) => p.id)).toEqual(["a", "b"]);
    expect(postsForTagSlug(posts, "ai").map((p) => p.id)).toEqual(["c"]);
  });

  it("returns [] for an unknown or empty slug", () => {
    expect(postsForTagSlug(posts, "nope")).toEqual([]);
    expect(postsForTagSlug(posts, "")).toEqual([]);
    expect(postsForTagSlug([], "smeta")).toEqual([]);
  });

  it("serves BOTH tags when two distinct tags transliterate alike", () => {
    // Otherwise one tag silently shadows the other and its posts vanish.
    const collided = [post("x", "смета"), post("y", "Смета")];
    expect(postsForTagSlug(collided, "smeta").map((p) => p.id)).toEqual(["x", "y"]);
    expect(tagNamesForSlug(collided, "smeta")).toEqual(["смета", "Смета"]);
  });
});

describe("collectTagHubs", () => {
  it("counts posts per slug, most-used first", () => {
    const posts = [post("a", "смета", "стройка"), post("b", "смета"), post("c", "смета", "AI")];
    expect(collectTagHubs(posts)).toEqual([
      { slug: "smeta", name: "смета", count: 3 },
      { slug: "ai", name: "AI", count: 1 },
      { slug: "stroyka", name: "стройка", count: 1 },
    ]);
  });

  it("drops tags that cannot have a URL", () => {
    expect(collectTagHubs([post("a", "!!!", "смета")]).map((h) => h.slug)).toEqual(["smeta"]);
  });

  it("handles posts with no tags", () => {
    expect(collectTagHubs([{ id: "a", tags: [] }])).toEqual([]);
    expect(collectTagHubs([])).toEqual([]);
  });
});

describe("isIndexableTag (thin-content rule)", () => {
  it("requires real depth before a tag page may be indexed", () => {
    expect(MIN_INDEXABLE_TAG_POSTS).toBe(2);
    expect(isIndexableTag(0)).toBe(false);
    expect(isIndexableTag(1)).toBe(false);
    expect(isIndexableTag(2)).toBe(true);
    expect(isIndexableTag(9)).toBe(true);
  });
});

describe("relatedPosts (cluster linking)", () => {
  const p = (slug: string, ...tags: string[]) => ({ slug, tags });
  const all = [p("new1", "ai"), p("new2", "финансы"), p("same1", "смета"), p("same2", "смета", "ai")];

  it("puts same-tag articles first, then the newest of the rest", () => {
    expect(relatedPosts(all, "current", ["смета"], 3).map((x) => x.slug)).toEqual([
      "same1", "same2", "new1",
    ]);
  });

  it("excludes the current article", () => {
    expect(relatedPosts([...all, p("current", "смета")], "current", ["смета"], 4).map((x) => x.slug))
      .not.toContain("current");
  });

  it("falls back to newest-first when the article has no tags", () => {
    expect(relatedPosts(all, "current", [], 2).map((x) => x.slug)).toEqual(["new1", "new2"]);
  });

  it("respects the limit and tolerates empty input", () => {
    expect(relatedPosts(all, "current", ["смета"], 1).map((x) => x.slug)).toEqual(["same1"]);
    expect(relatedPosts([], "current", ["смета"])).toEqual([]);
  });

  it("preserves newest-first order inside each group", () => {
    const ordered = [p("b", "смета"), p("a", "смета")];
    expect(relatedPosts(ordered, "x", ["смета"]).map((x) => x.slug)).toEqual(["b", "a"]);
  });
});

describe("pluralizeRu", () => {
  const f: [string, string, string] = ["статья", "статьи", "статей"];
  it("handles the three Russian forms", () => {
    expect([1, 2, 3, 4, 5, 9, 10].map((n) => pluralizeRu(n, f))).toEqual([
      "статья", "статьи", "статьи", "статьи", "статей", "статей", "статей",
    ]);
  });
  it("handles the 11-14 exception", () => {
    expect([11, 12, 13, 14].map((n) => pluralizeRu(n, f))).toEqual(
      ["статей", "статей", "статей", "статей"],
    );
  });
  it("handles the twenties (21 статья, 22 статьи, 25 статей)", () => {
    expect([21, 22, 24, 25].map((n) => pluralizeRu(n, f))).toEqual(
      ["статья", "статьи", "статьи", "статей"],
    );
  });
  it("handles 0, 100, 101, 111", () => {
    expect([0, 100, 101, 111].map((n) => pluralizeRu(n, f))).toEqual(
      ["статей", "статей", "статья", "статей"],
    );
  });
});

describe("collectTagHubs counts DISTINCT posts, not tag occurrences", () => {
  it("two tag texts that slugify alike count the post once", () => {
    // "приёмка" and "приемка" both -> priemka. Counting occurrences made a
    // one-post hub look like a two-post hub, so the sitemap advertised a URL that
    // the same build stamped `noindex`.
    const hubs = collectTagHubs([{ id: "a", tags: ["приёмка", "приемка"] }]);
    expect(hubs).toEqual([{ slug: "priemka", name: "приёмка", count: 1 }]);
    expect(isIndexableTag(hubs[0].count)).toBe(false);
    expect(postsForTagSlug([{ id: "a", tags: ["приёмка", "приемка"] }], "priemka")).toHaveLength(1);
  });

  it("the hub count matches postsForTagSlug for every hub", () => {
    const posts = [
      { id: "a", tags: ["смета", "Смета"] },
      { id: "b", tags: ["смета"] },
      { id: "c", tags: ["ai"] },
    ];
    for (const hub of collectTagHubs(posts)) {
      expect(hub.count, hub.slug).toBe(postsForTagSlug(posts, hub.slug).length);
    }
  });

  it("an exact duplicate tag on one post still counts once", () => {
    expect(collectTagHubs([{ id: "a", tags: ["смета", "смета"] }])[0].count).toBe(1);
  });
});

describe("relatedPosts matches by slug, exactly as the hubs do", () => {
  // The UNRELATED post must come FIRST in the fixture. Both of these tests originally
  // listed the related post first, so `relatedPosts` returned the input order whether it
  // matched on slug or on raw text — they passed against the very implementation they
  // were written to reject. An assertion that cannot fail is not a test.

  it("treats ё/е variants of the same tag as related", () => {
    // They share /blog/tag/priemka/, so "Читать ещё" must agree with the hub.
    const posts = [{ slug: "other", tags: ["ai"] }, { slug: "sibling", tags: ["приемка"] }];
    // Raw-text matching sees "приёмка" !== "приемка" and leaves the input order.
    expect(relatedPosts(posts, "current", ["приёмка"], 2).map((p) => p.slug)).toEqual(["sibling", "other"]);
  });

  it("ignores tags with no URL when deciding relatedness", () => {
    // "!!!" slugifies to "", so it links nowhere and must not make anything related.
    const posts = [{ slug: "y", tags: ["смета"] }, { slug: "x", tags: ["!!!"] }];
    // Raw-text matching would promote `x` (its literal tag matches); slug matching
    // finds no usable tag on the current article and falls back to newest-first.
    expect(relatedPosts(posts, "cur", ["!!!"], 2).map((p) => p.slug)).toEqual(["y", "x"]);
  });
});
