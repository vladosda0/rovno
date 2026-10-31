import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const activeOrgMock = vi.fn();
const fetchMock = vi.fn();
const partyDetailsMock = vi.fn();

vi.mock("@/hooks/use-orgs", () => ({
  useActiveOrg: () => activeOrgMock(),
  useUserOrganizations: () => ({ data: [activeOrgMock()].filter(Boolean), isLoading: false }),
  orgQueryKeys: { all: () => ["orgs"] },
}));
vi.mock("@/data/contractor-profile-source", () => ({
  fetchContractorProfile: (...args: unknown[]) => fetchMock(...args),
}));
vi.mock("@/data/requisites-lookup-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/requisites-lookup-source")>()),
  lookupPartyDetails: (...args: unknown[]) => partyDetailsMock(...args),
}));
vi.mock("@/components/upload/MultiStepUploadModal", () => ({
  MultiStepUploadModal: ({ open }: { open: boolean }) => (open ? <div data-testid="visitka-form" /> : null),
}));

import { OrgContractorCardView } from "@/components/home/documents-hub/leaves/OrgContractorCardView";

const profile = {
  id: "p1",
  org_id: "o1",
  display_name: "ООО Ремонт",
  contacts: { phone: "+7 812 000-00-00", telegram: "@remont", whatsapp: "+7 921 000-00-00", website: "https://remont.ru" },
  region: "Спб",
  specializations: ["отделка"],
  experience_years: 12,
  avatar_url: null,
  description: "Ремонт под ключ",
  inn: "7800000000",
  appearance: {},
  status: "draft",
};

const details = {
  type: "legal",
  legalName: "ООО «РЕМОНТ»",
  inn: "7800000000",
  kpp: "780001001",
  ogrn: "1027800000000",
  legalAddress: "г. Санкт-Петербург",
  addressIncomplete: false,
  addressHint: null,
  signatoryName: "Иванов И. И.",
  signatoryPosition: "Директор",
  status: "active",
};

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OrgContractorCardView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

async function openCard() {
  fireEvent.click(await screen.findByRole("button", { name: /Open the card of/ }));
  return screen.findByTestId("card-window");
}

describe("OrgContractorCardView", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    activeOrgMock.mockReset().mockReturnValue({ id: "o1", name: "Org", role: "owner" });
    fetchMock.mockReset().mockResolvedValue(profile);
    partyDetailsMock.mockReset().mockResolvedValue({ status: "ok", value: details });
  });

  it("keeps the no-organization placeholder", () => {
    activeOrgMock.mockReturnValue(null);
    renderView();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Open the card of/ })).not.toBeInTheDocument();
  });

  it("offers an owner without a card to create one", async () => {
    fetchMock.mockResolvedValue(null);
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: /Create/ }));
    expect(screen.getByTestId("visitka-form")).toBeInTheDocument();
  });

  it("tells a member there is no card, with no button", async () => {
    fetchMock.mockResolvedValue(null);
    activeOrgMock.mockReturnValue({ id: "o1", name: "Org", role: "member" });
    renderView();
    expect(await screen.findByText("The organization has no card yet")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not read a failed load as a missing card", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    renderView();
    expect(await screen.findByText("Could not load the card")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create/ })).not.toBeInTheDocument();
  });

  it("shows the card with the registry tag and one lookup", async () => {
    renderView();
    expect(await screen.findByText("Organization verified", { exact: false })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(partyDetailsMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a shown card when a background refresh fails", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OrgContractorCardView />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: /Open the card of/ });
    fetchMock.mockRejectedValue(new Error("boom"));
    await queryClient.refetchQueries();
    await waitFor(() => expect(queryClient.getQueryState(["orgs", "contractor-profile", "o1"])?.status).toBe("error"));
    expect(screen.getByRole("button", { name: /Open the card of/ })).toBeInTheDocument();
  });

  it("opens the window with working links and full requisites", async () => {
    renderView();
    await openCard();
    expect((await screen.findByRole("link", { name: "+7 812 000-00-00" })).getAttribute("href")).toBe("tel:+78120000000");
    expect(screen.getByRole("link", { name: "@remont" }).getAttribute("href")).toBe("https://t.me/remont");
    expect(screen.getByRole("link", { name: "+7 921 000-00-00" }).getAttribute("href")).toBe("https://wa.me/79210000000");
    expect(screen.getByText("ООО «РЕМОНТ»")).toBeInTheDocument();
    expect(screen.getByText("7800000000 · 780001001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit business card" })).toBeInTheDocument();
  });

  it("hides requisites when the switch is off", async () => {
    fetchMock.mockResolvedValue({ ...profile, appearance: { show_requisites: false } });
    renderView();
    await openCard();
    expect(screen.queryByTestId("card-requisites")).not.toBeInTheDocument();
  });

  it("shows only the INN when the registry does not answer", async () => {
    partyDetailsMock.mockResolvedValue({ status: "unavailable" });
    renderView();
    await openCard();
    await waitFor(() => expect(screen.getByTestId("card-requisites").textContent).toContain("7800000000"));
    expect(screen.getByTestId("card-requisites").textContent).not.toContain("1027800000000");
    expect(screen.queryByTestId("party-status-tag")).not.toBeInTheDocument();
  });

  it("leaves out empty fields", async () => {
    fetchMock.mockResolvedValue({ ...profile, contacts: { phone: "+7 812 000-00-00" }, description: null, specializations: [], inn: null });
    renderView();
    await openCard();
    expect(screen.queryByText("About")).not.toBeInTheDocument();
    expect(screen.queryByText("Social media and messengers")).not.toBeInTheDocument();
    expect(screen.queryByText("Requisites")).not.toBeInTheDocument();
  });

  it("gives a member the card and the window without editing", async () => {
    activeOrgMock.mockReturnValue({ id: "o1", name: "Org", role: "member" });
    renderView();
    await openCard();
    expect(screen.queryByRole("button", { name: "Edit business card" })).not.toBeInTheDocument();
  });

  it("opens the form after the window closes", async () => {
    stubReducedMotion(true);
    renderView();
    await openCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit business card" }));
    expect(screen.queryByTestId("visitka-form")).not.toBeInTheDocument();
    await screen.findByTestId("visitka-form");
    expect(screen.queryByTestId("card-window")).not.toBeInTheDocument();
  });

  it("with reduced motion the window fades in without turning", async () => {
    stubReducedMotion(true);
    renderView();
    const dialog = await openCard();
    expect(dialog.getAttribute("data-reduced-motion")).toBe("true");
    await waitFor(() => expect(screen.getByTestId("card-spin").style.transform).toBe("rotateY(0deg)"));
  });

  it("turns the card over without reduced motion", async () => {
    stubReducedMotion(false);
    renderView();
    await openCard();
    await waitFor(() => expect(screen.getByTestId("card-spin").style.transform).toBe("rotateY(180deg)"));
  });

  it("Escape closes the window and returns focus to the card", async () => {
    stubReducedMotion(true);
    renderView();
    const dialog = await openCard();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("card-window")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: /Open the card of/ })));
  });
});
