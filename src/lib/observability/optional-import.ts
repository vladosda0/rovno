/**
 * Marks a dynamic import whose failure the caller handles itself (an optional
 * SDK, an on-demand codec), so ./preload-recovery.ts does not answer it by
 * reloading the page and discarding whatever the user has typed.
 */

let pending = 0;

export function isOptionalImportPending(): boolean {
  return pending > 0;
}

export async function importOptional<T>(loader: () => Promise<T>): Promise<T> {
  pending += 1;
  try {
    return await loader();
  } finally {
    pending -= 1;
  }
}
