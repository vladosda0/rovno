import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const orgsMock = vi.fn();
const activeOrgMock = vi.fn();
const createMock = vi.fn();
const upsertMock = vi.fn();
const submitMock = vi.fn();

vi.mock("@/hooks/use-orgs", () => ({
  useUserOrganizations: () => orgsMock(),
  useActiveOrg: () => activeOrgMock(),
  orgQueryKeys: { all: () => ["orgs"] },
}));
vi.mock("@/data/contractor-profile-source", () => ({
  createOrgWithContractorProfile: (...args: unknown[]) => createMock(...args),
  upsertContractorProfileForOrg: (...args: unknown[]) => upsertMock(...args),
  submitContractorProfileForModeration: (...args: unknown[]) => submitMock(...args),
}));
const partyDetailsMock = vi.fn();
vi.mock("@/data/requisites-lookup-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/requisites-lookup-source")>()),
  lookupPartyDetails: (...args: unknown[]) => partyDetailsMock(...args),
}));
const uploadAvatarMock = vi.fn();
vi.mock("@/hooks/use-avatar-upload", () => ({
  useAvatarUpload: () => ({ uploadAvatar: uploadAvatarMock }),
}));

import { VisitkaForm } from "@/components/upload/forms/VisitkaForm";

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

    fireEvent.change(screen.getByPlaceholderText(/How clients will see you/i), {
      target: { value: "Builder" },
    });
    fireEvent.change(screen.getByPlaceholderText("@username"), { target: { value: "@builder" } });
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

    expect(screen.queryByText(/Creating your organization/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/How clients will see you/i), {
      target: { value: "Builder" },
    });
    fireEvent.change(screen.getByPlaceholderText("+7 900 000-00-00"), {
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

    fireEvent.change(screen.getByPlaceholderText(/How clients will see you/i), {
      target: { value: "Builder" },
    });
    fireEvent.change(screen.getByPlaceholderText("@username"), { target: { value: "@builder" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));

    await waitFor(() => expect(screen.getByText("Business card saved")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Submit for moderation" }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledWith("o1"));
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
      expect(screen.getByText("We check the organization in the state register (EGRUL) as soon as you enter the tax ID")).toBeInTheDocument();
      const field = screen.getByPlaceholderText("10 or 12 digits");
      fireEvent.change(field, { target: { value: "7809876544" } });
      fireEvent.blur(field);
      await waitFor(() => expect(screen.getByText("Organization liquidated")).toBeInTheDocument());
      expect(partyDetailsMock).toHaveBeenCalledWith("7809876544", null);
      expect(screen.queryByText(/as soon as you enter the tax ID/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId("party-status-tag"));
      expect(screen.getAllByText("ООО «СТРОЙМАСТЕР-СЕВЕР»").length).toBeGreaterThan(0);
    });

    it("does not check a short INN and saves the card whatever the status", async () => {
      renderForm();
      const field = screen.getByPlaceholderText("10 or 12 digits");
      fireEvent.change(field, { target: { value: "78098" } });
      fireEvent.blur(field);
      expect(partyDetailsMock).not.toHaveBeenCalled();

      fireEvent.change(field, { target: { value: "7809876544" } });
      fireEvent.blur(field);
      await waitFor(() => expect(screen.getByText("Organization liquidated")).toBeInTheDocument());
      fireEvent.change(screen.getByPlaceholderText(/How clients will see you/i), { target: { value: "Builder" } });
      fireEvent.change(screen.getByPlaceholderText("@username"), { target: { value: "@builder" } });
      fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
      await waitFor(() => expect(upsertMock).toHaveBeenCalledWith("o1", expect.objectContaining({ inn: "7809876544" })));
    });

    it("keeps the hint and shows no tag when the check does not answer", async () => {
      partyDetailsMock.mockResolvedValue({ status: "unavailable" });
      renderForm();
      const field = screen.getByPlaceholderText("10 or 12 digits");
      fireEvent.change(field, { target: { value: "7809876544" } });
      fireEvent.blur(field);
      await waitFor(() => expect(partyDetailsMock).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByTestId("party-status-tag")).toBeNull());
      expect(screen.getByText(/as soon as you enter the tax ID/)).toBeInTheDocument();
    });
  });
});
