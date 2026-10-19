import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientInfo, OrgCard } from "@/types/org-card";

// Requisites live in rovno-db since task rovno#226: org_requisites (one per
// organization), profile_requisites (one per profile, for people without an
// organization) and project_client_info (one per project). localStorage keeps
// the demo/local workspaces working and is the one-time migration source:
// the old keys are read only while the server has no row, and are not deleted
// (rollback until the next prod release, agent decision 4).

const ORG_CARD_KEY_PREFIX = "rovno.orgCard.v1.";
const CLIENT_INFO_KEY_PREFIX = "rovno.clientInfo.v1.";

export type OrgCardScope =
  | { kind: "org"; orgId: string; canEdit: boolean }
  | { kind: "profile"; profileId: string; projectId: string | null }
  | { kind: "device"; key: string };

export function orgCardScopeKey(scope: OrgCardScope | null): string {
  if (!scope) return "none";
  if (scope.kind === "org") return `org:${scope.orgId}`;
  if (scope.kind === "profile") return `profile:${scope.profileId}`;
  return `device:${scope.key}`;
}

export function canEditOrgCard(scope: OrgCardScope | null): boolean {
  return scope ? scope.kind !== "org" || scope.canEdit : false;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readLocal<T>(key: string): T | null {
  return safeParse<T>(getStorage()?.getItem(key) ?? null);
}

function writeLocal(key: string, value: unknown) {
  getStorage()?.setItem(key, JSON.stringify(value));
}

/** The localStorage key a scope used before the move to the server. */
function legacyOrgCardKey(scope: OrgCardScope): string | null {
  if (scope.kind === "org") return `${ORG_CARD_KEY_PREFIX}${scope.orgId}`;
  if (scope.kind === "device") return `${ORG_CARD_KEY_PREFIX}${scope.key}`;
  return scope.projectId ? `${ORG_CARD_KEY_PREFIX}local:${scope.projectId}` : null;
}

const ORG_COLUMNS =
  "legal_name, inn, kpp, ogrn, legal_address, postal_address, bank_name, bank_account, correspondent_account, bik, phone, email, signatory_name, signatory_position";
const CLIENT_COLUMNS = "name, is_legal_entity, inn, address, phone, email, signatory_name";

type OrgRow = Record<string, string | null>;
interface ClientRow {
  name: string | null;
  is_legal_entity: boolean;
  inn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  signatory_name: string | null;
}

const ORG_FIELDS: Array<[keyof OrgCard, string]> = [
  ["inn", "inn"],
  ["kpp", "kpp"],
  ["ogrn", "ogrn"],
  ["legalAddress", "legal_address"],
  ["postalAddress", "postal_address"],
  ["bankName", "bank_name"],
  ["bankAccount", "bank_account"],
  ["correspondentAccount", "correspondent_account"],
  ["bik", "bik"],
  ["phone", "phone"],
  ["email", "email"],
  ["signatoryName", "signatory_name"],
  ["signatoryPosition", "signatory_position"],
];

const blankToNull = (value: string | undefined | null) => (value && value.trim() ? value : null);

export function orgRowToCard(row: OrgRow): OrgCard {
  const card: OrgCard = { legalName: row.legal_name ?? "" };
  for (const [field, column] of ORG_FIELDS) {
    const value = row[column];
    if (value) (card as unknown as Record<string, string>)[field] = value;
  }
  return card;
}

export function orgCardToRow(card: OrgCard): OrgRow {
  const row: OrgRow = { legal_name: blankToNull(card.legalName) };
  for (const [field, column] of ORG_FIELDS) row[column] = blankToNull(card[field] as string | undefined);
  return row;
}

export function clientRowToInfo(row: ClientRow): ClientInfo {
  const info: ClientInfo = { name: row.name ?? "" };
  if (row.is_legal_entity) info.isLegalEntity = true;
  if (row.inn) info.inn = row.inn;
  if (row.address) info.address = row.address;
  if (row.phone) info.phone = row.phone;
  if (row.email) info.email = row.email;
  if (row.signatory_name) info.signatoryName = row.signatory_name;
  return info;
}

export function clientInfoToRow(info: ClientInfo): ClientRow {
  return {
    name: blankToNull(info.name),
    is_legal_entity: info.isLegalEntity === true,
    inn: blankToNull(info.inn),
    address: blankToNull(info.address),
    phone: blankToNull(info.phone),
    email: blankToNull(info.email),
    signatory_name: blankToNull(info.signatoryName),
  };
}

function orgTarget(scope: Exclude<OrgCardScope, { kind: "device" }>) {
  return scope.kind === "org"
    ? { table: "org_requisites", column: "org_id", id: scope.orgId }
    : { table: "profile_requisites", column: "profile_id", id: scope.profileId };
}

async function upsertOrgCard(
  client: SupabaseClient,
  scope: Exclude<OrgCardScope, { kind: "device" }>,
  card: OrgCard,
) {
  const target = orgTarget(scope);
  const { error } = await client
    .from(target.table)
    .upsert({ [target.column]: target.id, ...orgCardToRow(card) }, { onConflict: target.column });
  if (error) throw error;
}

/** Writes the browser copy only if the server has no row yet, then returns what the server holds. */
async function moveOrgCardOnce(
  client: SupabaseClient,
  scope: Exclude<OrgCardScope, { kind: "device" }>,
  card: OrgCard,
): Promise<OrgCard> {
  const target = orgTarget(scope);
  const { error } = await client
    .from(target.table)
    .upsert({ [target.column]: target.id, ...orgCardToRow(card) }, { onConflict: target.column, ignoreDuplicates: true });
  if (error) return card;
  const { data } = await client.from(target.table).select(ORG_COLUMNS).eq(target.column, target.id).maybeSingle();
  return data ? orgRowToCard(data as OrgRow) : card;
}

/** INN from the organization's business card, used when the requisites have none (agent decision 2). */
async function readVisitkaInn(client: SupabaseClient, orgId: string): Promise<string | null> {
  const { data, error } = await client
    .from("contractor_profiles")
    .select("inn")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) return null;
  const inn = (data as { inn?: string | null } | null)?.inn;
  return inn && inn.trim() ? inn.trim() : null;
}

