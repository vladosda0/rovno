import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocationPicker } from "@/components/procurement/LocationPicker";
import { getInventorySource } from "@/data/inventory-source";
import { __unsafeResetStoreForTests } from "@/data/store";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";
import enLocale from "@/locales/en.json";

const en = (key: string) => (enLocale as Record<string, string>)[key];

const { lookupAddresses } = vi.hoisted(() => ({ lookupAddresses: vi.fn() }));
vi.mock("@/data/requisites-lookup-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/requisites-lookup-source")>()),
  lookupAddresses: (query: string) => lookupAddresses(query),
}));

describe("LocationPicker: address hints in «create location» (rovno#236)", () => {
  beforeEach(() => {
    __unsafeResetStoreForTests();
    clearDemoSession();
    enterDemoSession("project-1");
    setAuthRole("owner");
    lookupAddresses.mockResolvedValue({
      status: "ok",
      value: [{ value: "г Москва, ул Летная, д 12", postalCode: "125364" }],
    });
  });

  it("a picked suggestion becomes the new location's address", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LocationPicker projectId="project-1" onChange={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: en("procurement.locationPicker.placeholder") }));
    fireEvent.change(screen.getByPlaceholderText(en("procurement.locationPicker.namePlaceholder")), {
      target: { value: "QA бытовка" },
    });
    const address = screen.getByPlaceholderText(en("procurement.locationPicker.addressPlaceholder"));
    fireEvent.change(address, { target: { value: "летная 12" } });
    fireEvent.mouseDown(await screen.findByRole("option", {}, { timeout: 2000 }));
    expect(address).toHaveValue("г Москва, ул Летная, д 12");
    fireEvent.click(screen.getByRole("button", { name: en("procurement.locationPicker.addButton") }));
    const source = await getInventorySource({ kind: "demo" });
    await waitFor(async () => {
      const locations = await source.getProjectLocations("project-1");
      expect(locations.find((l) => l.name === "QA бытовка")?.address).toBe("г Москва, ул Летная, д 12");
    });
  });

  it("no hits: says so without promising Enter; Esc hides the hints, not the picker", async () => {
    lookupAddresses.mockResolvedValue({ status: "ok", value: [] });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LocationPicker projectId="project-1" onChange={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: en("procurement.locationPicker.placeholder") }));
    const address = screen.getByPlaceholderText(en("procurement.locationPicker.addressPlaceholder"));
    fireEvent.change(address, { target: { value: "снт рассвет" } });
    expect(await screen.findByText(en("address.lookup.notFoundPlain"), {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText(en("address.lookup.notFound"))).toBeNull();

    lookupAddresses.mockResolvedValue({ status: "ok", value: [{ value: "г Москва, ул Летная, д 12", postalCode: null }] });
    fireEvent.change(address, { target: { value: "летная 12" } });
    await screen.findByRole("option", {}, { timeout: 2000 });
    fireEvent.keyDown(address, { key: "Escape" });
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByPlaceholderText(en("procurement.locationPicker.addressPlaceholder"))).toBeInTheDocument();
  });
});
