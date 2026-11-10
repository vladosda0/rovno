import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Session, User } from "@supabase/supabase-js";
import { SecurityPanel } from "@/components/settings/panels/SecurityPanel";
import { __unsafeSetRuntimeAuthStateForTests } from "@/hooks/use-runtime-auth";

const { updateUserMock, rpcMock, invokeMock, toastMock } = vi.hoisted(() => ({
  updateUserMock: vi.fn(),
  rpcMock: vi.fn(),
  invokeMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { updateUser: updateUserMock }, rpc: rpcMock, functions: { invoke: invokeMock } },
}));

vi.mock("@/hooks/use-toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-toast")>()),
  toast: toastMock,
}));

function renderPanel(url = "/settings?tab=security") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SecurityPanel />
    </MemoryRouter>,
  );
}

function signInAs(userMetadata: Record<string, unknown>) {
  const user = { id: "u1", email: "a@b.co", user_metadata: userMetadata } as unknown as User;
  __unsafeSetRuntimeAuthStateForTests({
    status: "authenticated",
    session: { user } as unknown as Session,
    user,
    profileId: "u1",
  });
}

describe("SecurityPanel · connected accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: [], error: null });
    invokeMock.mockResolvedValue({ data: { outcome: "unlinked" }, error: null });
  });

  const yandexRow = { provider: "yandex", email: "ivan@yandex.ru", display_name: "Иван", linked_at: "2026-11-02T10:00:00Z" };
  const vkRow = { provider: "vk", email: null, display_name: "Иван Петров", linked_at: "2026-11-10T10:00:00Z" };
  const linked = { data: [yandexRow], error: null };
  const row = async (name: "Yandex ID" | "VK ID") => within(await screen.findByRole("group", { name }));

  it("offers to link Yandex and VK when neither is linked, Yandex first", async () => {
    signInAs({});
    renderPanel();
    const yandex = await row("Yandex ID");
    expect(await yandex.findByRole("button", { name: "Link" })).toBeInTheDocument();
    expect(yandex.getByText("Not linked")).toBeInTheDocument();
    const vk = await row("VK ID");
    expect(vk.getByRole("button", { name: "Link" })).toBeInTheDocument();
    const groups = screen.getAllByRole("group").map((el) => el.getAttribute("aria-label"));
    expect(groups.indexOf("Yandex ID")).toBeLessThan(groups.indexOf("VK ID"));
    expect(screen.queryByText(/OAuth integrations/)).toBeNull();
  });

  it("shows the Yandex address and how to sign in after unlinking", async () => {
    rpcMock.mockResolvedValue(linked);
    signInAs({ passwordless: true });
    renderPanel();
    const yandex = await row("Yandex ID");
    expect(await yandex.findByText("ivan@yandex.ru")).toBeInTheDocument();
    expect(yandex.getByText("After unlinking, sign in with a code sent to a@b.co.")).toBeInTheDocument();
    expect(yandex.getByRole("button", { name: "Unlink" })).toBeEnabled();
  });

  it("both linked at once: VK without an email shows the name VK gave", async () => {
    rpcMock.mockResolvedValue({ data: [vkRow, yandexRow], error: null });
    signInAs({});
    renderPanel();
    const vk = await row("VK ID");
    expect(await vk.findByText("Иван Петров")).toBeInTheDocument();
    expect(vk.getByText("After unlinking, sign in with a code sent to a@b.co.")).toBeInTheDocument();
    expect(vk.getByRole("button", { name: "Unlink" })).toBeEnabled();
    expect((await row("Yandex ID")).getByText("ivan@yandex.ru")).toBeInTheDocument();
  });

  it("unlinks Yandex at once through its function, also for an account without a password", async () => {
    rpcMock.mockResolvedValueOnce(linked);
    signInAs({ passwordless: true });
    renderPanel();
    rpcMock.mockResolvedValue({ data: [], error: null });
    fireEvent.click(await (await row("Yandex ID")).findByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("yandex-auth", { body: { action: "unlink" } }));
    expect(rpcMock).not.toHaveBeenCalledWith("unlink_login_identity", expect.anything());
    expect(await (await row("Yandex ID")).findByRole("button", { name: "Link" })).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith({ title: "Yandex ID unlinked" });
  });

  it("unlinks VK through vk-auth", async () => {
    rpcMock.mockResolvedValueOnce({ data: [vkRow], error: null });
    signInAs({});
    renderPanel();
    rpcMock.mockResolvedValue({ data: [], error: null });
    fireEvent.click(await (await row("VK ID")).findByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("vk-auth", { body: { action: "unlink" } }));
    expect(toastMock).toHaveBeenCalledWith({ title: "VK ID unlinked" });
  });

  it("a refused unlink keeps the row and says so", async () => {
    rpcMock.mockResolvedValue({ data: [vkRow], error: null });
    invokeMock.mockResolvedValue({ data: { outcome: "failed", reason: "session" }, error: null });
    signInAs({});
    renderPanel();
    fireEvent.click(await (await row("VK ID")).findByRole("button", { name: "Unlink" }));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: "Could not unlink the account", variant: "destructive" }),
    );
    expect((await row("VK ID")).getByRole("button", { name: "Unlink" })).toBeEnabled();
  });

  it("starts linking VK from its row", async () => {
    invokeMock.mockReturnValue(new Promise(() => undefined));
    signInAs({});
    renderPanel();
    fireEvent.click(await (await row("VK ID")).findByRole("button", { name: "Link" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("vk-auth", { body: { action: "start", mode: "link", next: null } }));
  });

  it("says a failed link in its own words", async () => {
    signInAs({});
    renderPanel("/settings?tab=security&yandex=failed");
    expect(await (await row("Yandex ID")).findByText("Could not link Yandex ID. Please try again.")).toBeInTheDocument();
  });

  it("says when this Yandex ID belongs to another account", async () => {
    signInAs({});
    renderPanel("/settings?tab=security&yandex=taken");
    expect(await screen.findByText("This Yandex ID is already linked to another Rovno account.")).toBeInTheDocument();
  });

  it("VK notices land in the VK row", async () => {
    signInAs({});
    renderPanel("/settings?tab=security&vk=taken");
    expect(await (await row("VK ID")).findByText("This VK ID is already linked to another Rovno account.")).toBeInTheDocument();
    expect((await row("Yandex ID")).queryByRole("alert")).toBeNull();
  });

  it("a second VK ID and a failed VK link have their own words", async () => {
    signInAs({});
    renderPanel("/settings?tab=security&vk=has_vk");
    expect(await screen.findByText("Another VK ID is already linked to this account. Unlink it in Settings and try again.")).toBeInTheDocument();
  });

  it("a failed VK link", async () => {
    signInAs({});
    renderPanel("/settings?tab=security&vk=failed");
    expect(await screen.findByText("Could not link VK ID. Please try again.")).toBeInTheDocument();
  });

  it("confirms a finished link", async () => {
    rpcMock.mockResolvedValue(linked);
    signInAs({});
    renderPanel("/settings?tab=security&yandex=linked");
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({ title: "Yandex ID linked" }));
  });

  it("confirms a finished VK link", async () => {
    rpcMock.mockResolvedValue({ data: [vkRow], error: null });
    signInAs({});
    renderPanel("/settings?tab=security&vk=linked");
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({ title: "VK ID linked" }));
  });

  it("names a failed load instead of an empty row", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    signInAs({});
    renderPanel();
    expect(await screen.findByText("Couldn't load. Refresh the page.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link" })).toBeNull();
  });

  it("a guest keeps the old text", () => {
    __unsafeSetRuntimeAuthStateForTests({ status: "guest", session: null, user: null, profileId: null } as never);
    renderPanel();
    expect(screen.getByText("No connected accounts. OAuth integrations coming soon.")).toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("SecurityPanel · password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: [], error: null });
  });

  it("an account registered by code has no password yet", () => {
    signInAs({ passwordless: true });
    renderPanel();
    expect(screen.getByText("Password not set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set password" })).toBeInTheDocument();
  });

  it("an account without the marker has a password", () => {
    signInAs({});
    renderPanel();
    expect(screen.getByText("Password set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change password" })).toBeInTheDocument();
  });

  it("opens two empty fields in the row itself, without a dialog", () => {
    signInAs({ passwordless: true });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    const next = screen.getByLabelText("New password");
    const again = screen.getByLabelText("Confirm password");
    for (const field of [next, again]) {
      expect(field).toHaveAttribute("type", "password");
      expect(field).toHaveValue("");
      expect(field).not.toHaveAttribute("placeholder");
    }

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("checks length and match before saving", () => {
    signInAs({ passwordless: true });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "12345" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Password must be at least 6 characters.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "secret12" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret13" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Passwords do not match. Please enter the same password twice.")).toBeInTheDocument();

    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("saves the password, drops the marker and folds back to «Password set»", async () => {
    updateUserMock.mockResolvedValue({ data: { user: {} }, error: null });
    signInAs({ passwordless: true });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "secret12" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith({ password: "secret12", data: { passwordless: false } });
      expect(screen.getByText("Password set")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("cancel is locked while saving", async () => {
    updateUserMock.mockReturnValue(new Promise(() => {}));
    signInAs({ passwordless: true });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "secret12" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled());
  });

  it("shows the server's refusal and keeps the fields open", async () => {
    updateUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "New password should be different from the old password." },
    });
    signInAs({});
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "secret12" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("New password should be different from the old password.")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it("a guest sees no password section", () => {
    __unsafeSetRuntimeAuthStateForTests({ status: "guest", session: null, user: null, profileId: null });
    renderPanel();
    expect(screen.queryByText("Password")).toBeNull();
  });
});
