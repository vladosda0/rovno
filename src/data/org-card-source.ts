import type { ClientInfo, OrgCard } from "@/types/org-card";

const ORG_CARD_KEY_PREFIX = "rovno.orgCard.v1.";
const CLIENT_INFO_KEY_PREFIX = "rovno.clientInfo.v1.";

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

export async function getOrgCard(orgId: string | null | undefined): Promise<OrgCard | null> {
  if (!orgId) return null;
  const storage = getStorage();
  if (!storage) return null;
  return safeParse<OrgCard>(storage.getItem(`${ORG_CARD_KEY_PREFIX}${orgId}`));
}

export async function setOrgCard(orgId: string, card: OrgCard): Promise<void> {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(`${ORG_CARD_KEY_PREFIX}${orgId}`, JSON.stringify(card));
}

export async function getClientInfo(projectId: string | null | undefined): Promise<ClientInfo | null> {
  if (!projectId) return null;
  const storage = getStorage();
  if (!storage) return null;
  return safeParse<ClientInfo>(storage.getItem(`${CLIENT_INFO_KEY_PREFIX}${projectId}`));
}

export async function setClientInfo(projectId: string, info: ClientInfo): Promise<void> {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(`${CLIENT_INFO_KEY_PREFIX}${projectId}`, JSON.stringify(info));
}
