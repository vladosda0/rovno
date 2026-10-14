import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { ClientReportDialogHost } from "@/components/client-report/ClientReportDialogHost";
import {
  closeClientReportDialog,
  getClientReportDialogProjectId,
  openClientReportDialog,
} from "@/lib/client-report-dialog";

vi.mock("@/components/client-report/ClientReportDialog", () => ({
  ClientReportDialog: ({ projectId }: { projectId: string }) => <div>report for {projectId}</div>,
}));

function Go({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(to)}>{to}</button>;
}

function renderHost(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ClientReportDialogHost />
      <Go to="/project/project-1/tasks" />
      <Go to="/project/project-2/dashboard" />
      <Go to="/home" />
    </MemoryRouter>,
  );
}

describe("ClientReportDialogHost", () => {
  afterEach(() => act(() => closeClientReportDialog()));

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
