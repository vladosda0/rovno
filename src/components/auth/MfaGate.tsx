import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { supabase } from "@/integrations/supabase/client";
import { aalOfToken, isMfaFreePath, isSecondStepRequired, MFA_PATH, MFA_REQUIRED_EVENT, mfaPathFor } from "@/lib/mfa";

/**
 * Keeps a session that has not passed the second sign-in step out of the app (epic
 * external-login, slice 4). The server refuses such a session anyway (PostgREST answers 403
 * «mfa_required»); this sends the person to the code screen instead of empty pages, from any
 * page except /auth/* and the static pages listed in isMfaFreePath.
 *
 * Another device: turning the protection on closes every other session without the second
 * step (Auth does it), so there the next refresh signs the person out; until then PostgREST
 * refuses, the client hears it (MFA_REQUIRED_EVENT) and refreshing the session settles it.
 */
export function MfaGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { status, session } = useRuntimeAuth();
  const [required, setRequired] = useState<boolean | null>(null);
  const userId = session?.user?.id ?? null;
  const aal = aalOfToken(session?.access_token);
  const factorKey = (session?.user?.factors ?? [])
    .filter((f) => f.status === "verified")
    .map((f) => f.id)
    .sort()
    .join(",");
  const checkedFor = useRef<string | null>(null);
  const lastAal = useRef<string | null>(null);
  const seq = useRef(0);

  // Only the newest check may set the verdict: an older answer arriving late is dropped.
  const evaluate = useCallback(async () => {
    const mine = ++seq.current;
    const verdict = status === "authenticated" ? await isSecondStepRequired() : false;
    if (mine === seq.current) setRequired(verdict);
  }, [status]);

  // Asked again when the person, the session level or the verified factors change, not on
  // every new session object: a token refresh or a return to the tab must not unmount the app
  // (a form, or the enrolment steps in Security, would lose what was typed). The last verdict
  // stays on screen while the new one is read, except for another person or a drop from aal2
  // while a verified factor is still on (Vlad 2026-11-14: turning the protection off keeps the page).
  useEffect(() => {
    const dropped = lastAal.current === "aal2" && aal !== "aal2" && factorKey !== "";
    if (checkedFor.current !== userId || dropped) setRequired(null);
    checkedFor.current = userId;
    lastAal.current = aal;
    void evaluate();
  }, [evaluate, userId, aal, factorKey]);

  useEffect(() => {
    const onRefused = async () => {
      await supabase.auth.refreshSession().catch(() => undefined);
      await evaluate();
    };
    const listener = () => void onRefused();
    window.addEventListener(MFA_REQUIRED_EVENT, listener);
    return () => window.removeEventListener(MFA_REQUIRED_EVENT, listener);
  }, [evaluate]);

  const free = isMfaFreePath(location.pathname);

  // A verdict can go stale (a recovery code removed the factor while the token kept aal1), so
  // the step is asked again right before sending anyone to the code screen.
  useEffect(() => {
    if (!required || free || location.pathname === MFA_PATH) return;
    let cancelled = false;
    void isSecondStepRequired().then((still) => {
      if (cancelled) return;
      if (still) navigate(mfaPathFor(`${location.pathname}${location.search}${location.hash}`), { replace: true });
      else setRequired(false);
    });
    return () => {
      cancelled = true;
    };
  }, [required, free, location.pathname, location.search, location.hash, navigate]);

  // While it is not known yet, a closed page shows nothing rather than a flash of refusals.
  if (!free && status === "authenticated" && required !== false) return null;
  return <>{children}</>;
}
