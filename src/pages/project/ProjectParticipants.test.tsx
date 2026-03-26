import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
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
import { clearDemoSession, clearStoredAuthProfile, setAuthRole, setStoredAuthProfile } from "@/lib/auth-state";
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
      credit_limit: 500,
      used_credits: 0,
    });
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
    }, "local");
  });

  it("renders members and invitations in separate tables and updates invite roles immediately", async () => {
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

    const memberSection = screen.getByRole("heading", { name: "Members" }).closest("section");
    const inviteSection = screen.getByRole("heading", { name: "Invitations" }).closest("section");
    expect(memberSection).not.toBeNull();
    expect(inviteSection).not.toBeNull();

    const inviteTable = within(inviteSection as HTMLElement).getByRole("table");
    const inviteHeaders = within(inviteTable).getAllByRole("columnheader").map((header) => header.textContent);
    expect(inviteHeaders).toEqual(["Email", "Invited by", "Role", "Status", "Actions"]);
    expect(within(inviteTable).getByText("invitee@example.com")).toBeInTheDocument();

    const inviteRow = within(inviteTable).getByText("invitee@example.com").closest("tr");
    expect(inviteRow).not.toBeNull();
    fireEvent.pointerDown(within(inviteRow as HTMLElement).getByRole("button"), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Change role" }));

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Viewer"));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    expect(await within(inviteTable).findByText("Viewer")).toBeInTheDocument();
  });

  it("does not offer co_owner as a role option when the actor is co_owner", async () => {
    const queryClient = createQueryClient();

    // Adjust existing store membership to a co_owner actor.
    const profile = setStoredAuthProfile({
      email: "owner@example.com",
      name: "Owner User",
    });
    setAuthRole("co_owner");
    updateMember("project-1", profile.id, {
      role: "co_owner",
      ai_access: "project_pool",
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/project/project-1/participants"]}>
          <Routes>
            <Route path="/project/:id/participants" element={<ProjectParticipants />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const inviteSection = screen.getByRole("heading", { name: "Invitations" }).closest("section");
    const inviteTable = within(inviteSection as HTMLElement).getByRole("table");
    const inviteRow = within(inviteTable).getByText("invitee@example.com").closest("tr");

    fireEvent.pointerDown(within(inviteRow as HTMLElement).getByRole("button"), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Change role" }));

    const coOwnerCountBefore = screen.queryAllByText("Co-owner").length;
    const contractorCountBefore = screen.queryAllByText("Contractor").length;
    const viewerCountBefore = screen.queryAllByText("Viewer").length;
    fireEvent.click(screen.getByRole("combobox"));

    // Co-owner should not be available for role change by a co_owner actor.
    const coOwnerCountAfter = screen.queryAllByText("Co-owner").length;
    expect(coOwnerCountAfter).toBe(coOwnerCountBefore);
    expect(screen.queryAllByText("Contractor").length).toBeGreaterThan(contractorCountBefore);
    expect(screen.queryAllByText("Viewer").length).toBeGreaterThan(viewerCountBefore);
  });

  it("does not show Resend email for pending invites in local workspace mode", async () => {
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

    const inviteSection = screen.getByRole("heading", { name: "Invitations" }).closest("section");
    const inviteTable = within(inviteSection as HTMLElement).getByRole("table");
    const inviteRow = within(inviteTable).getByText("invitee@example.com").closest("tr");

    fireEvent.pointerDown(within(inviteRow as HTMLElement).getByRole("button"), { button: 0, ctrlKey: false });
    expect(await screen.findByRole("menuitem", { name: "Change role" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Resend email" })).not.toBeInTheDocument();
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
          credit_limit: 500,
          used_credits: 0,
        }],
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
            credit_limit: 500,
            used_credits: 0,
          },
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
      };
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
      };
      vi.spyOn(workspaceSource, "createWorkspaceProjectInvite").mockResolvedValue(created);
      vi.spyOn(workspaceSource, "sendWorkspaceProjectInviteEmail").mockRejectedValue(new Error("SMTP unavailable"));

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
      };
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

      const inviteSection = screen.getByRole("heading", { name: "Invitations" }).closest("section");
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
      };
      vi.spyOn(useMockData, "useProjectInvites").mockReturnValue([inviteRow]);
      vi.spyOn(workspaceSource, "sendWorkspaceProjectInviteEmail").mockRejectedValue(new Error("Rate limited"));

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

      const inviteSection = screen.getByRole("heading", { name: "Invitations" }).closest("section");
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