export async function loadOrgCard(client: SupabaseClient, scope: OrgCardScope): Promise<OrgCard | null> {
  if (scope.kind === "device") return readLocal<OrgCard>(`${ORG_CARD_KEY_PREFIX}${scope.key}`);

  const target = orgTarget(scope);
  const { data, error } = await client
    .from(target.table)
    .select(ORG_COLUMNS)
    .eq(target.column, target.id)
    .maybeSingle();
  if (error) throw error;

  let card: OrgCard | null = data ? orgRowToCard(data as OrgRow) : null;
  if (!card) {
    const legacyKey = legacyOrgCardKey(scope);
    const legacy = legacyKey ? readLocal<OrgCard>(legacyKey) : null;
    if (legacy && canEditOrgCard(scope)) {
      card = await moveOrgCardOnce(client, scope, legacy).catch(() => legacy);
    }
  }

  if (scope.kind === "org" && !card?.inn) {
    const inn = await readVisitkaInn(client, scope.orgId);
    if (inn) card = { ...(card ?? { legalName: "" }), inn };
  }
  return card;
}

export async function saveOrgCard(client: SupabaseClient, scope: OrgCardScope, card: OrgCard): Promise<void> {
  if (scope.kind === "device") {
    writeLocal(`${ORG_CARD_KEY_PREFIX}${scope.key}`, card);
    return;
  }
  if (!canEditOrgCard(scope)) return;
  await upsertOrgCard(client, scope, card);
}

export type ClientInfoScope = { kind: "server"; projectId: string } | { kind: "device"; projectId: string };

async function upsertClientInfo(client: SupabaseClient, projectId: string, info: ClientInfo) {
  const { error } = await client
    .from("project_client_info")
    .upsert({ project_id: projectId, ...clientInfoToRow(info) }, { onConflict: "project_id" });
  if (error) throw error;
}

export async function loadClientInfo(client: SupabaseClient, scope: ClientInfoScope): Promise<ClientInfo | null> {
  const legacyKey = `${CLIENT_INFO_KEY_PREFIX}${scope.projectId}`;
  if (scope.kind === "device") return readLocal<ClientInfo>(legacyKey);

  const { data, error } = await client
    .from("project_client_info")
    .select(CLIENT_COLUMNS)
    .eq("project_id", scope.projectId)
    .maybeSingle();
  if (error) throw error;
  if (data) return clientRowToInfo(data as ClientRow);

  const legacy = readLocal<ClientInfo>(legacyKey);
  if (!legacy) return null;
  const { error: moveError } = await client
    .from("project_client_info")
    .upsert({ project_id: scope.projectId, ...clientInfoToRow(legacy) }, { onConflict: "project_id", ignoreDuplicates: true });
  if (moveError) return legacy;
  const { data: moved } = await client
    .from("project_client_info")
    .select(CLIENT_COLUMNS)
    .eq("project_id", scope.projectId)
    .maybeSingle();
  return moved ? clientRowToInfo(moved as ClientRow) : legacy;
}

export async function saveClientInfo(client: SupabaseClient, scope: ClientInfoScope, info: ClientInfo): Promise<void> {
  if (scope.kind === "device") {
    writeLocal(`${CLIENT_INFO_KEY_PREFIX}${scope.projectId}`, info);
    return;
  }
  await upsertClientInfo(client, scope.projectId, info);
}
