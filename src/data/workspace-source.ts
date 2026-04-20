import type { SupabaseClient } from "@supabase/supabase-js";
import * as store from "@/data/store";
import { cacheWorkspaceUsers } from "@/data/workspace-profile-cache";
import { getDefaultFinanceVisibility } from "@/lib/participant-role-policy";
import type {
  AIAccess,
  FinanceVisibility,
  InternalDocsVisibility,
  Member,
  Project,
  User,
  ViewerRegime,
} from "@/types/entities";
import { isDemoSessionActive } from "@/lib/auth-state";
import type { Database as WorkspaceDatabase } from "../../backend-truth/generated/supabase-types";

export type WorkspaceProjectInvite = WorkspaceDatabase["public"]["Tables"]["project_invites"]["Row"];
type ProfileRow = WorkspaceDatabase["public"]["Tables"]["profiles"]["Row"];
type ProfileSettingsRow = WorkspaceDatabase["public"]["Tables"]["profile_settings"]["Row"];
type ProfileSettingsInsert = WorkspaceDatabase["public"]["Tables"]["profile_settings"]["Insert"];
type ProjectRow = WorkspaceDatabase["public"]["Tables"]["projects"]["Row"];
type ProjectMemberRow = WorkspaceDatabase["public"]["Tables"]["project_members"]["Row"];
type ProjectInsert = WorkspaceDatabase["public"]["Tables"]["projects"]["Insert"];
type ProjectMemberInsert = WorkspaceDatabase["public"]["Tables"]["project_members"]["Insert"];
type TypedSupabaseClient = SupabaseClient<WorkspaceDatabase>;
export type WorkspaceMode =
  | { kind: "demo" }
  | { kind: "local" }
  | { kind: "supabase"; profileId: string };
export type RuntimeWorkspaceMode = WorkspaceMode | { kind: "guest" };

/** Successful delivery from the `send-project-invite` edge function. */
export type SendWorkspaceProjectInviteEmailSuccessPayload = {
  ok: true;
  inviteId: string;
  recipientEmail: string;
  providerMessageId?: string;
};

/** Result of attempting to send invite email (skipped outside real Supabase workspace). */
export type SendWorkspaceProjectInviteEmailResult =
  | { kind: "sent"; payload: SendWorkspaceProjectInviteEmailSuccessPayload }
  | { kind: "skipped" };

export interface WorkspaceSource {
  mode: WorkspaceMode["kind"];
  getCurrentUser: () => Promise<User>;
  getProfilePreferences: () => Promise<ProfilePreferences>;
  updateProfilePreferences: (patch: ProfilePreferencesPatch) => Promise<ProfilePreferences>;
  getProjects: () => Promise<Project[]>;
  getProjectById: (projectId: string) => Promise<Project | undefined>;
  getProjectMembers: (projectId: string) => Promise<Member[]>;
  getProjectInvites: (projectId: string) => Promise<WorkspaceProjectInvite[]>;
  createProject: (input: CreateWorkspaceProjectInput) => Promise<Project>;
}

export type ProfileCurrency = "RUB" | "USD" | "EUR" | "GBP";
export type ProfileUnits = "metric" | "imperial";
export type ProfileDateFormat = "dd.MM.yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd";
export type ProfileWeekStart = "monday" | "sunday";
export type ProfileAiOutputLanguage = "ru" | "en" | "auto";
export type ProfileAutomationLevel = "manual" | "assisted" | "full" | "observer";

export interface ProfilePreferences {
  currency: ProfileCurrency;
  units: ProfileUnits;
  dateFormat: ProfileDateFormat;
  weekStart: ProfileWeekStart;
  aiOutputLanguage: ProfileAiOutputLanguage;
  automationLevel: ProfileAutomationLevel;
}

export type ProfilePreferencesPatch = Partial<ProfilePreferences>;

export const DEFAULT_PROFILE_PREFERENCES: ProfilePreferences = {
  currency: "RUB",
  units: "metric",
  dateFormat: "dd.MM.yyyy",
  weekStart: "monday",
  aiOutputLanguage: "auto",
  automationLevel: "manual",
};

