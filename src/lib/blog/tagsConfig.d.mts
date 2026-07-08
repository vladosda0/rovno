// Type surface for the shared plain-ESM tag-hub helpers (tagsConfig.mjs).

export interface TagHub {
  slug: string;
  name: string;
  count: number;
}

/** Structural: only `tags` is read, so BlogPost and the prerenderer's row both fit. */
export interface TaggedPost {
  tags: string[];
}

export declare const MIN_INDEXABLE_TAG_POSTS: number;
export declare function pluralizeRu(n: number, forms: [string, string, string]): string;
export declare function tagSlug(tag: string): string;
export declare function tagPath(tag: string): string;
export declare function postsForTagSlug<T extends TaggedPost>(posts: T[], slug: string): T[];
export declare function tagNamesForSlug<T extends TaggedPost>(posts: T[], slug: string): string[];
export declare function collectTagHubs<T extends TaggedPost>(posts: T[]): TagHub[];
export declare function isIndexableTag(postCount: number): boolean;

export interface RelatablePost extends TaggedPost {
  slug: string;
}
export declare function relatedPosts<T extends RelatablePost>(
  posts: T[],
  slug: string,
  tags: string[],
  limit?: number,
): T[];
