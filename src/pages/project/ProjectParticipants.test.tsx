import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectParticipants from "@/pages/project/ProjectParticipants";
import type { WorkspaceProjectInvite } from "@/data/workspace-source";
import * as workspaceSource from "@/data/workspace-source";
import {
  __unsafeResetStoreForTests,
  addMember,
  addProject,
  addProjectInvite,
  updateMember,
} from "@/data/store";
import {
  clearDemoSession,
  clearStoredAuthProfile,
  setAuthRole,
  setStoredAuthProfile,
} from "@/lib/auth-state";
import * as useMockData from "@/hooks/use-mock-data";
import * as toastModule from "@/hooks/use-toast";
import * as permissions from "@/lib/permissions";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderParticipants() {
  const queryClient = createQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/project/project-1/participants"]}>
        <Routes>
          <Route path="/project/:id/participants" element={<ProjectParticipants />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function activateTab(name: "Members" | "Invitations" | "Permissions") {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
  await waitFor(() => {
    expect(tab).toHaveAttribute("data-state", "active");
  });
}

describe("ProjectParticipants", () => {
  let profileId: string;

  beforeEach(() => {
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      writable: true,
      value: MouseEvent,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: () => {},
    });

    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    setAuthRole("guest");
    clearStoredAuthProfile();
    clearDemoSession();

    const profile = setStoredAuthProfile({
      email: "owner@example.com",
      name: "Owner User",
    });
    profileId = profile.id;
    setAuthRole("owner");
    __unsafeResetStoreForTests();

    addProject({
      id: "project-1",
      owner_id: profile.id,
      title: "Workspace Project",
      type: "residential",
      project_mode: "contractor",
      automation_level: "assisted",
      current_stage_id: "",
      progress_pct: 0,
    });
    addMember({
      project_id: "project-1",
      user_id: profile.id,
      role: "owner",
      ai_access: "project_pool",
      finance_visibility: "detail",
      credit_limit: 500,
      used_credits: 0,
    });
    addMember({
      project_id: "project-1",
      user_id: "member-2",
      role: "contractor",
      ai_access: "consult_only",
      finance_visibility: "summary",
      credit_limit: 100,
      used_credits: 10,
      internal_docs_visibility: "view",
    } as never);
    addProjectInvite({
      id: "invite-1",
      project_id: "project-1",
      email: "invitee@example.com",
      role: "contractor",
      ai_access: "consult_only",
      viewer_regime: null,
      credit_limit: 50,
      invited_by: profile.id,
      status: "pending",
      invite_token: "invite-token-1",
      accepted_profile_id: null,
      created_at: "2026-03-07T10:00:00.000Z",
      accepted_at: null,
      finance_visibility: "detail",
      internal_docs_visibility: "view",
    } as WorkspaceProjectInvite, "local");
  });

  it("renders Members, Invitations, and Permissions tabs with Members open by default", () => {
    renderParticipants();

    expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Invitations" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Permissions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Active members" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pending invitations" })).not.toBeInTheDocument();
  });

  it("keeps pending invites primary and invite history secondary in Invitations", async () => {
    addProjectInvite({
      id: "invite-accepted",
      project_id: "project-1",
      email: "accepted@example.com",
      role: "viewer",
      ai_access: "none",
      viewer_regime: "client",
      credit_limit: 10,
      invited_by: profileId,
      status: "accepted",
      invite_token: "invite-token-accepted",
      accepted_profile_id: profileId,
      created_at: "2026-03-07T10:00:00.000Z",
      accepted_at: "2026-03-07T12:00:00.000Z",
      finance_visibility: "none",
      internal_docs_visibility: "none",
    } as WorkspaceProjectInvite, "local");

    renderParticipants();

    await activateTab("Invitations");

    const pendingSection = screen.getByRole("heading", { name: "Pending invitations" }).closest("section");
    const historySection = screen.getByRole("heading", { name: "Invite history" }).closest("section");
    expect(pendingSection).not.toBeNull();
    expect(historySection).not.toBeNull();

    const pendingTable = within(pendingSection as HTMLElement).getByRole("table");
    const historyTable = within(historySection as HTMLElement).getByRole("table");
    expect(within(pendingTable).getByText("invitee@example.com")).toBeInTheDocument();
    expect(within(historyTable).getByText("accepted@example.com")).toBeInTheDocument();
    expect(within(pendingTable).queryByText("accepted@example.com")).not.toBeInTheDocument();
  });

  it("opens the same canonical access dialog from Members and Invitations", async () => {
    renderParticipants();

    const membersTable = screen.getByRole("table");
    const memberRow = within(membersTable).getByText("member-2").closest("tr");
    fireEvent.pointerDown(within(memberRow as HTMLElement).getByRole("button"), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit access" }));

    let dialog = screen.getByRole("dialog", { name: "Edit access: member-2" });
    expect(within(dialog).getByText("This is the canonical Participants access editor. Role presets and bounded overrides are managed here together.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await activateTab("Invitations");
    const inviteSection = screen.getByRole("heading", { name: "Pending invitations" }).closest("section");
    const inviteTable = within(inviteSection as HTMLElement).getByRole("table");
    const inviteRow = within(inviteTable).getByText("invitee@example.com").closest("tr");
    fireEvent.pointerDown(within(inviteRow as HTMLElement).getByRole("button"), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit access" }));

    dialog = screen.getByRole("dialog", { name: "Edit access: invitee@example.com" });
    expect(within(dialog).getByText("This is the canonical Participants access editor. Role presets and bounded overrides are managed here together.")).toBeInTheDocument();
  });

  it("updates access from the shared dialog", async () => {
    renderParticipants();

    await activateTab("Permissions");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit access" })[0]);

    const dialog = screen.getByRole("dialog", { name: "Edit access: member-2" });
    const roleSelect = within(dialog).getAllByRole("combobox")[0];
    fireEvent.click(roleSelect);
    fireEvent.click(await screen.findByText("Viewer"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save access" }));

    await waitFor(() => {
      expect(screen.getByText("Viewer")).toBeInTheDocument();
    });
  });

  it("removes unsupported role transitions for co_owner", async () => {
    const profile = setStoredAuthProfile({
      email: "owner@example.com",
      name: "Owner User",
    });
    setAuthRole("co_owner");
    updateMember("project-1", profile.id, {
      role: "co_owner",
      ai_access: "project_pool",
      finance_visibility: "detail",
      internal_docs_visibility: "view",
    } as never);

    renderParticipants();

    await activateTab("Permissions");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit access" })[0]);

    const dialog = screen.getByRole("dialog", { name: /Edit access:/ });
    fireEvent.click(within(dialog).getAllByRole("combobox")[0]);
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("Contractor")).toBeInTheDocument();
    expect(within(listbox).getByText("Viewer")).toBeInTheDocument();
    expect(within(listbox).queryByText("Co-owner")).not.toBeInTheDocument();
    expect(within(listbox).queryByText("Owner")).not.toBeInTheDocument();
  });

  it("shows no permission edit entry points for contractor actors", () => {
    const profile = setStoredAuthProfile({
      email: "owner@example.com",
      name: "Owner User",
    });
    setAuthRole("contractor");
    updateMember("project-1", profile.id, {
      role: "contractor",
      ai_access: "consult_only",
      finance_visibility: "none",
    } as never);

    renderParticipants();

    expect(screen.queryByRole("button", { name: "Invite" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit access" })).not.toBeInTheDocument();
  });

  it("does not show Resend email for pending invites in local workspace mode", async () => {
    renderParticipants();

    await activateTab("Invitations");
    const inviteSection = screen.getByRole("heading", { name: "Pending invitations" }).closest("section");
    const inviteTable = within(inviteSection as HTMLElement).getByRole("table");
    const inviteRow = within(inviteTable).getByText("invitee@example.com").closest("tr");
    fireEvent.pointerDown(within(inviteRow as HTMLElement).getByRole("button"), { button: 0, ctrlKey: false });

    expect(await screen.findByRole("menuitem", { name: "Edit access" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Resend email" })).not.toBeInTheDocument();
  });

  it("defaults contractor invite finance visibility to non-detail and requires unlock for non-standard expansion", async () => {
    renderParticipants();

    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    const dialog = screen.getByRole("dialog", { name: "Invite participant" });

    expect(within(dialog).getByText("No finance visibility")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Unlock non-standard finance access" })).toBeInTheDocument();
  });

  it("shows non-standard customization summary after unlocking contractor finance expansion", async () => {
    renderParticipants();

    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    const dialog = screen.getByRole("dialog", { name: "Invite participant" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlock non-standard finance access" }));

    const comboBoxes = within(dialog).getAllByRole("combobox");
    fireEvent.click(comboBoxes[2]);
    fireEvent.click(await screen.findByText("Finance summary"));

    expect(within(dialog).getByText("Contractor has non-standard access settings")).toBeInTheDocument();
  });

  describe("Invite email delivery (Supabase)", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      vi.spyOn(toastModule, "toast").mockImplementation(() => {});
      vi.spyOn(useMockData, "useWorkspaceMode").mockReturnValue({ kind: "supabase", profileId });
      vi.spyOn(useMockData, "useCurrentUser").mockReturnValue({
        id: profileId,
        email: "owner@example.com",
        name: "Owner User",
        locale: "en",
        timezone: "UTC",
        plan: "free",
        credits_free: 0,
        credits_paid: 0,
      });
      vi.spyOn(useMockData, "useProject").mockReturnValue({
        project: {
          id: "project-1",
          owner_id: profileId,
          title: "Workspace Project",
          type: "residential",
          project_mode: "contractor",
          automation_level: "assisted",
          current_stage_id: "",
          progress_pct: 0,
        },
        members: [{
          project_id: "project-1",
          user_id: profileId,
          role: "owner",
          ai_access: "project_pool",
          finance_visibility: "detail",
          credit_limit: 500,
          used_credits: 0,
          internal_docs_visibility: "edit",
        } as never],
      });
      vi.spyOn(permissions, "usePermission").mockReturnValue({
        seam: {
          projectId: "project-1",
          profileId,
          membership: {
            project_id: "project-1",
            user_id: profileId,
            role: "owner",
            ai_access: "project_pool",
            finance_visibility: "detail",
            credit_limit: 500,
            used_credits: 0,
            internal_docs_visibility: "edit",
          } as never,
          project: undefined,
        },
        can: () => true,
        role: "owner",
      });
    });

    it("create invite + send success shows invitation sent", async () => {
      vi.spyOn(useMockData, "useProjectInvites").mockReturnValue([]);
      const uuidInvite = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      const created: WorkspaceProjectInvite = {
        id: uuidInvite,
        project_id: "project-1",
        email: "new@example.com",
        role: "contractor",
        ai_access: "consult_only",
        viewer_regime: null,
        credit_limit: 50,
        invited_by: profileId,
        status: "pending",
        invite_token: "tok",
        accepted_profile_id: null,
        created_at: new Date().toISOString(),
        accepted_at: null,
        finance_visibility: "detail",
        internal_docs_visibility: "view",
      } as WorkspaceProjectInvite;
      const createSpy = vi.spyOn(workspaceSource, "createWorkspaceProjectInvite").mockResolvedValue(created);
      const sendSpy = vi.spyOn(workspaceSource, "sendWorkspaceProjectInviteEmail").mockResolvedValue({
        kind: "sent",
        payload: {
          ok: true,
          inviteId: uuidInvite,
          recipientEmail: "new@example.com",
          providerMessageId: "msg-1",
        },
      });

      renderParticipants();

      fireEvent.click(screen.getByRole("button", { name: "Invite" }));
      fireEvent.change(screen.getByPlaceholderText("member@example.com"), { target: { value: "new@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Send Invite" }));

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalled();
        expect(sendSpy).toHaveBeenCalledWith({ kind: "supabase", profileId }, uuidInvite);
      });

      await waitFor(() => {
        expect(toastModule.toast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Invitation sent",
            description: expect.stringContaining("new@example.com"),
          }),
        );
      });
    });

    it("create invite + email failure keeps invite and reports truthful toast", async () => {
      vi.spyOn(useMockData, "useProjectInvites").mockReturnValue([]);
      const uuidInvite = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      const created: WorkspaceProjectInvite = {
        id: uuidInvite,
        project_id: "project-1",
        email: "fail@example.com",
        role: "contractor",
        ai_access: "consult_only",
        viewer_regime: null,
        credit_limit: 50,
        invited_by: profileId,
        status: "pending",
        invite_token: "tok",
        accepted_profile_id: null,
        created_at: new Date().toISOString(),
        accepted_at: null,
        finance_visibility: "detail",
        internal_docs_visibility: "view",
      } as WorkspaceProjectInvite;
      vi.spyOn(workspaceSource, "createWorkspaceProjectInvite").mockResolvedValue(created);
      vi.spyOn(workspaceSource, "sendWorkspaceProjectInviteEmail").mockRejectedValue(new Error("SMTP unavailable"));

      renderParticipants();

      fireEvent.click(screen.getByRole("button", { name: "Invite" }));
      fireEvent.change(screen.getByPlaceholderText("member@example.com"), { target: { value: "fail@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Send Invite" }));

      await waitFor(() => {
        expect(toastModule.toast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Invite created",
            variant: "destructive",
            description: expect.stringContaining("SMTP unavailable"),
          }),
        );
      });
    });

    it("resend success shows confirmation toast", async () => {
      const inviteRow: WorkspaceProjectInvite = {
        id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        project_id: "project-1",
        email: "pending@example.com",
        role: "contractor",
        ai_access: "consult_only",
        viewer_regime: null,
        credit_limit: 50,
        invited_by: profileId,
        status: "pending",
        invite_token: "tok",
        accepted_profile_id: null,
        created_at: new Date().toISOString(),
        accepted_at: null,
        finance_visibility: "detail",
        internal_docs_visibility: "view",
      } as WorkspaceProjectInvite;
      vi.spyOn(useMockData, "useProjectInvites").mockReturnValue([inviteRow]);
      const sendSpy = vi.spyOn(workspaceSource, "sendWorkspaceProjectInviteEmail").mockResolvedValue({
        kind: "sent",
        payload: {
          ok: true,
          inviteId: inviteRow.id,
          recipientEmail: "pending@example.com",
          providerMessageId: "r-1",
        },
      });

      renderParticipants();

      await activateTab("Invitations");
      const inviteSection = screen.getByRole("heading", { name: "Pending invitations" }).closest("section");
      const inviteTable = within(inviteSection as HTMLElement).getByRole("table");
      const row = within(inviteTable).getByText("pending@example.com").closest("tr");
      fireEvent.pointerDown(within(row as HTMLElement).getByRole("button"), { button: 0, ctrlKey: false });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Resend email" }));

      await waitFor(() => {
        expect(sendSpy).toHaveBeenCalledWith({ kind: "supabase", profileId }, inviteRow.id);
      });
      await waitFor(() => {
        expect(toastModule.toast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Invitation email sent" }),
        );
      });
    });

    it("resend failure shows destructive toast", async () => {
      const inviteRow: WorkspaceProjectInvite = {
        id: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        project_id: "project-1",
        email: "bad@example.com",
        role: "contractor",
        ai_access: "consult_only",
        viewer_regime: null,
        credit_limit: 50,
        invited_by: profileId,
        status: "pending",
        invite_token: "tok",
        accepted_profile_id: null,
        created_at: new Date().toISOString(),
        accepted_at: null,
        finance_visibility: "detail",
        internal_docs_visibility: "view",
      } as WorkspaceProjectInvite;
      vi.spyOn(useMockData, "useProjectInvites").mockReturnValue([inviteRow]);
      vi.spyOn(workspaceSource, "sendWorkspaceProjectInviteEmail").mockRejectedValue(new Error("Rate limited"));

      renderParticipants();

      await activateTab("Invitations");
      const inviteSection = screen.getByRole("heading", { name: "Pending invitations" }).closest("section");
      const inviteTable = within(inviteSection as HTMLElement).getByRole("table");
      const row = within(inviteTable).getByText("bad@example.com").closest("tr");
      fireEvent.pointerDown(within(row as HTMLElement).getByRole("button"), { button: 0, ctrlKey: false });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Resend email" }));

      await waitFor(() => {
        expect(toastModule.toast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Resend failed",
            variant: "destructive",
            description: "Rate limited",
          }),
        );
      });
    });
  });
});