export interface CreateWorkspaceProjectInput {
  title: string;
  type: string;
  projectMode: NonNullable<Project["project_mode"]>;
}

const SUPABASE_WORKSPACE_SOURCE = "supabase";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const LOCAL_PROFILE_PREFERENCES_KEY = "profile-preferences";

function normalizeProfilePreferences(raw: Partial<ProfilePreferences> | Record<string, unknown> | null | undefined): ProfilePreferences {
  const value = raw ?? {};
  const record = value as Record<string, unknown>;
  const currency = record.currency;
  const units = record.units;
  const dateFormat = record.dateFormat ?? record.date_format;
  const weekStart = record.weekStart ?? record.week_start;
  const aiOutputLanguage = record.aiOutputLanguage ?? record.ai_output_language;
  const automationLevel = record.automationLevel ?? record.automation_level;

  return {
    currency: currency === "RUB" || currency === "USD" || currency === "EUR" || currency === "GBP" ? currency : DEFAULT_PROFILE_PREFERENCES.currency,
    units: units === "metric" || units === "imperial" ? units : DEFAULT_PROFILE_PREFERENCES.units,
    dateFormat: dateFormat === "dd.MM.yyyy" || dateFormat === "MM/dd/yyyy" || dateFormat === "yyyy-MM-dd" ? dateFormat : DEFAULT_PROFILE_PREFERENCES.dateFormat,
    weekStart: weekStart === "monday" || weekStart === "sunday" ? weekStart : DEFAULT_PROFILE_PREFERENCES.weekStart,
    aiOutputLanguage: aiOutputLanguage === "ru" || aiOutputLanguage === "en" || aiOutputLanguage === "auto" ? aiOutputLanguage : DEFAULT_PROFILE_PREFERENCES.aiOutputLanguage,
    automationLevel: automationLevel === "manual" || automationLevel === "assisted" || automationLevel === "full" || automationLevel === "observer" ? automationLevel : DEFAULT_PROFILE_PREFERENCES.automationLevel,
  };
}

function readLocalProfilePreferences(): ProfilePreferences {
  if (typeof window === "undefined") return DEFAULT_PROFILE_PREFERENCES;
  const raw = window.localStorage.getItem(LOCAL_PROFILE_PREFERENCES_KEY);
  if (raw) {
    try {
      return normalizeProfilePreferences(JSON.parse(raw) as Record<string, unknown>);
    } catch {
      return DEFAULT_PROFILE_PREFERENCES;
    }
  }
  return normalizeProfilePreferences({
    currency: window.localStorage.getItem("profile-currency"),
    automationLevel: window.localStorage.getItem("profile-automation-level"),
  });
}

function writeLocalProfilePreferences(next: ProfilePreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_PROFILE_PREFERENCES_KEY, JSON.stringify(next));
  window.localStorage.setItem("profile-currency", next.currency);
  window.localStorage.setItem("profile-automation-level", next.automationLevel);
}

function mapProfileSettingsRowToPreferences(row: ProfileSettingsRow | null | undefined): ProfilePreferences {
  return normalizeProfilePreferences(row as Record<string, unknown> | null | undefined);
}

function profilePreferencesToDbPatch(profileId: string, preferences: ProfilePreferences): ProfileSettingsInsert {
  return {
    profile_id: profileId,
    currency: preferences.currency,
    units: preferences.units,
    date_format: preferences.dateFormat,
    week_start: preferences.weekStart,
    ai_output_language: preferences.aiOutputLanguage,
    automation_level: preferences.automationLevel,
  };
}

function isBrowserWorkspaceMode(
  mode: WorkspaceMode | RuntimeWorkspaceMode,
): mode is Extract<WorkspaceMode, { kind: "demo" | "local" }> {
  return mode.kind === "demo" || mode.kind === "local";
}

