import { __unsafeSetRuntimeAuthStateForTests } from "@/hooks/use-runtime-auth";

export function authenticateRuntimeAuth(profileId = "profile-1"): void {
  __unsafeSetRuntimeAuthStateForTests({
    status: "authenticated",
    session: null,
    user: null,
    profileId,
  });
}
