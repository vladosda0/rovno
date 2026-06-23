import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfilePanel } from "@/components/settings/panels/ProfilePanel";

// vi.mock factories are hoisted above the imports, so the handles they reference
// must be created with vi.hoisted (also hoisted) rather than module-scope consts.
const {
  mockUseWorkspaceMode,
  mockIdentityMutate,
  mockContactMutate,
  mockUploadAvatar,
  mockNavigate,
  mockToast,
} = vi.hoisted(() => ({
  mockUseWorkspaceMode: vi.fn(),
  mockIdentityMutate: vi.fn(),
  mockContactMutate: vi.fn(),
  mockUploadAvatar: vi.fn(),
  mockNavigate: vi.fn(),
  mockToast: vi.fn(),
}));

const CURRENT_USER = {
  id: "u1",
  email: "a@b.co",
  name: "Alex Builder",
  avatar: undefined as string | undefined,
  locale: "en",
  timezone: "Europe/Moscow",
  plan: "free" as const,
  credits_free: 0,
  credits_paid: 0,
};
const CONTACT_INFO = { roleTitle: "Foreman", phone: "+7900", bio: "Bio text", signatureBlock: "Sig" };

vi.mock("@/hooks/use-mock-data", () => ({ useCurrentUser: () => CURRENT_USER }));
vi.mock("@/hooks/use-workspace-source", () => ({
  useWorkspaceMode: () => mockUseWorkspaceMode(),
  useWorkspaceProfileContactInfoState: () => ({ contactInfo: CONTACT_INFO, isLoading: false }),
  useUpdateWorkspaceProfileIdentity: () => ({ mutateAsync: mockIdentityMutate, isPending: false }),
  useUpdateWorkspaceProfileContactInfo: () => ({ mutateAsync: mockContactMutate, isPending: false }),
}));
vi.mock("@/hooks/use-avatar-upload", () => ({ useAvatarUpload: () => ({ uploadAvatar: mockUploadAvatar }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: (args: unknown) => mockToast(args) }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const SAVE_BUTTON = "Save changes";
const AVATAR_BUTTON = "Upload photo";
const LOGIN_BUTTON = /log in/i;
const SIGN_IN_HINT = "Sign in to edit your profile.";

describe("ProfilePanel session gating", () => {
  beforeEach(() => {
    mockIdentityMutate.mockResolvedValue(CURRENT_USER);
    mockContactMutate.mockResolvedValue(CONTACT_INFO);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // demo / local write to the in-memory store and supabase writes to the real
  // backend — all three must keep working (do NOT regress demo/local editing).
  it.each([
    { label: "demo", mode: { kind: "demo" as const } },
    { label: "local", mode: { kind: "local" as const } },
    { label: "supabase", mode: { kind: "supabase" as const, profileId: "u1" } },
  ])("keeps Save working and shows no sign-in prompt in $label mode", async ({ mode }) => {
    mockUseWorkspaceMode.mockReturnValue(mode);

    render(<ProfilePanel />);

    expect(screen.queryByText(SIGN_IN_HINT)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: AVATAR_BUTTON })).toBeEnabled();

    // Dirty the form, then Save.
    fireEvent.change(screen.getByDisplayValue("Alex Builder"), { target: { value: "Alex B" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    await waitFor(() => expect(mockIdentityMutate).toHaveBeenCalledTimes(1));
    expect(mockContactMutate).toHaveBeenCalledTimes(1);
  });

  it("gates Save behind sign-in and disables avatar upload in guest mode", () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "guest" });

    render(<ProfilePanel />);

    // The doomed Save action is replaced by the sign-in prompt.
    expect(screen.getByText(SIGN_IN_HINT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: LOGIN_BUTTON })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SAVE_BUTTON })).not.toBeInTheDocument();
    // Avatar upload would error ("Not authenticated"), so its trigger is disabled.
    expect(screen.getByRole("button", { name: AVATAR_BUTTON })).toBeDisabled();
    expect(mockIdentityMutate).not.toHaveBeenCalled();
    expect(mockContactMutate).not.toHaveBeenCalled();
  });

  it("routes the guest sign-in CTA to /auth/login", () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "guest" });

    render(<ProfilePanel />);
    fireEvent.click(screen.getByRole("button", { name: LOGIN_BUTTON }));

    expect(mockNavigate).toHaveBeenCalledWith("/auth/login");
  });

  // pending-supabase is the brief auth-resolving window: keep the form quiet (no
  // sign-in flash for a user who is about to authenticate) but block the write.
  it("keeps Save visible-but-disabled and shows no prompt while auth is pending", () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "pending-supabase" });

    render(<ProfilePanel />);

    expect(screen.queryByText(SIGN_IN_HINT)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: SAVE_BUTTON })).toBeDisabled();
    expect(screen.getByRole("button", { name: AVATAR_BUTTON })).toBeDisabled();
  });
});
