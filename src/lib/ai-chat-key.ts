// Deterministic chat-memory key for cross-channel session sharing.
//
// Web (this module), the Telegram bot in rovno-bots, and the SQL helper
// public.resolve_ai_chat_key in rovno-db must all produce the SAME UUID
// for the same (profile_id, project_id) pair. Any drift between the three
// would silently split the user's memory across channels.
//
// Algorithm: RFC 4122 §4.3 UUIDv5 with SHA-1, namespace fixed at
//   '5b1a2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d'
// name = `${profileId}:${projectId}` (no padding, no whitespace).
//
// Same namespace and name format as:
//   * SQL helper public._ai_chat_key_uuid_v5 in
//     rovno-db/supabase/migrations/20260513140000_p0_derived_chat_key_for_ai_sessions.sql
//   * TS helper packages/core/src/memoryKey.ts in rovno-bots (Telegram bot).

const NAMESPACE = "5b1a2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";

/** Resolve the canonical chat_id for an (auth profile, project) pair. */
export async function resolveAiChatKey(
  profileId: string,
  projectId: string,
): Promise<string> {
  return await uuidV5(NAMESPACE, `${profileId}:${projectId}`);
}

/** RFC 4122 §4.3 UUIDv5. SHA-1 via the platform Web Crypto API. */
export async function uuidV5(namespace: string, name: string): Promise<string> {
  const nsBytes = uuidToBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);

  const message = new Uint8Array(nsBytes.length + nameBytes.length);
  message.set(nsBytes, 0);
  message.set(nameBytes, nsBytes.length);

  const hashBuf = await crypto.subtle.digest("SHA-1", message);
  const out = new Uint8Array(hashBuf).slice(0, 16);

  // Version 5: high nibble of byte 6 = 0x5.
  out[6] = (out[6] & 0x0f) | 0x50;
  // RFC 4122 variant: high two bits of byte 8 = 0b10.
  out[8] = (out[8] & 0x3f) | 0x80;

  return bytesToUuid(out);
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`invalid uuid: ${uuid}`);
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  if (bytes.length !== 16) {
    throw new Error(`expected 16 bytes, got ${bytes.length}`);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
