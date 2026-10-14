import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// The client report RPCs are not in the generated Database type yet, so they
// go through the untyped client, the same way document-share-source.ts does.
const rawSupabase = supabase as unknown as SupabaseClient;

export type ClientReportPlanCode = "free" | "master" | "brigade";
export type ClientReportRhythm = "weekly" | "monthly";
export type ClientReportStageState = "completed" | "in_progress" | "not_started";
export type ClientReportHideKey = "progress" | "stages";

export interface ClientReportQuota {
  plan_code: ClientReportPlanCode;
  rhythm: ClientReportRhythm;
  reminder_enabled: boolean;
  rhythm_locked: boolean;
  min_interval_days: number | null;
  custom_period_allowed: boolean;
  pdf_allowed: boolean;
  last_published_at: string | null;
  next_publish_at: string | null;
  can_publish: boolean;
}

export interface ClientReportDoneTask {
  id: string;
  title: string;
  completed_at: string | null;
}

export interface ClientReportTask {
  id: string;
  title: string;
}

export interface ClientReportNextTask {
  id: string;
  title: string;
  due_at: string | null;
}

export interface ClientReportProgress {
  done: number;
  total: number;
  pct: number;
}

export interface ClientReportStages {
  completed: number;
  total: number;
  items: Array<{ title: string; state: ClientReportStageState }>;
}

export interface ClientReportPreviewPhoto {
  id: string;
  task_id: string | null;
  caption: string | null;
}

export interface ClientReportPreview {
  project_title: string;
  prepared_by: string | null;
  period_start: string;
  period_end: string;
  body: {
    done: ClientReportDoneTask[];
    photos: ClientReportPreviewPhoto[];
    in_progress: ClientReportTask[];
    next: ClientReportNextTask[];
    progress: ClientReportProgress | null;
    stages: ClientReportStages | null;
  };
  quota: ClientReportQuota;
  link: { share_token: string; created_at: string } | null;
  last_report: {
    id: string;
    published_at: string;
    period_start: string;
    period_end: string;
    visible: boolean;
  } | null;
}

export interface ClientReportPublishInput {
  note: string;
  excludedTaskIds: string[];
  excludedMediaIds: string[];
  hide: ClientReportHideKey[];
  from: string | null;
  to: string | null;
}

export interface ClientReportPublishResult {
  report_id: string;
  published_at: string;
  share_token: string;
  quota: ClientReportQuota;
}

export type ClientReportErrorCode =
  | "client_report_limit"
  | "client_report_empty"
  | "client_report_note_too_long"
  | "client_report_rhythm_locked"
  | "client_report_bad_period";

const KNOWN_ERROR_CODES: readonly ClientReportErrorCode[] = [
  "client_report_limit",
  "client_report_empty",
  "client_report_note_too_long",
  "client_report_rhythm_locked",
  "client_report_bad_period",
];

/** The backend's named refusal, or null for anything else (network, 42501, 5xx). */
export function clientReportErrorCode(error: unknown): ClientReportErrorCode | null {
  if (!error || typeof error !== "object") return null;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return null;
  return KNOWN_ERROR_CODES.find((code) => message.includes(code)) ?? null;
}

/** `next_publish_at` from the JSON hint of a client_report_limit refusal. */
export function clientReportLimitNextPublishAt(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const hint = (error as { hint?: unknown }).hint;
  if (typeof hint !== "string") return null;
  try {
    const parsed = JSON.parse(hint) as { next_publish_at?: unknown };
    return typeof parsed.next_publish_at === "string" ? parsed.next_publish_at : null;
  } catch {
    return null;
  }
}

function emptyBody(): ClientReportPreview["body"] {
  return { done: [], photos: [], in_progress: [], next: [], progress: null, stages: null };
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeBody<T extends object>(value: unknown): ClientReportPreview["body"] & T {
  const body = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    ...emptyBody(),
    ...body,
    done: asArray<ClientReportDoneTask>(body.done),
    photos: asArray<ClientReportPreviewPhoto>(body.photos),
    in_progress: asArray<ClientReportTask>(body.in_progress),
    next: asArray<ClientReportNextTask>(body.next),
    progress: (body.progress as ClientReportProgress | null | undefined) ?? null,
    stages: (body.stages as ClientReportStages | null | undefined) ?? null,
  } as ClientReportPreview["body"] & T;
}

