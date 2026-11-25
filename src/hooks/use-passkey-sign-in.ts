import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { conditionalMediationAvailable, passkeySupported, runPasskeySignIn, type PasskeySignInAlert } from "@/lib/passkey";
import { usePasskeysEnabled } from "@/hooks/use-passkeys-enabled";

/** How many times the quiet request behind the Email field is renewed after it ends. */
const BACKGROUND_RENEWALS = 3;

/**
 * «Войти по лицу или отпечатку» on /auth/login (epic external-login, slice 5, step 5.7,
 * mockup frames 2-4): the button, and the quiet request that lets the browser offer the same
 * sign-in among the Email field's suggestions. The quiet request starts with the page, where
 * the browser supports it, and is aborted when the page goes away or the button is pressed,
 * so the browser never holds two requests at once. Aborts are never shown.
 */
export function usePasskeySignIn(onSignedIn: (user: User) => Promise<void> | void) {
  // Shown only where the browser can and Auth has it switched on (`passkeys_enabled`).
  const browserCan = passkeySupported();
  const supported = usePasskeysEnabled(browserCan) && browserCan;
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<PasskeySignInAlert | null>(null);
  const background = useRef<AbortController | null>(null);
  const foreground = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const onSignedInRef = useRef(onSignedIn);
  onSignedInRef.current = onSignedIn;

  const startBackground = useCallback(async (renewal: number) => {
    if (!alive.current || renewal > BACKGROUND_RENEWALS || background.current || foreground.current) return;
    if (!(await conditionalMediationAvailable())) return;
    if (!alive.current || background.current || foreground.current) return;
    const controller = new AbortController();
    background.current = controller;
    const outcome = await runPasskeySignIn({ signal: controller.signal, conditional: true });
    if (background.current === controller) background.current = null;
    if (!alive.current || controller.signal.aborted) return;
    if (outcome.kind === "ok") {
      await onSignedInRef.current(outcome.user);
      return;
    }
    // A suggestion picked after Auth's challenge expired is renewed silently: the person picks
    // it again. Leaders give the challenge a long life instead of refreshing it on a timer.
    // Renewed only after the person picked the entry and it did not go through; a request the
    // server refused outright (the sign-in is off there) is not asked again on this page.
    if (outcome.kind === "alert") setAlert(outcome.alert);
    if (outcome.kind === "alert" || outcome.renew) void startBackground(renewal + 1);
  }, []);

  useEffect(() => {
    alive.current = true;
    if (supported) void startBackground(0);
    return () => {
      alive.current = false;
      background.current?.abort();
      foreground.current?.abort();
      background.current = null;
      foreground.current = null;
    };
  }, [supported, startBackground]);

  const start = useCallback(async () => {
    if (foreground.current) return;
    background.current?.abort();
    background.current = null;
    setAlert(null);
    setBusy(true);
    const controller = new AbortController();
    foreground.current = controller;
    const outcome = await runPasskeySignIn({ signal: controller.signal, conditional: false });
    if (foreground.current === controller) foreground.current = null;
    if (!alive.current) return;
    if (outcome.kind === "ok") {
      await onSignedInRef.current(outcome.user);
      if (alive.current) setBusy(false);
      return;
    }
    setBusy(false);
    if (outcome.kind === "alert") setAlert(outcome.alert);
    void startBackground(0);
  }, [startBackground]);

  const clearAlert = useCallback(() => setAlert(null), []);

  return { supported, busy, alert, start, clearAlert };
}
