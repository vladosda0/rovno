export declare const INDEXNOW_KEY: string;
export declare const INDEXNOW_HOST: string;
export declare const INDEXNOW_ENDPOINT: string;
export declare const INDEXNOW_BATCH: number;
export declare function sitemapUrls(xml: string, options?: { since?: string | null; prefix?: string | null }): string[];
export declare function indexNowBodies(urls: string[]): Array<{ host: string; key: string; keyLocation: string; urlList: string[] }>;
