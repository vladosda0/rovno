// Handing a question to Shurik from elsewhere on the page. The panel that takes it may not be
// mounted yet, so what is handed over waits here until it is.

const projectSeeds = new Map<string, string>();

/** A question to lie in the composer of a project's chat when that chat opens (docs-library 6.6). */
export function seedProjectComposer(projectId: string, text: string): void {
  projectSeeds.set(projectId, text);
}

export function takeProjectComposerSeed(projectId: string): string | undefined {
  const text = projectSeeds.get(projectId);
  projectSeeds.delete(projectId);
  return text;
}

/** A page of the base handing something to the chat outside a project (docs-library 6.7). */
export interface ShurikAsk {
  /** What is open: the document or the card. */
  label: string;
  quote?: string;
  question?: string;
}

let pendingAsk: ShurikAsk | null = null;
const askListeners = new Set<() => void>();

export function askShurik(ask: ShurikAsk): void {
  pendingAsk = ask;
  askListeners.forEach((listener) => listener());
}

export function takeShurikAsk(): ShurikAsk | null {
  const ask = pendingAsk;
  pendingAsk = null;
  return ask;
}

export function subscribeShurikAsk(listener: () => void): () => void {
  askListeners.add(listener);
  return () => {
    askListeners.delete(listener);
  };
}

/** The line a quote takes in a message, the same as «Спросить про этот пункт» under a source. */
export function shurikQuoteLine(quote: string, label?: string): string {
  return `«${quote}»${label ? ` · ${label}` : ""}\n`;
}
