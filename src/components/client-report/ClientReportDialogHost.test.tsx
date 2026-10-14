import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { ClientReportDialogHost } from "@/components/client-report/ClientReportDialogHost";
import {
  closeClientReportDialog,
  getClientReportDialogProjectId,
  openClientReportDialog,
} from "@/lib/client-report-dialog";

vi.mock("@/components/client-report/ClientReportDialog", () => ({
  ClientReportDialog: ({ projectId }: { projectId: string }) => <div>report for {projectId}</div>,
}));

const access = vi.hoisted(() => ({
  role: "owner" as string,
  kind: "supabase" as string,
  isLoading: false,
  userLoading: false,
}));

vi.mock("@/hooks/use-workspace-source", () => ({
  useWorkspaceCurrentUserState: () => ({ user: { id: "profile-1" }, isLoading: access.userLoading }),
}));

vi.mock("@/hooks/use-mock-data", () => ({
  useWorkspaceMode: () => ({ kind: access.kind }),
}));

vi.mock("@/lib/permissions", () => ({
  getProjectRole: (seam: { role: string }) => seam.role,
  usePermission: () => ({ seam: { role: access.role }, isLoading: access.isLoading }),
}));

function Where() {
  const location = useLocation();
  return <span data-testid="where">{location.pathname + location.search}</span>;
}

function Go({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(to)}>{to}</button>;
}

function renderHost(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ClientReportDialogHost />
      <Where />
      <Go to="/project/project-1/tasks" />
      <Go to="/project/project-1/dashboard?report=client" />
      <Go to="/project/project-2/dashboard" />
      <Go to="/home" />
    </MemoryRouter>,
  );
}

describe("ClientReportDialogHost", () => {
  afterEach(() => {
    act(() => closeClientReportDialog());
    Object.assign(access, { role: "owner", kind: "supabase", isLoading: false, userLoading: false });
  });

  describe("the address ?report=client", () => {
    it("opens the dialog of the project for an owner and takes the mark out of the address", async () => {
      renderHost("/project/project-1/dashboard?report=client&x=1");

      expect(await screen.findByText("report for project-1")).toBeInTheDocument();
      expect(screen.getByTestId("where")).toHaveTextContent("/project/project-1/dashboard?x=1");
    });

    it("opens it when the person comes from another page, where the project of the route changes", async () => {
      renderHost("/home");

      fireEvent.click(screen.getByRole("button", { name: "/project/project-1/dashboard?report=client" }));

      expect(await screen.findByText("report for project-1")).toBeInTheDocument();
      expect(screen.getByTestId("where")).toHaveTextContent(/^\/project\/project-1\/dashboard$/);
    });

    it("opens it again from a message while the person is already on that page", async () => {
      renderHost("/project/project-1/dashboard?report=client");
      await screen.findByText("report for project-1");
      act(() => closeClientReportDialog());

      fireEvent.click(screen.getByRole("button", { name: "/project/project-1/dashboard?report=client" }));

      expect(await screen.findByText("report for project-1")).toBeInTheDocument();
    });

    it("waits for the role to load", async () => {
      access.isLoading = true;
      const view = renderHost("/project/project-1/dashboard?report=client");
      expect(getClientReportDialogProjectId()).toBeNull();
      expect(screen.getByTestId("where")).toHaveTextContent("report=client");

      access.isLoading = false;
      view.rerender(
        <MemoryRouter initialEntries={["/project/project-1/dashboard?report=client"]}>
          <ClientReportDialogHost />
          <Where />
        </MemoryRouter>,
      );

      expect(await screen.findByText("report for project-1")).toBeInTheDocument();
    });

    it("waits for the person's own profile too: until it loads the role reads as a viewer's", async () => {
      Object.assign(access, { userLoading: true, role: "viewer" });
      const view = renderHost("/project/project-1/dashboard?report=client");
      expect(getClientReportDialogProjectId()).toBeNull();
      expect(screen.getByTestId("where")).toHaveTextContent("report=client");

      Object.assign(access, { userLoading: false, role: "owner" });
      view.rerender(
        <MemoryRouter initialEntries={["/project/project-1/dashboard?report=client"]}>
          <ClientReportDialogHost />
          <Where />
        </MemoryRouter>,
      );

      expect(await screen.findByText("report for project-1")).toBeInTheDocument();
    });

    it.each([
      ["a contractor", { role: "contractor", kind: "supabase" }],
      ["a viewer", { role: "viewer", kind: "supabase" }],
      ["the demo workspace", { role: "owner", kind: "demo" }],
    ])("does not open it for %s, and still cleans the address", (_name, patch) => {
      Object.assign(access, patch);
      renderHost("/project/project-1/dashboard?report=client");

      expect(getClientReportDialogProjectId()).toBeNull();
      expect(screen.getByTestId("where")).toHaveTextContent(/^\/project\/project-1\/dashboard$/);
    });

    it("ignores the mark outside a project", () => {
      renderHost("/home?report=client");

      expect(getClientReportDialogProjectId()).toBeNull();
      expect(screen.getByTestId("where")).toHaveTextContent("/home?report=client");
    });
  });

  it("keeps the dialog while the user moves inside the same project", async () => {
    renderHost("/project/project-1/dashboard");
    act(() => openClientReportDialog("project-1"));
    expect(await screen.findByText("report for project-1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "/project/project-1/tasks" }));

    expect(getClientReportDialogProjectId()).toBe("project-1");
  });

  it("closes the dialog when the route moves to another project", async () => {
    renderHost("/project/project-1/dashboard");
    act(() => openClientReportDialog("project-1"));
    await screen.findByText("report for project-1");

    fireEvent.click(screen.getByRole("button", { name: "/project/project-2/dashboard" }));

    expect(getClientReportDialogProjectId()).toBeNull();
    expect(screen.queryByText("report for project-1")).toBeNull();
  });

  it("closes the dialog when the user leaves the project routes", async () => {
    renderHost("/project/project-1/dashboard");
    act(() => openClientReportDialog("project-1"));
    await screen.findByText("report for project-1");

    fireEvent.click(screen.getByRole("button", { name: "/home" }));

    expect(getClientReportDialogProjectId()).toBeNull();
  });

  it("stays open when it was opened from the home page for a picked project", async () => {
    renderHost("/home");
    act(() => openClientReportDialog("project-9"));

    expect(await screen.findByText("report for project-9")).toBeInTheDocument();
    expect(getClientReportDialogProjectId()).toBe("project-9");
  });

  it("clears the open project when the host unmounts", async () => {
    const view = renderHost("/project/project-1/dashboard");
    act(() => openClientReportDialog("project-1"));
    await screen.findByText("report for project-1");

    view.unmount();

    expect(getClientReportDialogProjectId()).toBeNull();
  });
});
