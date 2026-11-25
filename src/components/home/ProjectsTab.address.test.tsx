import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProjectsTab } from "@/components/home/ProjectsTab";
import { __unsafeResetStoreForTests, getProjects } from "@/data/store";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";
import enLocale from "@/locales/en.json";

const en = (key: string) => (enLocale as Record<string, string>)[key];

vi.mock("@/data/requisites-lookup-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/requisites-lookup-source")>()),
  lookupAddresses: async () => ({ status: "ok", value: [] }),
}));

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        <MemoryRouter>
          <ProjectsTab />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("ProjectsTab create form: optional site address (rovno#236)", () => {
  beforeEach(() => {
    __unsafeResetStoreForTests();
    clearDemoSession();
    enterDemoSession("project-1");
    setAuthRole("owner");
  });

  it("shows the optional field under the name with its help line", () => {
    renderTab();
    expect(screen.getByLabelText(new RegExp(en("projectsTab.addressLabel")))).toBeInTheDocument();
    expect(screen.getByText(en("projectsTab.addressOptional"))).toBeInTheDocument();
    expect(screen.getByText(en("projectsTab.addressHelp"))).toBeInTheDocument();
  });

  it("creates the project with the typed address", async () => {
    renderTab();
    fireEvent.change(screen.getByLabelText(new RegExp(en("projectsTab.nameLabel"))), { target: { value: "QA адрес" } });
    fireEvent.change(screen.getByLabelText(new RegExp(en("projectsTab.addressLabel"))), {
      target: { value: "СНТ Рассвет, участок 48" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: en("overview.createProject") })[0]);
    await waitFor(() => expect(getProjects().find((p) => p.title === "QA адрес")?.address).toBe("СНТ Рассвет, участок 48"));
  });

  it("creates the project without an address when the field is empty", async () => {
    renderTab();
    fireEvent.change(screen.getByLabelText(new RegExp(en("projectsTab.nameLabel"))), { target: { value: "QA без адреса" } });
    fireEvent.click(screen.getAllByRole("button", { name: en("overview.createProject") })[0]);
    await waitFor(() => expect(getProjects().some((p) => p.title === "QA без адреса")).toBe(true));
    expect(getProjects().find((p) => p.title === "QA без адреса")?.address).toBeUndefined();
  });
});