async function ensureOwnerProjectMember(
  supabase: TypedSupabaseClient,
  input: {
    projectId: string;
    profileId: string;
  },
): Promise<void> {
  const { data, error } = await supabase
    .from("project_members")
    .select("*")
    .eq("project_id", input.projectId)
    .eq("profile_id", input.profileId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return;
  }

  const insert: ProjectMemberInsert = {
    project_id: input.projectId,
    profile_id: input.profileId,
    role: "owner",
    ai_access: "project_pool",
    viewer_regime: null,
    credit_limit: 500,
    used_credits: 0,
    finance_visibility: "detail",
  };

  const { error: insertError } = await supabase
    .from("project_members")
    .insert(insert);

  if (insertError) {
    throw insertError;
  }
}

function createBrowserWorkspaceSource(mode: store.BrowserWorkspaceKind): WorkspaceSource {
  return {
    mode,
    async getCurrentUser() {
      return store.getCurrentUserForMode(mode);
    },
    async getProfilePreferences() {
      return readLocalProfilePreferences();
    },
    async updateProfilePreferences(patch: ProfilePreferencesPatch) {
      const next = normalizeProfilePreferences({
        ...readLocalProfilePreferences(),
        ...patch,
      });
      writeLocalProfilePreferences(next);
      return next;
    },
    async getProjects() {
      return store.getProjectsForMode(mode);
    },
    async getProjectById(projectId: string) {
      return store.getProjectForMode(mode, projectId);
    },
    async getProjectMembers(projectId: string) {
      return store.getMembersForMode(mode, projectId);
    },
    async getProjectInvites(projectId: string) {
      return store.getProjectInvitesForMode(mode, projectId);
    },
    async createProject(input: CreateWorkspaceProjectInput) {
      const user = store.getCurrentUserForMode(mode);
      const project: Project = {
        id: `project-manual-${Date.now()}`,
        owner_id: user.id,
        title: input.title.trim() || "Untitled Project",
        type: input.type,
        project_mode: input.projectMode,
        automation_level: "manual",
        current_stage_id: "",
        progress_pct: 0,
      };

      store.addProject(project);
      store.addMember({
        project_id: project.id,
        user_id: user.id,
        role: "owner",
        ai_access: "project_pool",
        finance_visibility: "detail",
        credit_limit: 500,
        used_credits: 0,
      });

      return project;
    },
  };
}

export function mapProfileRowToUser(row: ProfileRow): User {
  return {
    id: row.id,
    email: row.email ?? "",
    name: row.full_name ?? row.email ?? "Unknown user",
    avatar: row.avatar_url ?? undefined,
    locale: row.locale,
    timezone: row.timezone,
    plan: row.plan,
    credits_free: row.credits_free,
    credits_paid: row.credits_paid,
  };
}

export function mapProjectRowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    owner_id: row.owner_profile_id,
    title: row.title,
    type: row.project_type,
    project_mode: row.project_mode,
    automation_level: row.automation_level,
    current_stage_id: row.current_stage_id ?? "",
    progress_pct: row.progress_pct,
    address: row.address ?? undefined,
    ai_description: row.ai_description ?? undefined,
  };
}

export function mapProjectMemberRowToMember(row: ProjectMemberRow): Member {
  const internalDocsVisibility = (row as ProjectMemberRow & {
    internal_docs_visibility?: InternalDocsVisibility | null;
  }).internal_docs_visibility;

  return {
    project_id: row.project_id,
    user_id: row.profile_id,
    role: row.role,
    viewer_regime: row.viewer_regime ?? undefined,
    ai_access: row.ai_access,
    finance_visibility: row.finance_visibility,
    credit_limit: row.credit_limit,
    used_credits: row.used_credits,
    ...(internalDocsVisibility !== undefined
      ? { internal_docs_visibility: internalDocsVisibility ?? undefined }
      : {}),
  };
}

export function filterActiveProjectRows(rows: ProjectRow[]): ProjectRow[] {
  return rows.filter((row) => row.archived_at == null);
}

export function isSupabaseWorkspaceRequested(): boolean {
  return import.meta.env.VITE_WORKSPACE_SOURCE === SUPABASE_WORKSPACE_SOURCE;
}

