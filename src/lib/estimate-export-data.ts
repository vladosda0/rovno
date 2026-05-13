import type { ProjectMode, ResourceLineType } from "@/types/estimate-v2";

export type ExportVariant = "client_simple" | "client_signing" | "internal";

export interface ExportLineRow {
  id: string;
  title: string;
  type: ResourceLineType;
  typeLabel: string;
  qtyMilli: number;
  unit: string;
  costUnitCents: number;
  costTotalCents: number;
  markupBps: number;
  discountBps: number;
  clientUnitCents: number;
  clientTotalCents: number;
  discountedClientTotalCents: number | null;
}

export interface ExportWorkGroup {
  id: string;
  title: string;
  number: string;
  lines: ExportLineRow[];
}

export interface ExportStageGroup {
  id: string;
  title: string;
  number: number;
  works: ExportWorkGroup[];
}

export interface ExportTotals {
  subtotalBeforeDiscountCents: number;
  discountTotalCents: number;
  taxableBaseCents: number;
  vatBps: number;
  taxAmountCents: number;
  totalIncVatCents: number;
}

export interface ExportPayload {
  projectId: string;
  projectTitle: string;
  currency: string;
  projectMode: ProjectMode;
  hasSensitiveDetail: boolean;
  hasSummaryClientPricing: boolean;
  hasDiscountedClientTotal: boolean;
  stages: ExportStageGroup[];
  totals: ExportTotals;
  versionShareId: string | null;
  generatedAt: string;
}

export function formatExportMoney(cents: number, currency: string, locale = "ru-RU"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatExportQty(qtyMilli: number, locale = "ru-RU"): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(qtyMilli / 1000);
}

export function formatExportPercent(bps: number, locale = "ru-RU"): string {
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(bps / 100)}%`;
}

export function formatExportDate(iso: string, locale = "ru-RU"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function variantShowsCost(variant: ExportVariant): boolean {
  return variant === "internal";
}

export function variantShowsRequisites(variant: ExportVariant): boolean {
  return variant === "client_signing";
}

export function variantShowsSignatures(variant: ExportVariant): boolean {
  return variant === "client_signing";
}

export function variantCanShare(variant: ExportVariant): boolean {
  // Share-link copies the existing client-facing /share/estimate/:shareId URL,
  // which always hides cost/markup/discount. Only the "simple" client variant
  // is meant for online preview; "signing" is for print and "internal" is for
  // team use, so neither gets a share button.
  return variant === "client_simple";
}
