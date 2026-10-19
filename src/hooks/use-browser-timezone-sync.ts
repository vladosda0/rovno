import { useEffect, useRef } from "react";
import {
  useUpdateWorkspaceProfileIdentity,
  useWorkspaceCurrentUserState,
  useWorkspaceMode,
} from "@/hooks/use-workspace-source";
import {
  isUnsetProfileTimezone,
  readBrowserTimezone,
  readTimezoneFromBrowser,
  rememberTimezoneFromBrowser,
} from "@/lib/profile-timezone";

/**
 * A signed-in profile that never had a zone chosen gets the browser's one, once per profile on
 * this device. The server counts "today" by `profiles.timezone`, and the column default says UTC
 * for everyone. Once is the point: a UTC picked by hand afterwards is not overwritten here.
 */
export function useBrowserTimezoneSync(): void {
  const mode = useWorkspaceMode();
  const { user, isLoading } = useWorkspaceCurrentUserState();
  const { mutateAsync } = useUpdateWorkspaceProfileIdentity();
  const profileId = mode.kind === "supabase" ? mode.profileId : null;
  const attemptedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!profileId || isLoading || user.id !== profileId) return;
    if (attemptedForRef.current === profileId) return;
    if (readTimezoneFromBrowser(profileId) !== null) return;
    if (!isUnsetProfileTimezone(user.timezone)) return;
    const browserZone = readBrowserTimezone();
    if (!browserZone) return;

    attemptedForRef.current = profileId;
    void mutateAsync({ timezone: browserZone }).then(
      () => rememberTimezoneFromBrowser(profileId, true),
      // Not remembered, so the next visit tries again.
      () => {},
    );
  }, [isLoading, mutateAsync, profileId, user.id, user.timezone]);
}
