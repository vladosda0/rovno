/**
 * Rejections that belong to a browser extension, not to this app.
 *
 * Crypto-wallet extensions inject a provider into every page and reject its
 * promises with a bare JSON-RPC object. Nothing in `src/` speaks JSON-RPC, so
 * these are somebody else's errors arriving on our unhandledrejection handler.
 */

/** EIP-1193 provider error codes, which sit outside the JSON-RPC range. */
const EIP1193_CODES = new Set([4001, 4100, 4200, 4900, 4901]);

/** JSON-RPC 2.0 reserved range for implementation-defined server errors. */
const JSONRPC_RESERVED_MIN = -32768;
const JSONRPC_RESERVED_MAX = -32000;

/**
 * Keyed on a NUMERIC `code`, which is what makes it safe: the only plain-object
 * throw in `src/` uses a string code (`"NO_SESSION"`), and PostgREST and
 * edge-function errors carry string codes too (`"42501"`, `"PGRST116"`).
 */
export function isWalletProviderRejection(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  // Plain objects only: an Error (or any class instance) has its own prototype,
  // which is what keeps a real thrown error out of here.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const { code, message } = value as { code?: unknown; message?: unknown };
  if (typeof code !== "number" || typeof message !== "string") return false;
  return (code >= JSONRPC_RESERVED_MIN && code <= JSONRPC_RESERVED_MAX) || EIP1193_CODES.has(code);
}
