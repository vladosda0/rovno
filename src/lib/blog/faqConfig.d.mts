// Type surface for the shared plain-ESM FAQ extractor (faqConfig.mjs).

export interface FaqItem {
  question: string;
  answer: string;
}

export declare function extractFaqItems(doc: unknown): FaqItem[];
export declare function faqPageJsonLd(items: FaqItem[] | null | undefined): object | null;
export declare function faqJsonLdFromDoc(doc: unknown): object | null;
