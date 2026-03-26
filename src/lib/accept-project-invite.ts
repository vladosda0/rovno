import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database as WorkspaceDatabase } from "../../backend-truth/generated/supabase-types";

export type AcceptProjectInviteErrorCode =
  | "invite_email_mismatch"
  | "invite_invalid_or_unavailable"
  | "auth_required"
  | "unknown";

export interface AcceptProjectInviteError {
  code: AcceptProjectInviteErrorCode;
  message: string;
  rawError: PostgrestError | Error | null;
}

export interface AcceptProjectInviteResult {
  ok: true;
  invite: WorkspaceDatabase["public"]["Tables"]["project_invites"]["Row"];
}

export interface AcceptProjectInviteFailure {
  ok: false;
  error: AcceptProjectInviteError;
}

function mapAcceptInviteError(error: PostgrestError | Error | null): AcceptProjectInviteError {
  const message = error?.message ?? "Unable to accept invite.";
  const normalized = message.toLowerCase();

  if (normalized.includes("email does not match")) {
    return {
      code: "invite_email_mismatch",
      message: "This invite was sent to a different email address.",
      rawError: error,
    };
  }

  if (normalized.includes("invite not found") || normalized.includes("no longer pending")) {
    return {
      code: "invite_invalid_or_unavailable",
      message: "This invite link is invalid, expired, or has already been used.",
      rawError: error,
    };
  }

  if (normalized.includes("authentication required")) {
    return {
      code: "auth_required",
      message: "You need to sign in before accepting this invite.",
      rawError: error,
    };
  }

  return {
    code: "unknown",
    message,
    rawError: error,
  };
}

export async function acceptProjectInvite(
  inviteToken: string,
): Promise<AcceptProjectInviteResult | AcceptProjectInviteFailure> {
  try {
    const typedClient = supabase as unknown as SupabaseClient<WorkspaceDatabase>;
    const { data, error } = await typedClient.rpc("accept_project_invite", {
      p_invite_token: inviteToken,
    });

    if (error) {
      return {
        ok: false,
        error: mapAcceptInviteError(error),
      };
    }

    if (!data) {
      return {
        ok: false,
        error: {
          code: "unknown",
          message: "Invite acceptance returned no data.",
          rawError: null,
        },
      };
    }

    return {
      ok: true,
      invite: data,
    };
  } catch (error) {
    return {
      ok: false,
      error: mapAcceptInviteError(error instanceof Error ? error : null),
    };
  }
}
