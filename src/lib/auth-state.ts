import type { MemberRole } from "@/types/entities";

const STORAGE_KEY = "auth-simulated-role";
const PROFILE_AUTOMATION_LEVEL_KEY = "profile-automation-level";
const AUTH_PROFILE_KEY = "auth-local-profile";
const DEMO_SESSION_KEY = "workspace-demo-session";
const VALID_AUTOMATION_LEVELS = new Set(["full", "assisted", "manual", "observer"]);

export type AuthRole = MemberRole | "guest";
export interface StoredAuthProfile {
  id: string;
  email: string;
  name: string;
  locale?: string;
  timezone?: string;
  plan?: string;
}

type Listener = () => void;

const listeners = new Set<Listener>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function buildProfileId(email: string): string {
  const normalized = email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized ? `local-profile-${normalized}` : `local-profile-${Date.now()}`;
}

function readJson<T>(storage: Storage, key: string): T | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage, key: string, value: unknown) {
  storage.setItem(key, JSON.stringify(value));
}

export function subscribeAuthState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthStateSnapshot(): string {
  const profile = getStoredLocalAuthProfile();
  return [
    getSimulatedAuthRole(),
    profile?.id ?? "",
    profile?.email ?? "",
    profile?.name ?? "",
    isDemoSessionActive() ? "demo" : "standard",
    getProfileAutomationLevelMode() ?? "",
    isOnboarded() ? "onboarded" : "new",
  ].join("|");
}

// Local/demo compatibility auth is preserved for browser-only flows and tests.
// Supabase-backed runtime auth must not use these helpers as authority.
export function getSimulatedAuthRole(): AuthRole {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (
    stored === "guest"
    || stored === "owner"
    || stored === "co_owner"
    || stored === "contractor"
    || stored === "viewer"
  ) {
    return stored;
  }
  if (stored === "co-owner") return "co_owner";
  if (stored === "participant") return "viewer";
  return "owner"; // default: logged-in owner
}

export function setSimulatedAuthRole(role: AuthRole) {
  localStorage.setItem(STORAGE_KEY, role);
  notifyListeners();
}

export function isSimulatedAuthenticated(): boolean {
  return getSimulatedAuthRole() !== "guest";
}

export function isOnboarded(): boolean {
  return localStorage.getItem("onboarding-complete") === "true";
}

export function completeOnboarding() {
  localStorage.setItem("onboarding-complete", "true");
  notifyListeners();
}

export function getProfileAutomationLevelMode(): string | null {
  const stored = localStorage.getItem(PROFILE_AUTOMATION_LEVEL_KEY);
  if (!stored) return null;
  return VALID_AUTOMATION_LEVELS.has(stored) ? stored : null;
}

export function setProfileAutomationLevelMode(mode: string): void {
  if (!VALID_AUTOMATION_LEVELS.has(mode)) return;
  localStorage.setItem(PROFILE_AUTOMATION_LEVEL_KEY, mode);
  notifyListeners();
}

export function getStoredLocalAuthProfile(): StoredAuthProfile | null {
  const profile = readJson<StoredAuthProfile>(localStorage, AUTH_PROFILE_KEY);
  if (!profile?.id || !profile.email) return null;
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name ?? "",
    locale: profile.locale,
    timezone: profile.timezone,
    plan: profile.plan,
  };
}

export function setStoredLocalAuthProfile(profile: Omit<StoredAuthProfile, "id"> & { id?: string }) {
  const nextProfile: StoredAuthProfile = {
    id: profile.id ?? buildProfileId(profile.email),
    email: profile.email.trim(),
    name: profile.name.trim(),
    locale: profile.locale,
    timezone: profile.timezone,
    plan: profile.plan,
  };
  writeJson(localStorage, AUTH_PROFILE_KEY, nextProfile);
  notifyListeners();
  return nextProfile;
}

export function clearStoredLocalAuthProfile() {
  localStorage.removeItem(AUTH_PROFILE_KEY);
  notifyListeners();
}

export function getAuthRole(): AuthRole {
  return getSimulatedAuthRole();
}

export function setAuthRole(role: AuthRole) {
  setSimulatedAuthRole(role);
}

export function isAuthenticated(): boolean {
  return isSimulatedAuthenticated();
}

export function getStoredAuthProfile(): StoredAuthProfile | null {
  return getStoredLocalAuthProfile();
}

export function setStoredAuthProfile(profile: Omit<StoredAuthProfile, "id"> & { id?: string }) {
  return setStoredLocalAuthProfile(profile);
}

export function clearStoredAuthProfile() {
  clearStoredLocalAuthProfile();
}

export function isDemoSessionActive(): boolean {
  const session = readJson<{ active?: boolean }>(sessionStorage, DEMO_SESSION_KEY);
  return session?.active === true;
}

export function enterDemoSession(projectId?: string) {
  writeJson(sessionStorage, DEMO_SESSION_KEY, {
    active: true,
    projectId: projectId ?? null,
    startedAt: new Date().toISOString(),
  });
  notifyListeners();
}

export function clearDemoSession() {
  sessionStorage.removeItem(DEMO_SESSION_KEY);
  notifyListeners();
}
