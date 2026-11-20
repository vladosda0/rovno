import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const orgsMock = vi.fn();
const activeOrgMock = vi.fn();
const createMock = vi.fn();
const upsertMock = vi.fn();
const submitMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/hooks/use-orgs", () => ({
  useUserOrganizations: () => orgsMock(),
  useActiveOrg: () => activeOrgMock(),
  orgQueryKeys: { all: () => ["orgs"] },
}));
vi.mock("@/data/contractor-profile-source", () => ({
  createOrgWithContractorProfile: (...args: unknown[]) => createMock(...args),
  upsertContractorProfileForOrg: (...args: unknown[]) => upsertMock(...args),
  submitContractorProfileForModeration: (...args: unknown[]) => submitMock(...args),
  fetchContractorProfile: (...args: unknown[]) => fetchMock(...args),
}));
const partyDetailsMock = vi.fn();
vi.mock("@/data/requisites-lookup-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/requisites-lookup-source")>()),
  lookupPartyDetails: (...args: unknown[]) => partyDetailsMock(...args),
}));
const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));
const uploadAvatarMock = vi.fn();
vi.mock("@/hooks/use-avatar-upload", () => ({
  useAvatarUpload: () => ({ uploadAvatar: uploadAvatarMock }),
}));

const imageSizeMock = vi.fn().mockResolvedValue(null);
const cropMock = vi.fn();
vi.mock("@/lib/image-file", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/image-file")>()),
  readImageSize: (...args: unknown[]) => imageSizeMock(...args),
  cropImageFile: (...args: unknown[]) => cropMock(...args),
}));
vi.mock("react-easy-crop", async () => {
  const { useEffect } = await import("react");
  function CropperStub({ onCropComplete }: { onCropComplete: (area: unknown, pixels: unknown) => void }) {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => onCropComplete({}, { x: 0, y: 0, width: 10, height: 10 }), []);
    return <div data-testid="cropper" />;
  }
  return { default: CropperStub };
});