/** Owner / co_owner only (the RPC raises 42501 otherwise). */
export async function previewClientReport(
  projectId: string,
  range: { from: string | null; to: string | null } = { from: null, to: null },
): Promise<ClientReportPreview> {
  const { data, error } = await rawSupabase.rpc("preview_client_report", {
    p_project_id: projectId,
    p_from: range.from,
    p_to: range.to,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") {
    throw new Error("preview_client_report returned no data");
  }
  const preview = data as ClientReportPreview;
  return { ...preview, body: normalizeBody(preview.body) };
}

export async function publishClientReport(
  projectId: string,
  input: ClientReportPublishInput,
): Promise<ClientReportPublishResult> {
  const { data, error } = await rawSupabase.rpc("publish_client_report", {
    p_project_id: projectId,
    p_note: input.note,
    p_excluded_task_ids: input.excludedTaskIds,
    p_excluded_media_ids: input.excludedMediaIds,
    p_hide: input.hide,
    p_from: input.from,
    p_to: input.to,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") {
    throw new Error("publish_client_report returned no data");
  }
  return data as ClientReportPublishResult;
}

export async function setClientReportSettings(
  projectId: string,
  rhythm: ClientReportRhythm,
  reminderEnabled: boolean,
): Promise<ClientReportQuota> {
  const { data, error } = await rawSupabase.rpc("set_client_report_settings", {
    p_project_id: projectId,
    p_rhythm: rhythm,
    p_reminder_enabled: reminderEnabled,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") {
    throw new Error("set_client_report_settings returned no data");
  }
  return data as ClientReportQuota;
}

/** True when an active link existed and was withdrawn. */
export async function revokeClientReportLink(projectId: string): Promise<boolean> {
  const { data, error } = await rawSupabase.rpc("revoke_client_report_link", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return data === true;
}

export function buildClientReportShareLink(shareToken: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/share/report/${shareToken}`;
}

const MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Signed URL of a project media object for a signed-in member; null when it cannot be read. */
export async function createProjectMediaSignedUrl(
  bucket: string,
  objectPath: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, MEDIA_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export interface SharedReportPhoto {
  id: string;
  taskId: string | null;
  caption: string | null;
  signedUrl: string;
}

export interface SharedReportListItem {
  id: string;
  period_start: string;
  period_end: string;
  published_at: string;
}

/** What the get-shared-report Edge Function returns for a live token. */
export interface SharedReport {
  report: SharedReportListItem & {
    note: string | null;
    body: {
      project_title: string;
      prepared_by: string | null;
      done: ClientReportDoneTask[];
      in_progress: ClientReportTask[];
      next: ClientReportNextTask[];
      progress: ClientReportProgress | null;
      stages: ClientReportStages | null;
    };
  };
  photos: SharedReportPhoto[];
  reports: SharedReportListItem[];
  pdfAllowed: boolean;
  /** ISO timestamp; the photo URLs must not be used after it. */
  expiresAt: string;
}

function isSharedReport(value: unknown): value is SharedReport {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const report = row.report as Record<string, unknown> | null | undefined;
  return Boolean(report)
    && typeof report === "object"
    && typeof report!.id === "string"
    && Boolean(report!.body)
    && typeof report!.body === "object";
}

function invokeFailureStatus(error: unknown): number | null {
  if (error && typeof error === "object" && "context" in error) {
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== "undefined" && ctx instanceof Response) {
      return ctx.status;
    }
  }
  return null;
}

/**
 * Resolve a public report token into a published report.
 *
 * Returns null for every "this link does not work" answer (unknown, revoked or
 * malformed token: the function's 404 and 400). Anything else is thrown so the
 * page can tell "gone" from "try again".
 */
export async function fetchSharedReport(
  shareToken: string,
  reportId?: string | null,
): Promise<SharedReport | null> {
  if (!shareToken) return null;
  const { data, error } = await rawSupabase.functions.invoke("get-shared-report", {
    body: reportId ? { token: shareToken, report_id: reportId } : { token: shareToken },
  });
  if (error) {
    const status = invokeFailureStatus(error);
    if (status === 404 || status === 400) return null;
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (!isSharedReport(data)) return null;
  const body = normalizeBody<{ project_title: string; prepared_by: string | null }>(data.report.body);
  return {
    ...data,
    report: { ...data.report, body },
    photos: asArray<SharedReportPhoto>(data.photos),
    reports: asArray<SharedReportListItem>(data.reports),
    pdfAllowed: data.pdfAllowed === true,
  };
}
