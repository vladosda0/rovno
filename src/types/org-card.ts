export interface OrgCard {
  legalName: string;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  legalAddress?: string;
  postalAddress?: string;
  bankName?: string;
  bankAccount?: string;
  correspondentAccount?: string;
  bik?: string;
  phone?: string;
  email?: string;
  signatoryName?: string;
  signatoryPosition?: string;
}

export interface ClientInfo {
  name: string;
  isLegalEntity?: boolean;
  inn?: string;
  address?: string;
  phone?: string;
  email?: string;
  signatoryName?: string;
}

export const EMPTY_ORG_CARD: OrgCard = { legalName: "" };
export const EMPTY_CLIENT_INFO: ClientInfo = { name: "" };

export function orgCardHasRequiredFields(card: OrgCard | null | undefined): boolean {
  if (!card) return false;
  return Boolean(card.legalName?.trim() && card.signatoryName?.trim());
}

export function clientInfoHasRequiredFields(info: ClientInfo | null | undefined): boolean {
  if (!info) return false;
  return Boolean(info.name?.trim());
}
