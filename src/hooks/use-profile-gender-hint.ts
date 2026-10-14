import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isProfileGenderHintSettled, requestProfileGenderHint } from "@/data/profile-gender-hint-source";
import { shurikMessagesQueryKeys } from "@/hooks/use-shurik-messages";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";

/**
 * Asks the server for Shurik's one-time hint about the gender field, at most once per mount, until
 * it answers `written` or `asked` for this profile on this device. The server decides who gets it; the call lives in the app shell and not in a migration so
 * that the hint only ever reaches a frontend that has the field.
 */
export function useProfileGenderHint(): void {
  const mode = useWorkspaceMode();
  const queryClient = useQueryClient();
  const profileId = mode.kind === "supabase" ? mode.profileId : null;
  const attemptedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!profileId) return;
    if (attemptedForRef.current === profileId) return;
    if (isProfileGenderHintSettled(profileId)) return;

    attemptedForRef.current = profileId;
    void requestProfileGenderHint(profileId, { onboarding: false }).then(
      (answer) => {
        if (answer === "written") {
          void queryClient.invalidateQueries({ queryKey: shurikMessagesQueryKeys.list(profileId) });
        }
      },
      // Not settled, so the next visit asks again.
      () => {},
    );
  }, [profileId, queryClient]);
}
