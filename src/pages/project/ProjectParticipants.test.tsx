import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectParticipants from "@/pages/project/ProjectParticipants";
import {
  __unsafeResetStoreForTests,
  addMember,
  addProject,
  addProjectInvite,
} from "@/data/store";
import { clearDemoSession, clearStoredAuthProfile, setAuthRole, setStoredAuthProfile } from "@/lib/auth-state";

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
});
