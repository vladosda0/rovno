import type { MemberRole } from "@/types/entities";

const STORAGE_KEY = "auth-simulated-role";
const PROFILE_AUTOMATION_LEVEL_KEY = "profile-automation-level";
const VALID_AUTOMATION_LEVELS = new Set(["full", "assisted", "manual", "observer"]);

export type AuthRole = MemberRole | "guest";

export function getAuthRole(): AuthRole {
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

export function setAuthRole(role: AuthRole) {
  localStorage.setItem(STORAGE_KEY, role);
}

export function isAuthenticated(): boolean {
  return getAuthRole() !== "guest";
}

export function isOnboarded(): boolean {
  return localStorage.getItem("onboarding-complete") === "true";
}

export function completeOnboarding() {
  localStorage.setItem("onboarding-complete", "true");
}

export function getProfileAutomationLevelMode(): string | null {
  const stored = localStorage.getItem(PROFILE_AUTOMATION_LEVEL_KEY);
  if (!stored) return null;
  return VALID_AUTOMATION_LEVELS.has(stored) ? stored : null;
}

export function setProfileAutomationLevelMode(mode: string): void {
  if (!VALID_AUTOMATION_LEVELS.has(mode)) return;
  localStorage.setItem(PROFILE_AUTOMATION_LEVEL_KEY, mode);
}
