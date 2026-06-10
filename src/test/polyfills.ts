// Web Storage polyfill for the test environment.
//
// Node 23+ ships an experimental global `localStorage`/`sessionStorage` that is
// `undefined` unless the process is started with `--localstorage-file`. When the
// test runner is launched under such a Node (the git pre-commit hook forces a
// Homebrew Node via PATH, currently v26), that global shadows jsdom's Storage and
// leaves `localStorage`/`sessionStorage` undefined. Any module that reads storage
// at import time (e.g. `@/i18n`) then crashes during test setup.
//
// This module installs a minimal in-memory Storage when a usable one is not
// present. It is a no-op when jsdom already provides Storage (the normal case on
// Node 22), so it never alters otherwise-passing runs. It must be imported before
// any application module — keep it first in `setupFiles` / `setup.ts`.

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

function ensureStorage(name: "localStorage" | "sessionStorage"): void {
  let working = false;
  try {
    const existing = (globalThis as Record<string, unknown>)[name] as Storage | undefined | null;
    working = !!existing && typeof existing.getItem === "function";
  } catch {
    working = false;
  }
  if (working) return;

  const storage = new MemoryStorage();
  try {
    Object.defineProperty(globalThis, name, { value: storage, configurable: true, writable: true });
  } catch {
    (globalThis as Record<string, unknown>)[name] = storage;
  }
}

ensureStorage("localStorage");
ensureStorage("sessionStorage");