export function hasSupabaseWorkspaceConfig(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

export function selectWorkspaceMode(input: {
  requestedSource?: string;
  hasSupabaseConfig: boolean;
  sessionProfileId?: string | null;
  demoSessionActive?: boolean;
}): WorkspaceMode {
  if (input.demoSessionActive) {
    return { kind: "demo" };
  }

  if (input.requestedSource !== SUPABASE_WORKSPACE_SOURCE) {
    return { kind: "local" };
  }

  if (!input.hasSupabaseConfig || !input.sessionProfileId) {
    return { kind: "local" };
  }

  return { kind: "supabase", profileId: input.sessionProfileId };
}

export function selectRuntimeWorkspaceMode(input: {
  requestedSource?: string;
  hasSupabaseConfig: boolean;
  sessionProfileId?: string | null;
  demoSessionActive?: boolean;
}): RuntimeWorkspaceMode {
  if (input.demoSessionActive) {
    return { kind: "demo" };
  }

  if (input.requestedSource !== SUPABASE_WORKSPACE_SOURCE) {
    return { kind: "local" };
  }

  if (!input.hasSupabaseConfig || !input.sessionProfileId) {
    return { kind: "guest" };
  }

  return { kind: "supabase", profileId: input.sessionProfileId };
}

async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
}

function messageFromEdgeFunctionFailure(error: unknown, data: unknown): string {
  const fromJson = parseEdgeFunctionErrorBody(data);
  if (fromJson) return fromJson;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "Unable to send invite email";
}

/**
 * When `functions.invoke` fails with `FunctionsHttpError`, `error.context` is the raw `Response`
 * (body not yet consumed). Read JSON `{ error }` or text so toasts show the backend reason.
 */
async function messageFromFunctionsInvokeFailure(error: unknown, data: unknown): Promise<string> {
  const fromData = parseEdgeFunctionErrorBody(data);
  if (fromData) return fromData;

  if (error && typeof error === "object" && "context" in error) {
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== "undefined" && ctx instanceof Response) {
      const status = ctx.status;
      const raw = await ctx.clone().text().catch(() => "");
      const trimmed = raw.trim();
      if (trimmed) {
        try {
          const j = JSON.parse(trimmed) as Record<string, unknown>;
          if (typeof j.error === "string") return j.error;
          if (j.error && typeof j.error === "object" && j.error !== null && "message" in j.error) {
            const m = (j.error as { message?: unknown }).message;
            if (typeof m === "string") return m;
          }
          if (typeof j.message === "string") return j.message;
        } catch {
          /* not JSON */
        }
        return trimmed.length <= 400 ? trimmed : `${trimmed.slice(0, 400)}…`;
      }
      const statusText = ctx.statusText?.trim();
      return statusText ? `HTTP ${status} ${statusText}` : `HTTP ${status}`;
    }
  }

  return messageFromEdgeFunctionFailure(error, data);
}

function parseEdgeFunctionErrorBody(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;
  if (record.error && typeof record.error === "object" && "message" in record.error
    && typeof (record.error as { message: unknown }).message === "string") {
    return (record.error as { message: string }).message;
  }
  return null;
}

function parseSendProjectInviteSuccess(data: unknown, fallbackInviteId: string): SendWorkspaceProjectInviteEmailSuccessPayload | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.ok !== true) return null;
  const inviteId = typeof record.inviteId === "string" ? record.inviteId : fallbackInviteId;
  const recipientEmail = typeof record.recipientEmail === "string" ? record.recipientEmail : "";
  const providerMessageId = typeof record.providerMessageId === "string" ? record.providerMessageId : undefined;
  return {
    ok: true,
    inviteId,
    recipientEmail,
    providerMessageId,
  };
}

/**
 * Sends the invite email via Supabase Edge Function `send-project-invite`.
 * Only calls the backend when `mode.kind === "supabase"`; demo/local IDs are not valid for the sender.
 */
