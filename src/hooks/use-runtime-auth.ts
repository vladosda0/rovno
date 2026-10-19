import { useSyncExternalStore } from "react";
import { clearWorkspaceUserCache } from "@/data/workspace-profile-cache";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type RuntimeAuthStatus = "loading" | "authenticated" | "guest";

export interface RuntimeAuthState {
  status: RuntimeAuthStatus;
  session: Session | null;
  user: User | null;
  profileId: string | null;
}

type Listener = () => void;

const listeners = new Set<Listener>();

const LOADING_STATE: RuntimeAuthState = {
  status: "loading",
  session: null,
  user: null,
  profileId: null,
};

const GUEST_STATE: RuntimeAuthState = {
  status: "guest",
  session: null,
  user: null,
  profileId: null,
};

let currentState: RuntimeAuthState = LOADING_STATE;
let authSubscription: { unsubscribe: () => void } | null = null;
let initPromise: Promise<void> | null = null;
let testOverrideState: RuntimeAuthState | null = null;
let lastSignOutAt: number | null = null;

function emitChange() {
  listeners.forEach((listener) => listener());
}

function clearAuthSubscription() {
  if (!authSubscription) {
    return;
  }

  authSubscription.unsubscribe();
  authSubscription = null;
}

function toRuntimeAuthState(session: Session | null): RuntimeAuthState {
  if (!session?.user?.id) {
    return GUEST_STATE;
  }

  return {
    status: "authenticated",
    session,
    user: session.user,
    profileId: session.user.id,
  };
}

async function ensureRuntimeAuthInitialized(): Promise<void> {
  if (testOverrideState) {
    currentState = testOverrideState;
    emitChange();
    return;
  }

  if (authSubscription || initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    const previousProfileId = currentState.profileId;
    try {
      const { data, error } = await supabase.auth.getSession();
      currentState = error ? GUEST_STATE : toRuntimeAuthState(data.session ?? null);
    } catch {
      currentState = GUEST_STATE;
    } finally {
      if (previousProfileId !== null && currentState.profileId === null) {
        lastSignOutAt = Date.now();
      }
      emitChange();
      initPromise = null;
    }

    if (listeners.size === 0) {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const previousProfileId = currentState.profileId;
      currentState = toRuntimeAuthState(session);
      // The only place that sees EVERY identity change: the logout button, an
      // expiring or revoked session, a sign-out in another tab, and the
      // magic-link and reset routes that sign a user in directly. Module-level
      // caches keyed by profile id and not by account have to be dropped here,
      // or the next account on this tab reads the previous one's data.
      if (currentState.profileId !== previousProfileId) {
        clearWorkspaceUserCache();
      }
      if (previousProfileId !== null && currentState.profileId === null) {
        lastSignOutAt = Date.now();
      }
      emitChange();
    });

    authSubscription = subscription;
  })();

  await initPromise;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  void ensureRuntimeAuthInitialized();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearAuthSubscription();
    }
  };
}

function getSnapshot(): RuntimeAuthState {
  return currentState;
}

/**
 * When the last signed-in session on this tab ended, while the tab is still
 * signed out; null once someone signs in again, or if no session has ended.
 */
export function getSignedOutSince(): number | null {
  return currentState.status === "authenticated" ? null : lastSignOutAt;
}

export function useRuntimeAuth(): RuntimeAuthState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function __unsafeSetRuntimeAuthStateForTests(state: RuntimeAuthState): void {
  testOverrideState = state;
  clearAuthSubscription();
  initPromise = null;
  currentState = state;
  emitChange();
}

export function __unsafeResetRuntimeAuthForTests(): void {
  testOverrideState = null;
  clearAuthSubscription();
  initPromise = null;
  lastSignOutAt = null;
  currentState = LOADING_STATE;
  emitChange();
}
