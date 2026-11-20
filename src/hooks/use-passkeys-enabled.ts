import { useEffect, useState } from "react";
import { passkeysEnabledOnServer } from "@/lib/passkey-availability";

/**
 * True once Auth says the face or fingerprint sign-in is on (`passkeys_enabled`); false while
 * it is not known, when it is off, or when `when` is false (then Auth is not asked at all).
 */
export function usePasskeysEnabled(when = true): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!when) {
      setEnabled(false);
      return;
    }
    let cancelled = false;
    void passkeysEnabledOnServer().then((value) => {
      if (!cancelled) setEnabled(value);
    });
    return () => {
      cancelled = true;
    };
  }, [when]);
  return enabled;
}
