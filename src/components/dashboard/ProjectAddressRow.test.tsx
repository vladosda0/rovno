import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import enLocale from "@/locales/en.json";

const { toast, lookupAddresses } = vi.hoisted(() => ({ toast: vi.fn(), lookupAddresses: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }));

vi.mock("@/data/requisites-lookup-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/requisites-lookup-source")>()),
  lookupAddresses: (query: string) => lookupAddresses(query),
}));

import { ProjectAddressRow } from "@/components/dashboard/ProjectAddressRow";

const en = (key: string) => (enLocale as Record<string, string>)[key];

beforeEach(() => {
  toast.mockReset();
  lookupAddresses.mockReset();
  lookupAddresses.mockResolvedValue({ status: "ok", value: [] });
});

describe("ProjectAddressRow (rovno#236)", () => {
  it("shows «No address» without any action to a non-owner", () => {
    render(<ProjectAddressRow address={undefined} canEdit={false} onSave={vi.fn()} />);
    expect(screen.getByText(en("projectDashboard.addressNotSet"))).toBeInTheDocument();
    expect(screen.queryByText(en("projectDashboard.addAddress"))).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("lets a non-owner copy an existing address but not change it", () => {
    render(<ProjectAddressRow address="г Москва, ул Летная, д 12" canEdit={false} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: en("projectDashboard.copyAddress") })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en("projectDashboard.editAddress") })).toBeNull();
  });

  it("owner: «Add address» opens the field, Enter saves the typed text", async () => {
    const onSave = vi.fn(async () => undefined);
    render(<ProjectAddressRow address={undefined} canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: en("projectDashboard.addAddress") }));
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("placeholder", en("projectDashboard.addressPlaceholder"));
    expect(screen.getByText(en("projectDashboard.addressKeysHint"))).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "  СНТ Рассвет, участок 48 " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("СНТ Рассвет, участок 48"));
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
    expect(toast).toHaveBeenCalledWith({ title: en("projectDashboard.addressSaved") });
  });

  it("owner: Esc and ✕ close the field without saving", () => {
    const onSave = vi.fn();
    render(<ProjectAddressRow address={undefined} canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: en("projectDashboard.addAddress") }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "летная" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: en("projectDashboard.addAddress") }));
    fireEvent.click(screen.getByRole("button", { name: en("common.cancel") }));
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("owner: picking a suggestion saves it at once", async () => {
    lookupAddresses.mockResolvedValue({
      status: "ok",
      value: [{ value: "г Москва, ул Летная, д 12", postalCode: "125364" }],
    });
    const onSave = vi.fn(async () => undefined);
    render(<ProjectAddressRow address={undefined} canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: en("projectDashboard.addAddress") }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "летная 12" } });
    const option = await screen.findByRole("option", {}, { timeout: 2000 });
    expect(option).toHaveTextContent("125364");
    fireEvent.mouseDown(option);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("г Москва, ул Летная, д 12"));
    expect(lookupAddresses).toHaveBeenCalledWith("летная 12");
  });

  it("owner: the pencil opens the current address; erasing it saves null", async () => {
    const onSave = vi.fn(async () => undefined);
    render(<ProjectAddressRow address="г Москва, ул Летная, д 12" canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: en("projectDashboard.editAddress") }));
    const input = screen.getByRole("combobox");
    expect(input).toHaveValue("г Москва, ул Летная, д 12");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: en("common.save") }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: en("projectDashboard.addressRemoved") }));
  });

  it("an unchanged address closes the field without a save", () => {
    const onSave = vi.fn();
    render(<ProjectAddressRow address="г Москва" canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: en("projectDashboard.editAddress") }));
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("a failed save keeps the field open with the text and says so", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("offline");
    });
    render(<ProjectAddressRow address={undefined} canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: en("projectDashboard.addAddress") }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "г Москва, ул Летная, д 12" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: en("projectDashboard.addressSaveFailed"),
        description: en("projectDashboard.addressSaveFailedDescription"),
        variant: "destructive",
      }),
    );
    expect(screen.getByRole("combobox")).toHaveValue("г Москва, ул Летная, д 12");
  });

  it("says when nothing matched and when hints are down", async () => {
    render(<ProjectAddressRow address={undefined} canEdit onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: en("projectDashboard.addAddress") }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "снт рассвет" } });
    expect(await screen.findByText(en("address.lookup.notFound"), {}, { timeout: 2000 })).toBeInTheDocument();
    lookupAddresses.mockResolvedValue({ status: "unavailable" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "летная 12" } });
    expect(await screen.findByText(en("address.lookup.unavailable"), {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("Enter right after typing saves the typed text, not the hint of the previous query", async () => {
    lookupAddresses.mockResolvedValue({
      status: "ok",
      value: [{ value: "г Москва, ул Летная, д 1", postalCode: "125364" }],
    });
    const onSave = vi.fn(async () => undefined);
    render(<ProjectAddressRow address={undefined} canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: en("projectDashboard.addAddress") }));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "летная 1" } });
    await screen.findByRole("option", {}, { timeout: 2000 });
    fireEvent.change(input, { target: { value: "летная 12" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("летная 12"));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("one Esc with hints open cancels the edit", async () => {
    lookupAddresses.mockResolvedValue({ status: "ok", value: [{ value: "г Москва", postalCode: null }] });
    const onSave = vi.fn();
    render(<ProjectAddressRow address={undefined} canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: en("projectDashboard.addAddress") }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "моск" } });
    await screen.findByRole("option", {}, { timeout: 2000 });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Enter during IME composition does not save", () => {
    const onSave = vi.fn();
    render(<ProjectAddressRow address={undefined} canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: en("projectDashboard.addAddress") }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "летная" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter", isComposing: true });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("the field is read-only while a save is in flight", async () => {
    let finish: () => void = () => undefined;
    const onSave = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<ProjectAddressRow address={undefined} canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: en("projectDashboard.addAddress") }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "летная 1" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveAttribute("readonly"));
    finish();
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("ArrowDown on hints of an earlier query does not move the highlight; Enter saves the typed text", async () => {
    lookupAddresses.mockResolvedValue({
      status: "ok",
      value: [
        { value: "г Москва, ул Летная, д 1", postalCode: null },
        { value: "г Мытищи, ул Летная, д 1", postalCode: null },
      ],
    });
    const onSave = vi.fn(async () => undefined);
    render(<ProjectAddressRow address={undefined} canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: en("projectDashboard.addAddress") }));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "летная 1" } });
    await screen.findAllByRole("option", {}, { timeout: 2000 });
    const before = input.getAttribute("aria-activedescendant");
    fireEvent.change(input, { target: { value: "летная 12" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(before);
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("летная 12"));
  });
});
