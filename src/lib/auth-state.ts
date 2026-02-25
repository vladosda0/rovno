import type { MemberRole } from "@/types/entities";

const STORAGE_KEY = "auth-simulated-role";

export type AuthRole = MemberRole | "guest";

export function getAuthRole(): AuthRole {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (
    stored === "guest"
    || stored === "owner"
    || stored === "co-owner"
    || stored === "contractor"
    || stored === "participant"
  ) {
    return stored;
  }
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
