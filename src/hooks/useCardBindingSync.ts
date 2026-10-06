import { useEffect, useRef } from "react";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { syncCardBinding } from "@/lib/card-binding-sync";

// Checks the signed-in caller's pending card bindings with the bank, once per mount
// for each sign-in (it runs again when the signed-in profile changes), and calls
// onChanged when that check changed the card on file. A guest never triggers the
// check. The callback may change between renders: the latest one is called and a
// new identity does not run the check again.
//
// It calls back only when the check itself changed the card. Calling back on every
// answer was tried and withdrawn (rovno PR #203); to bring it back, drop `&& changed`.
export function useCardBindingSync(onChanged: () => unknown) {
  const { status, profileId } = useRuntimeAuth();
  const enabled = status === "authenticated" && !!profileId;
  const latest = useRef(onChanged);
  const mounted = useRef(false);

  useEffect(() => {
    latest.current = onChanged;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void syncCardBinding().then((changed) => {
      if (mounted.current && changed) latest.current();
    });
  }, [enabled, profileId]);
}
