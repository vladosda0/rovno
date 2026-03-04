export interface SubmitToClientStateInput {
  hasPendingSubmittedVersion: boolean;
  hasChangesSincePendingSubmission: boolean;
}

export interface SubmitToClientState {
  submitDisabled: boolean;
  submitDisabledReason: string | null;
}

export function resolveSubmitToClientState(input: SubmitToClientStateInput): SubmitToClientState {
  const { hasPendingSubmittedVersion, hasChangesSincePendingSubmission } = input;
  if (!hasPendingSubmittedVersion) {
    return {
      submitDisabled: false,
      submitDisabledReason: null,
    };
  }
  if (hasChangesSincePendingSubmission) {
    return {
      submitDisabled: false,
      submitDisabledReason: null,
    };
  }
  return {
    submitDisabled: true,
    submitDisabledReason: "No changes since last submission",
  };
}