import { VisitkaForm } from "@/components/upload/forms/VisitkaForm";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <VisitkaForm onBack={() => {}} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("VisitkaForm", () => {
  beforeEach(() => {
    orgsMock.mockReset();
    fetchMock.mockReset().mockResolvedValue(null);
    activeOrgMock.mockReset();
    createMock.mockReset().mockResolvedValue({ org_id: "new-org", profile_id: "new-profile" });
    upsertMock.mockReset().mockResolvedValue({ org_id: "o1", profile_id: "p1" });
    submitMock.mockReset().mockResolvedValue({ org_id: "o1", profile_id: "p1", status: "pending_moderation" });
    uploadAvatarMock.mockReset().mockResolvedValue({ url: "https://cdn/avatars/a.jpg", path: "u/a.jpg" });
  });

  it("uploads a selected avatar and passes its URL through to the RPC", async () => {
    orgsMock.mockReturnValue({ data: [{ id: "o1", name: "Org", role: "owner" }], isLoading: false });
    activeOrgMock.mockReturnValue({ id: "o1", name: "Org", role: "owner" });
    const { container } = renderForm();
    await screen.findByPlaceholderText(/How clients will see you/i);

    fireEvent.change(screen.getByPlaceholderText(/How clients will see you/i), {
      target: { value: "Builder" },
    });
    fireEvent.change(screen.getByPlaceholderText("username"), { target: { value: "@builder" } });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["x"], "logo.png", { type: "image/png" })] } });

    await waitFor(() => expect(uploadAvatarMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));

    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    expect(upsertMock).toHaveBeenCalledWith(
      "o1",
      expect.objectContaining({ avatar_url: "https://cdn/avatars/a.jpg" }),
    );
  });

  it("creates an org + profile for a solo user (no org), deriving the slug", async () => {
    orgsMock.mockReturnValue({ data: [], isLoading: false });
    activeOrgMock.mockReturnValue(null);
    renderForm();
    await screen.findByPlaceholderText(/How clients will see you/i);

    // Org-creation section is shown when the user has no org.
    expect(screen.getByText(/Creating your organization/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/How clients will see you/i), {
      target: { value: "Моя Бригада" },
    });
    fireEvent.change(screen.getByPlaceholderText("mail@example.com"), {
      target: { value: "team@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const [orgName, slug, profile] = createMock.mock.calls[0];
    expect(orgName).toBe("Моя Бригада");
    expect(slug).toBe("moya-brigada");
    expect(profile).toEqual(expect.objectContaining({ display_name: "Моя Бригада" }));
    expect(profile.contacts).toEqual(expect.objectContaining({ email: "team@example.com" }));
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("upserts the profile for an existing org without creating a new one", async () => {
    orgsMock.mockReturnValue({ data: [{ id: "o1", name: "Org", role: "owner" }], isLoading: false });
    activeOrgMock.mockReturnValue({ id: "o1", name: "Org", role: "owner" });
    renderForm();
    await screen.findByPlaceholderText(/How clients will see you/i);

    expect(screen.queryByText(/Creating your organization/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/How clients will see you/i), {
      target: { value: "Builder" },
    });
    fireEvent.change(screen.getAllByPlaceholderText("+7 900 000-00-00")[0], {
      target: { value: "+79990000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));

    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    expect(upsertMock).toHaveBeenCalledWith("o1", expect.objectContaining({ display_name: "Builder" }));
    expect(createMock).not.toHaveBeenCalled();
  });

  it("blocks submit and shows an error when no contact is provided", async () => {
    orgsMock.mockReturnValue({ data: [{ id: "o1", name: "Org", role: "owner" }], isLoading: false });
    activeOrgMock.mockReturnValue({ id: "o1", name: "Org", role: "owner" });
    renderForm();
    await screen.findByPlaceholderText(/How clients will see you/i);

    fireEvent.change(screen.getByPlaceholderText(/How clients will see you/i), {
      target: { value: "Builder" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));

    await waitFor(() =>
      expect(screen.getByText(/at least one contact/i)).toBeInTheDocument(),
    );
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("submits a saved draft for moderation", async () => {
    orgsMock.mockReturnValue({ data: [{ id: "o1", name: "Org", role: "owner" }], isLoading: false });
    activeOrgMock.mockReturnValue({ id: "o1", name: "Org", role: "owner" });
    renderForm();
    await screen.findByPlaceholderText(/How clients will see you/i);

    fireEvent.change(screen.getByPlaceholderText(/How clients will see you/i), {
      target: { value: "Builder" },
    });
    fireEvent.change(screen.getByPlaceholderText("username"), { target: { value: "@builder" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));

    await waitFor(() => expect(screen.getByText("Business card saved")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Submit for moderation" }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledWith("o1"));
  });

  describe("the saved card (rovno#282)", () => {
    const saved = {
      id: "p1",
      org_id: "o1",
      display_name: "ООО Ремонт",
      contacts: {
        email: "a@b.ru",
        phone: "+7 812 000-00-00",
        telegram: "@remont",
        website: "https://remont.ru",
        whatsapp: "+7 921 000-00-00",
        vk: "https://vk.com/remont",
      },
      region: "Спб",
      specializations: ["отделка", "электрика"],
      experience_years: 12,
      avatar_url: "https://cdn/a.jpg",
      description: "Ремонт",
      inn: null,
      appearance: { shade: "olive", cover_url: "https://cdn/c.jpg", show_requisites: false },
      status: "draft",
    };

    beforeEach(() => {
      orgsMock.mockReturnValue({ data: [{ id: "o1", name: "Org", role: "owner" }], isLoading: false });
      activeOrgMock.mockReturnValue({ id: "o1", name: "Org", role: "owner" });
    });

    it("opens filled with what is saved and sends it back whole", async () => {
      fetchMock.mockResolvedValue(saved);
      renderForm();
      expect(await screen.findByDisplayValue("ООО Ремонт")).toBeInTheDocument();
      expect(screen.getByDisplayValue("отделка, электрика")).toBeInTheDocument();
      expect(screen.getByDisplayValue("remont")).toBeInTheDocument();
      expect(screen.getByDisplayValue("+7 921 000-00-00")).toBeInTheDocument();
      expect(screen.getByDisplayValue("https://vk.com/remont")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
      await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
      const profile = upsertMock.mock.calls[0][1];
      expect(profile.contacts).toEqual(saved.contacts);
      expect(profile.appearance).toEqual({ shade: "olive", cover_url: "https://cdn/c.jpg", show_requisites: false });
    });

    it("sends an emptied field empty, so the server clears it", async () => {
      fetchMock.mockResolvedValue(saved);
      renderForm();
      fireEvent.change(await screen.findByDisplayValue("Спб"), { target: { value: "" } });
      fireEvent.change(screen.getByDisplayValue("12"), { target: { value: "" } });
      fireEvent.change(screen.getByDisplayValue("отделка, электрика"), { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
      await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
      expect(upsertMock.mock.calls[0][1]).toEqual(
        expect.objectContaining({ region: "", experience_years: null, specializations: [] }),
      );
    });

    it("does not let an unread card be overwritten", async () => {
      fetchMock.mockRejectedValue(new Error("boom"));
      renderForm();
      const alert = await screen.findByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save as draft" })).toBeDisabled();
    });

    it("picks a shade, which drops the own cover", async () => {
      fetchMock.mockResolvedValue(saved);
      renderForm();
      fireEvent.click(await screen.findByRole("button", { name: "Brick" }));
      fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
      await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
      expect(upsertMock.mock.calls[0][1].appearance).toEqual({ shade: "brick", show_requisites: false });
    });

    it("refuses a cover over 5 MB without uploading it", async () => {
      fetchMock.mockResolvedValue(null);
      const { container } = renderForm();
      await screen.findByPlaceholderText(/How clients will see you/i);
      const coverInput = container.querySelectorAll('input[type="file"]')[1] as HTMLInputElement;
      const big = new File(["x"], "c.jpg", { type: "image/jpeg" });
      Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });
      fireEvent.change(coverInput, { target: { files: [big] } });
      expect(uploadAvatarMock).not.toHaveBeenCalled();
    });

    it("says a first card needs the Brigade plan when the server refuses it", async () => {
      upsertMock.mockRejectedValue({ message: "business_card_requires_brigade", code: "P0001" });
      renderForm();
      fireEvent.change(await screen.findByPlaceholderText(/How clients will see you/i), { target: { value: "Builder" } });
      fireEvent.change(screen.getByPlaceholderText("mail@example.com"), { target: { value: "a@b.ru" } });
      fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
      await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("Brigade") })));
    });

    it("blocks Save when the organizations arrive late and the card cannot be read", async () => {
      orgsMock.mockReturnValue({ data: undefined, isLoading: false });
      activeOrgMock.mockReturnValue(null);
      fetchMock.mockRejectedValue(new Error("boom"));
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const ui = () => (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <VisitkaForm onBack={() => {}} onClose={() => {}} />
          </MemoryRouter>
        </QueryClientProvider>
      );
      const { rerender } = render(ui());
      await screen.findByPlaceholderText(/How clients will see you/i);
      orgsMock.mockReturnValue({ data: [{ id: "o1", name: "Org", role: "owner" }], isLoading: false });
      activeOrgMock.mockReturnValue({ id: "o1", name: "Org", role: "owner" });
      rerender(ui());
      await screen.findByRole("alert");
      expect(screen.getByRole("button", { name: "Save as draft" })).toBeDisabled();
    });

    it("asks the registry once for an entered INN, after a pause", async () => {
      partyDetailsMock.mockResolvedValue({ status: "unavailable" });
      renderForm();
      const input = await screen.findByPlaceholderText(/10 or 12 digits/i);
      fireEvent.change(input, { target: { value: "7707083893" } });
      expect(partyDetailsMock).not.toHaveBeenCalled();
      await waitFor(() => expect(partyDetailsMock).toHaveBeenCalledTimes(1), { timeout: 1500 });
    });

    it("does not carry one organization's card into another", async () => {
      fetchMock.mockImplementation(async (orgId: string) => (orgId === "o1" ? saved : null));
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const ui = () => (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <VisitkaForm onBack={() => {}} onClose={() => {}} />
          </MemoryRouter>
        </QueryClientProvider>
      );
      const { rerender } = render(ui());
      await screen.findByDisplayValue("Спб");
      orgsMock.mockReturnValue({ data: [{ id: "o2", name: "Second", role: "owner" }], isLoading: false });
      activeOrgMock.mockReturnValue({ id: "o2", name: "Second", role: "owner" });
      rerender(ui());
      await screen.findByDisplayValue("Second");
      expect(screen.queryByDisplayValue("Спб")).not.toBeInTheDocument();
    });

    it("rejects a social link that is not a web address", async () => {
      fetchMock.mockResolvedValue(saved);
      renderForm();
      fireEvent.change(await screen.findByDisplayValue("https://vk.com/remont"), { target: { value: "javascript:alert(1)" } });
      fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
      expect(await screen.findByDisplayValue("javascript:alert(1)")).toHaveAttribute("aria-invalid", "true");
      expect(upsertMock).not.toHaveBeenCalled();
    });
  });

  describe("INN check against the registry (rovno#243)", () => {
    const liquidated = {
      type: "legal", legalName: "ООО «СТРОЙМАСТЕР-СЕВЕР»", inn: "7809876544", kpp: null, ogrn: null,
      legalAddress: null, addressIncomplete: false, addressHint: null, signatoryName: null,
      signatoryPosition: null, status: "liquidated",
    };

    beforeEach(() => {
      orgsMock.mockReturnValue({ data: [{ id: "o1", name: "Org", role: "owner" }], isLoading: false });
      activeOrgMock.mockReturnValue({ id: "o1", name: "Org", role: "owner" });
      partyDetailsMock.mockReset().mockResolvedValue({ status: "ok", value: liquidated });
    });

    it("promises the check under the empty field, then shows the tag after the INN is entered", async () => {
      renderForm();
      await screen.findByPlaceholderText(/How clients will see you/i);
      expect(screen.getByText("We check the organization in the state register (EGRUL) as soon as you enter the tax ID")).toBeInTheDocument();
      const field = screen.getByPlaceholderText("10 or 12 digits");
      fireEvent.change(field, { target: { value: "7809876544" } });
      fireEvent.blur(field);
      await waitFor(() => expect(screen.getByTestId("party-status-tag")).toHaveTextContent("Organization liquidated"));
      expect(partyDetailsMock).toHaveBeenCalledWith("7809876544", null);
      expect(screen.queryByText(/as soon as you enter the tax ID/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId("party-status-tag"));
      expect(screen.getAllByText("ООО «СТРОЙМАСТЕР-СЕВЕР»").length).toBeGreaterThan(0);
    });

    it("does not check a short INN and saves the card whatever the status", async () => {
      renderForm();
      await screen.findByPlaceholderText(/How clients will see you/i);
      const field = screen.getByPlaceholderText("10 or 12 digits");
      fireEvent.change(field, { target: { value: "78098" } });
      fireEvent.blur(field);
      expect(partyDetailsMock).not.toHaveBeenCalled();

      fireEvent.change(field, { target: { value: "7809876544" } });
      fireEvent.blur(field);
      await waitFor(() => expect(screen.getByTestId("party-status-tag")).toHaveTextContent("Organization liquidated"));
      fireEvent.change(screen.getByPlaceholderText(/How clients will see you/i), { target: { value: "Builder" } });
      fireEvent.change(screen.getByPlaceholderText("username"), { target: { value: "@builder" } });
      fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
      await waitFor(() => expect(upsertMock).toHaveBeenCalledWith("o1", expect.objectContaining({ inn: "7809876544" })));
    });

    it("keeps the hint and shows no tag when the check does not answer", async () => {
      partyDetailsMock.mockResolvedValue({ status: "unavailable" });
      renderForm();
      await screen.findByPlaceholderText(/How clients will see you/i);
      const field = screen.getByPlaceholderText("10 or 12 digits");
      fireEvent.change(field, { target: { value: "7809876544" } });
      fireEvent.blur(field);
      await waitFor(() => expect(partyDetailsMock).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByTestId("party-status-tag")).toBeNull());
      expect(screen.getByText(/as soon as you enter the tax ID/)).toBeInTheDocument();
    });
  });
});

describe("VisitkaForm preview window", () => {
  it("closes on Escape and leaves the form's own dialog open", async () => {
    orgsMock.mockReturnValue({ data: [{ id: "o1", name: "Org", role: "owner" }], isLoading: false });
    activeOrgMock.mockReturnValue({ id: "o1", name: "Org", role: "owner" });
    fetchMock.mockReset().mockResolvedValue(null);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const onOpenChange = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Dialog open onOpenChange={onOpenChange}>
            <DialogContent>
              <DialogTitle>Form</DialogTitle>
              <VisitkaForm onBack={() => {}} onClose={() => {}} />
            </DialogContent>
          </Dialog>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "See the reverse side of the card" }));
    const window = await screen.findByTestId("card-window");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("card-window")).not.toBeInTheDocument());
    expect(onOpenChange).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("VisitkaForm ready-made covers (rovno#295)", () => {
  const owner = { id: "o1", name: "Org", role: "owner" };

  afterEach(() => {
    delete (URL as { createObjectURL?: unknown }).createObjectURL;
  });

  function stubObjectUrl() {
    (URL as { createObjectURL?: unknown }).createObjectURL = () => "blob:picked";
  }

  beforeEach(() => {
    orgsMock.mockReset().mockReturnValue({ data: [owner], isLoading: false });
    activeOrgMock.mockReset().mockReturnValue(owner);
    fetchMock.mockReset().mockResolvedValue(null);
    upsertMock.mockReset().mockResolvedValue({ org_id: "o1", profile_id: "p1" });
    uploadAvatarMock.mockReset().mockResolvedValue({ url: "https://cdn/avatars/a.jpg", path: "u/a.jpg" });
    imageSizeMock.mockReset().mockResolvedValue(null);
    cropMock.mockReset().mockResolvedValue(new File(["y"], "cut.jpg", { type: "image/jpeg" }));
  });

  async function openEmpty() {
    const view = renderForm();
    await screen.findByPlaceholderText(/How clients will see you/i);
    fireEvent.change(screen.getByPlaceholderText("username"), { target: { value: "builder" } });
    return view;
  }

  async function save() {
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    return upsertMock.mock.calls[0][1];
  }

  const grid = () => within(screen.getByTestId("cover-grid")).getAllByRole("button");

  it("starts a new card on Rovno blue and offers no graphite", async () => {
    await openEmpty();
    expect(screen.getByRole("button", { name: "Rovno blue" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Graphite" })).not.toBeInTheDocument();
    expect((await save()).appearance).toEqual({ shade: "rovno_blue", show_requisites: true });
  });

  it("keeps graphite on a card saved with it until the person picks another shade", async () => {
    fetchMock.mockResolvedValue({ id: "p1", org_id: "o1", display_name: "ООО Ремонт", contacts: { telegram: "@r" }, appearance: { shade: "graphite" }, status: "draft" });
    renderForm();
    await screen.findByDisplayValue("ООО Ремонт");
    for (const name of ["Rovno blue", "Olive", "Brick", "Emerald", "Sand"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
    expect((await save()).appearance).toEqual({ shade: "graphite", show_requisites: true });
  });

  it("picks a ready-made cover, says which, and sends its key", async () => {
    await openEmpty();
    expect(grid()).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Roofing" }));
    expect(screen.getByRole("button", { name: "Roofing" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("cover-picked").textContent).toBe("Selected: Roofing");
    expect(screen.getByRole("button", { name: "Rovno blue" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("card-cover").querySelector("img")?.getAttribute("src")).toBe("/visitka-covers/roofing.webp");
    expect((await save()).appearance).toEqual({ shade: "rovno_blue", show_requisites: true, cover_preset: "roofing" });
  });

  it("drops the ready-made cover for an uploaded one, and both for a shade", async () => {
    const { container } = await openEmpty();
    fireEvent.click(screen.getByRole("button", { name: "Roofing" }));
    imageSizeMock.mockResolvedValue({ width: 1600, height: 900 });
    const coverInput = container.querySelectorAll('input[type="file"]')[1] as HTMLInputElement;
    fireEvent.change(coverInput, { target: { files: [new File(["x"], "c.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(uploadAvatarMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Roofing" })).toHaveAttribute("aria-pressed", "false"));
    fireEvent.click(screen.getByRole("button", { name: "Brick" }));
    fireEvent.click(screen.getByRole("button", { name: "Tiling" }));
    fireEvent.click(screen.getByRole("button", { name: "Olive" }));
    expect((await save()).appearance).toEqual({ shade: "olive", show_requisites: true });
  });

  it("an uploaded cover is sent alone", async () => {
    const { container } = await openEmpty();
    fireEvent.click(screen.getByRole("button", { name: "Roofing" }));
    imageSizeMock.mockResolvedValue({ width: 1600, height: 900 });
    const coverInput = container.querySelectorAll('input[type="file"]')[1] as HTMLInputElement;
    fireEvent.change(coverInput, { target: { files: [new File(["x"], "c.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(uploadAvatarMock).toHaveBeenCalledTimes(1));
    expect((await save()).appearance).toEqual({ shade: "rovno_blue", show_requisites: true, cover_url: "https://cdn/avatars/a.jpg" });
  });

  it("shows eight at a time, with a saved cover past them first", async () => {
    fetchMock.mockResolvedValue({ id: "p1", org_id: "o1", display_name: "ООО Ремонт", contacts: { telegram: "@r" }, appearance: { shade: "olive", cover_preset: "landscape" }, status: "draft" });
    renderForm();
    await screen.findByDisplayValue("ООО Ремонт");
    expect(grid()).toHaveLength(8);
    expect(grid()[0]).toHaveAccessibleName("Landscaping");
    expect(grid()[0]).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(grid()).toHaveLength(16);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(grid()).toHaveLength(24);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    expect((await save()).appearance).toEqual({ shade: "olive", show_requisites: true, cover_preset: "landscape" });
  });

  it("finds covers by name and tags, and offers a switched-off Generate when nothing fits", async () => {
    await openEmpty();
    const search = screen.getByRole("searchbox", { name: "Find a cover" });
    fireEvent.change(search, { target: { value: "House" } });
    expect(grid().map((button) => button.getAttribute("aria-label"))).toEqual(["Private house", "Timber frame house"]);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "pool" } });
    expect(screen.getByText("No ready-made covers for «pool». Generate one?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate/ })).toBeDisabled();
    expect(screen.getByText("Soon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(grid()).toHaveLength(8);
  });

  it("Enter in the cover search does not save the card", async () => {
    await openEmpty();
    const search = screen.getByRole("searchbox", { name: "Find a cover" });
    fireEvent.change(search, { target: { value: "roof" } });
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    search.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("keeps the outline of the chosen cover when it has focus", async () => {
    await openEmpty();
    const roofing = screen.getByRole("button", { name: "Roofing" });
    expect(roofing.className).not.toContain("focus:outline-none");
    expect(screen.getByRole("button", { name: "Olive" }).className).not.toContain("focus:outline-none");
    expect(screen.getByRole("button", { name: "Rovno blue" }).className).toContain("focus-visible:ring-offset-2");
  });

  it("does not let a ready-made cover or a shade be picked while a cover uploads", async () => {
    let finish: (value: { url: string; path: string }) => void = () => {};
    uploadAvatarMock.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    imageSizeMock.mockResolvedValue({ width: 1600, height: 900 });
    const { container } = await openEmpty();
    const coverInput = container.querySelectorAll('input[type="file"]')[1] as HTMLInputElement;
    fireEvent.change(coverInput, { target: { files: [new File(["x"], "c.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(uploadAvatarMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Roofing" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Olive" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save as draft" })).toBeDisabled();
    finish({ url: "https://cdn/c.jpg", path: "c" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Roofing" })).toBeEnabled());
  });

  it("removes the logo and the cover with the cross on the thumbnail", async () => {
    fetchMock.mockResolvedValue({ id: "p1", org_id: "o1", display_name: "ООО Ремонт", contacts: { telegram: "@r" }, avatar_url: "https://cdn/a.jpg", appearance: { shade: "olive", cover_url: "https://cdn/c.jpg" }, status: "draft" });
    renderForm();
    await screen.findByDisplayValue("ООО Ремонт");
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove cover" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove logo" }));
    expect(screen.queryByRole("button", { name: "Remove cover" })).not.toBeInTheDocument();
    const profile = await save();
    expect(profile.avatar_url).toBe("");
    expect(profile.appearance).toEqual({ shade: "olive", show_requisites: true });
  });

  it("gives the new hints and no «optional» by the logo", async () => {
    await openEmpty();
    expect(screen.getByText("400×400, JPG or PNG")).toBeInTheDocument();
    expect(screen.getByText("1600×900, no text, JPG or PNG up to 5 MB")).toBeInTheDocument();
    expect(screen.getByText("Photo / logo").textContent).toBe("Photo / logo");
  });

  it("crops a logo that is not square before uploading it", async () => {
    stubObjectUrl();
    const { container } = await openEmpty();
    imageSizeMock.mockResolvedValue({ width: 800, height: 400 });
    const original = new File(["x"], "logo.png", { type: "image/png" });
    fireEvent.change(container.querySelectorAll('input[type="file"]')[0] as HTMLInputElement, { target: { files: [original] } });
    const dialog = await screen.findByRole("dialog", { name: "Crop logo" });
    expect(uploadAvatarMock).not.toHaveBeenCalled();
    const done = within(dialog).getByRole("button", { name: "Done" });
    await waitFor(() => expect(done).toBeEnabled());
    fireEvent.click(done);
    await waitFor(() => expect(uploadAvatarMock).toHaveBeenCalledTimes(1));
    expect(cropMock).toHaveBeenCalledWith(original, { x: 0, y: 0, width: 10, height: 10 }, 800);
    expect(uploadAvatarMock.mock.calls[0][0].name).toBe("cut.jpg");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Crop logo" })).not.toBeInTheDocument());
  });

  it("crops a cover that is not 16:9, and cancelling uploads nothing", async () => {
    stubObjectUrl();
    const { container } = await openEmpty();
    imageSizeMock.mockResolvedValue({ width: 1000, height: 1000 });
    const coverInput = container.querySelectorAll('input[type="file"]')[1] as HTMLInputElement;
    const original = new File(["x"], "c.jpg", { type: "image/jpeg" });
    fireEvent.change(coverInput, { target: { files: [original] } });
    let dialog = await screen.findByRole("dialog", { name: "Crop cover" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Crop cover" })).not.toBeInTheDocument());
    expect(uploadAvatarMock).not.toHaveBeenCalled();
    fireEvent.change(coverInput, { target: { files: [original] } });
    dialog = await screen.findByRole("dialog", { name: "Crop cover" });
    const done = within(dialog).getByRole("button", { name: "Done" });
    await waitFor(() => expect(done).toBeEnabled());
    fireEvent.click(done);
    await waitFor(() => expect(uploadAvatarMock).toHaveBeenCalledTimes(1));
    expect(cropMock).toHaveBeenCalledWith(original, { x: 0, y: 0, width: 10, height: 10 }, 1600);
  });
});