export async function sendWorkspaceProjectInviteEmail(
  mode: WorkspaceMode | RuntimeWorkspaceMode,
  inviteId: string,
): Promise<SendWorkspaceProjectInviteEmailResult> {
  if (mode.kind === "guest") {
    throw new Error("An authenticated Supabase session is required.");
  }

  if (mode.kind !== "supabase") {
    return { kind: "skipped" };
  }

  const supabase = await loadSupabaseClient();
  const { data, error } = await supabase.functions.invoke("send-project-invite", {
    body: { inviteId },
  });

  if (error) {
    throw new Error(await messageFromFunctionsInvokeFailure(error, data));
  }

  const parsed = parseSendProjectInviteSuccess(data, inviteId);
  if (parsed) {
    return { kind: "sent", payload: parsed };
  }

  const bodyError = parseEdgeFunctionErrorBody(data);
  if (bodyError) {
    throw new Error(bodyError);
  }

  throw new Error("Unexpected response from send-project-invite");
}

export async function resolveWorkspaceMode(): Promise<WorkspaceMode> {
  if (isDemoSessionActive()) {
    return { kind: "demo" };
  }

  if (!isSupabaseWorkspaceRequested()) {
    return { kind: "local" };
  }

  const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
  if (!hasSupabaseConfig) {
    return { kind: "local" };
  }

  try {
    const supabase = await loadSupabaseClient();
    const { data, error } = await supabase.auth.getSession();

    return selectWorkspaceMode({
      requestedSource: SUPABASE_WORKSPACE_SOURCE,
      hasSupabaseConfig,
      sessionProfileId: error ? null : data.session?.user?.id ?? null,
      demoSessionActive: false,
    });
  } catch {
    return { kind: "local" };
  }
}

export async function resolveRuntimeWorkspaceMode(): Promise<RuntimeWorkspaceMode> {
  if (isDemoSessionActive()) {
    return { kind: "demo" };
  }

  if (!isSupabaseWorkspaceRequested()) {
    return { kind: "local" };
  }

  if (!hasSupabaseWorkspaceConfig()) {
    return { kind: "guest" };
  }

  try {
    const supabase = await loadSupabaseClient();
    const { data, error } = await supabase.auth.getSession();

    return selectRuntimeWorkspaceMode({
      requestedSource: SUPABASE_WORKSPACE_SOURCE,
      hasSupabaseConfig: true,
      sessionProfileId: error ? null : data.session?.user?.id ?? null,
      demoSessionActive: false,
    });
  } catch {
    return { kind: "guest" };
  }
}

async function loadVisibleProfiles(
  supabase: TypedSupabaseClient,
  profileIds: string[],
): Promise<User[]> {
  const uniqueIds = Array.from(new Set(profileIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, locale, timezone, plan, credits_free, credits_paid")
    .in("id", uniqueIds);

  if (error || !data) return [];

  const users = data.map(mapProfileRowToUser);
  cacheWorkspaceUsers(users);
  return users;
}

function createSupabaseWorkspaceSource(
  supabase: TypedSupabaseClient,
  profileId: string,
): WorkspaceSource {
  async function readRemoteProfilePreferences(): Promise<ProfilePreferences> {
    const { data, error } = await supabase
      .from("profile_settings")
      .select("currency, units, date_format, week_start, ai_output_language, automation_level")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return mapProfileSettingsRowToPreferences(data);
  }

  return {
    mode: "supabase",
    async getCurrentUser() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url, locale, timezone, plan, credits_free, credits_paid")
        .eq("id", profileId)
        .maybeSingle();

      if (error || !data) {
        throw error ?? new Error("Current workspace profile not found");
      }

      const user = mapProfileRowToUser(data);
      cacheWorkspaceUsers([user]);
      return user;
    },

    async getProfilePreferences() {
      return readRemoteProfilePreferences();
    },

    async updateProfilePreferences(patch: ProfilePreferencesPatch) {
      const current = await readRemoteProfilePreferences();
      const next = normalizeProfilePreferences({ ...current, ...patch });
      const { data, error } = await supabase
        .from("profile_settings")
        .upsert(profilePreferencesToDbPatch(profileId, next), { onConflict: "profile_id" })
        .select("currency, units, date_format, week_start, ai_output_language, automation_level")
        .single();

      if (error) {
        throw error;
      }

      return mapProfileSettingsRowToPreferences(data);
    },

    async getProjects() {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .is("archived_at", null)
        .order("updated_at", { ascending: false });

      if (error) {
        throw error;
      }

      const activeRows = filterActiveProjectRows(data ?? []);
      return activeRows.map(mapProjectRowToProject);
    },

    async getProjectById(projectId: string) {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .is("archived_at", null)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return undefined;
      }

      await loadVisibleProfiles(supabase, [data.owner_profile_id]);
      return mapProjectRowToProject(data);
    },

    async getProjectMembers(projectId: string) {
      const { data, error } = await supabase
        .from("project_members")
        .select("*")
        .eq("project_id", projectId)
        .order("joined_at", { ascending: true });

      if (error) {
        throw error;
      }

      const rows = data ?? [];
      await loadVisibleProfiles(supabase, rows.map((row) => row.profile_id));
      return rows.map(mapProjectMemberRowToMember);
    },

    async getProjectInvites(projectId: string) {
      const { data, error } = await supabase
        .from("project_invites")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const rows = data ?? [];
      await loadVisibleProfiles(supabase, rows.flatMap((row) => [row.invited_by, row.accepted_profile_id ?? ""]));
      return rows;
    },

    async createProject(input: CreateWorkspaceProjectInput) {
      const insert: ProjectInsert = {
        owner_profile_id: profileId,
        title: input.title.trim() || "Untitled Project",
        project_type: input.type,
        project_mode: input.projectMode,
        automation_level: "manual",
        progress_pct: 0,
      };

      const { data, error } = await supabase
        .from("projects")
        .insert(insert)
        .select("*")
        .single();

      if (error || !data) {
        throw error ?? new Error("Unable to create project");
      }

      await ensureOwnerProjectMember(supabase, {
        projectId: data.id,
        profileId,
      });

      return mapProjectRowToProject(data);
    },
  };
}

export async function getWorkspaceSource(
  mode?: WorkspaceMode | RuntimeWorkspaceMode,
): Promise<WorkspaceSource> {
  const resolvedMode = mode ?? await resolveWorkspaceMode();
  if (resolvedMode.kind === "guest") {
    throw new Error("An authenticated Supabase session is required.");
  }

  if (isBrowserWorkspaceMode(resolvedMode)) {
    return createBrowserWorkspaceSource(resolvedMode.kind);
  }

  const supabase = await loadSupabaseClient();
  return createSupabaseWorkspaceSource(supabase, resolvedMode.profileId);
}

export async function updateWorkspaceProjectMemberRole(
  mode: WorkspaceMode | RuntimeWorkspaceMode,
  input: {
    projectId: string;
    userId: string;
    role: Member["role"];
    aiAccess?: AIAccess;
    viewerRegime?: ViewerRegime;
    creditLimit?: number;
    financeVisibility?: FinanceVisibility;
    internalDocsVisibility?: InternalDocsVisibility;
  },
): Promise<Member> {
  if (mode.kind === "guest") {
    throw new Error("An authenticated Supabase session is required.");
  }

  if (isBrowserWorkspaceMode(mode)) {
    const updated = store.updateMember(input.projectId, input.userId, {
      role: input.role,
      ai_access: input.aiAccess,
      viewer_regime: input.viewerRegime,
      credit_limit: input.creditLimit,
      finance_visibility: input.financeVisibility,
      ...(input.internalDocsVisibility !== undefined
        ? { internal_docs_visibility: input.internalDocsVisibility }
        : {}),
    }, mode.kind);
    if (!updated) {
      throw new Error("Project member not found");
    }
    return updated;
  }

  const patch: Record<string, unknown> = {
    role: input.role,
    ai_access: input.aiAccess,
    viewer_regime: input.viewerRegime ?? null,
    credit_limit: input.creditLimit,
  };
  if (input.financeVisibility !== undefined) {
    patch.finance_visibility = input.financeVisibility;
  }
  if (input.internalDocsVisibility !== undefined) {
    patch.internal_docs_visibility = input.internalDocsVisibility;
  }

  const supabase = await loadSupabaseClient();
  const { data, error } = await supabase
    .from("project_members")
    .update(patch)
    .eq("project_id", input.projectId)
    .eq("profile_id", input.userId)
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to update project member");
  }

  return mapProjectMemberRowToMember(data);
}

export async function createWorkspaceProjectInvite(
  mode: WorkspaceMode | RuntimeWorkspaceMode,
  input: {
    projectId: string;
    email: string;
    role: WorkspaceProjectInvite["role"];
    aiAccess: WorkspaceProjectInvite["ai_access"];
    viewerRegime: WorkspaceProjectInvite["viewer_regime"];
    creditLimit: number;
    invitedBy: string;
    financeVisibility?: FinanceVisibility;
    internalDocsVisibility?: InternalDocsVisibility;
  },
): Promise<WorkspaceProjectInvite> {
  if (mode.kind === "guest") {
    throw new Error("An authenticated Supabase session is required.");
  }

  const resolvedFinanceVisibility = input.financeVisibility
    ?? getDefaultFinanceVisibility(input.role);
  const resolvedInternalDocsVisibility = input.internalDocsVisibility
    ?? (input.role === "viewer" ? "none" : "view");

  if (isBrowserWorkspaceMode(mode)) {
    const invite = {
      id: `invite-${Date.now()}`,
      project_id: input.projectId,
      email: input.email.trim(),
      role: input.role,
      ai_access: input.aiAccess,
      viewer_regime: input.viewerRegime ?? null,
      credit_limit: input.creditLimit,
      invited_by: input.invitedBy,
      status: "pending",
      invite_token: `invite-token-${Date.now()}`,
      accepted_profile_id: null,
      created_at: new Date().toISOString(),
      accepted_at: null,
      finance_visibility: resolvedFinanceVisibility,
      internal_docs_visibility: resolvedInternalDocsVisibility,
    } as WorkspaceProjectInvite;
    store.addProjectInvite(invite, mode.kind);
    return invite;
  }

  const supabase = await loadSupabaseClient();
  const { data, error } = await supabase
    .from("project_invites")
    .insert({
      project_id: input.projectId,
      email: input.email.trim(),
      role: input.role,
      ai_access: input.aiAccess,
      viewer_regime: input.viewerRegime ?? null,
      credit_limit: input.creditLimit,
      invited_by: input.invitedBy,
      finance_visibility: resolvedFinanceVisibility,
      internal_docs_visibility: resolvedInternalDocsVisibility,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to create project invite");
  }

  return data;
}

export async function updateWorkspaceProjectInvite(
  mode: WorkspaceMode | RuntimeWorkspaceMode,
  input: {
    id: string;
    projectId: string;
    role?: WorkspaceProjectInvite["role"];
    aiAccess?: WorkspaceProjectInvite["ai_access"];
    viewerRegime?: WorkspaceProjectInvite["viewer_regime"];
    creditLimit?: number;
    financeVisibility?: FinanceVisibility;
    internalDocsVisibility?: InternalDocsVisibility;
    status?: WorkspaceProjectInvite["status"];
  },
): Promise<WorkspaceProjectInvite> {
  if (mode.kind === "guest") {
    throw new Error("An authenticated Supabase session is required.");
  }

  if (isBrowserWorkspaceMode(mode)) {
    const updated = store.updateProjectInvite(input.id, {
      role: input.role,
      ai_access: input.aiAccess,
      viewer_regime: input.viewerRegime,
      credit_limit: input.creditLimit,
      finance_visibility: input.financeVisibility,
      ...(input.internalDocsVisibility !== undefined
        ? { internal_docs_visibility: input.internalDocsVisibility }
        : {}),
      status: input.status,
    }, mode.kind);
    if (!updated) {
      throw new Error("Project invite not found");
    }
    return updated;
  }

  const supabase = await loadSupabaseClient();
  const { data, error } = await supabase
    .from("project_invites")
    .update({
      role: input.role,
      ai_access: input.aiAccess,
      viewer_regime: input.viewerRegime ?? null,
      credit_limit: input.creditLimit,
      finance_visibility: input.financeVisibility,
      internal_docs_visibility: input.internalDocsVisibility,
      status: input.status,
    })
    .eq("id", input.id)
    .eq("project_id", input.projectId)
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to update project invite");
  }

  return data;
}
