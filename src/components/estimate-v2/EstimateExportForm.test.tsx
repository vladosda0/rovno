import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EstimateExportForm, type RequisitesLookup } from "@/components/estimate-v2/EstimateExportForm";
import type { ClientInfo, OrgCard } from "@/types/org-card";
import type { PartyDetails } from "@/data/requisites-lookup-source";
import enLocale from "@/locales/en.json";

const en = (key: string) => (enLocale as Record<string, string>)[key];

const sber: PartyDetails = {
  type: "legal",
  legalName: "ПАО СБЕРБАНК",
  inn: "7707083893",
  kpp: "773601001",
  ogrn: "1027700132195",
  legalAddress: "117312, г Москва, ул Вавилова, д 19",
  addressIncomplete: false,
  addressHint: null,
  signatoryName: "Греф Герман Оскарович",
  signatoryPosition: "Президент, председатель правления",
  status: "active",
};

function fakeLookup(overrides: Partial<RequisitesLookup> = {}): RequisitesLookup {
  return {
    parties: vi.fn(async () => ({
      status: "ok" as const,
      value: [
        { inn: "7707083893", kpp: "773601001", name: "ПАО СБЕРБАНК", address: "г Москва, ул Вавилова, д 19", type: "legal" as const, status: "active" as const },
        { inn: "7707083894", kpp: null, name: "ООО СТАРАЯ", address: null, type: "legal" as const, status: "liquidated" as const },
      ],
    })),
    partyDetails: vi.fn(async () => ({ status: "ok" as const, value: sber })),
    banks: vi.fn(async () => ({
      status: "ok" as const,
      value: [{ bik: "044525974", name: "АО «ТБанк»", correspondentAccount: "30101810145250000974" }],
    })),
    ...overrides,
  };
}

function Harness(props: {
  lookup: RequisitesLookup;
  canEdit?: boolean;
  initialOrg?: OrgCard;
  initialClient?: ClientInfo;
  onOrg?: (card: OrgCard) => void;
}) {
  const [org, setOrg] = useState<OrgCard>(props.initialOrg ?? { legalName: "", bankAccount: "40702810000000012345" });
  const [client, setClient] = useState<ClientInfo>(props.initialClient ?? { name: "" });
  return (
    <EstimateExportForm
      orgCard={org}
      onOrgCardChange={(next) => {
        setOrg(next);
        props.onOrg?.(next);
      }}
      clientInfo={client}
      onClientInfoChange={setClient}
      canEditOrgCard={props.canEdit ?? true}
      lookup={props.lookup}
    />
  );
}

const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

async function typeAndWait(id: string, text: string) {
  vi.useFakeTimers();
  fireEvent.focus(document.getElementById(id)!);
  fireEvent.change(document.getElementById(id)!, { target: { value: text } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
  vi.useRealTimers();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ИНН and БИК suggestions in the export form", () => {
  it("lists organizations for an INN and fills the registry fields on click, leaving bank and account", async () => {
    const lookup = fakeLookup();
    render(<Harness lookup={lookup} />);
    await typeAndWait("org-inn", "7707083893");
    expect(lookup.parties).toHaveBeenCalledWith("7707083893");
    expect(screen.getByText("ПАО СБЕРБАНК")).toBeTruthy();
    expect(screen.getByText(en("estimate.export.lookup.status.liquidated"))).toBeTruthy();

    fireEvent.mouseDown(screen.getByText("ПАО СБЕРБАНК"));
    await waitFor(() => expect(value("org-legal-name")).toBe("ПАО СБЕРБАНК"));
    expect(lookup.partyDetails).toHaveBeenCalledWith("7707083893", "773601001");
    expect(value("org-inn")).toBe("7707083893");
    expect(value("org-kpp")).toBe("773601001");
    expect(value("org-ogrn")).toBe("1027700132195");
    expect(value("org-address")).toBe("117312, г Москва, ул Вавилова, д 19");
    expect(value("org-signatory-name")).toBe("Греф Герман Оскарович");
    expect(value("org-signatory-position")).toBe("Президент, председатель правления");
    expect(value("org-account")).toBe("40702810000000012345");
    expect(screen.getByText(en("estimate.export.lookup.filledNote"))).toBeTruthy();
    expect(document.getElementById("org-ogrn")!.className).toContain("bg-success/10");
  });

  it("keeps a signatory typed by hand when the registry has no head of the company", async () => {
    const lookup = fakeLookup({
      partyDetails: vi.fn(async () => ({
        status: "ok" as const,
        value: { ...sber, signatoryName: null, signatoryPosition: null },
      })),
    });
    render(<Harness lookup={lookup} initialOrg={{ legalName: "", signatoryName: "Петров П. П.", signatoryPosition: "Директор" }} />);
    await typeAndWait("org-inn", "7707083893");
    fireEvent.mouseDown(screen.getByText("ПАО СБЕРБАНК"));
    await waitFor(() => expect(value("org-legal-name")).toBe("ПАО СБЕРБАНК"));
    expect(value("org-signatory-name")).toBe("Петров П. П.");
    expect(value("org-signatory-position")).toBe("Директор");
  });

  it("shows results only for the text still in the field", async () => {
    let answer: (v: unknown) => void = () => {};
    const lookup = fakeLookup({
      parties: vi.fn(() => new Promise((resolve) => { answer = resolve as (v: unknown) => void; })) as never,
    });
    render(<Harness lookup={lookup} />);
    await typeAndWait("org-inn", "770");
    fireEvent.change(document.getElementById("org-inn")!, { target: { value: "77" } });
    await act(async () => {
      answer({ status: "ok", value: [{ inn: "7707083893", kpp: null, name: "ПАО СБЕРБАНК", address: null, type: "legal", status: "active" }] });
    });
    expect(screen.queryByText("ПАО СБЕРБАНК")).toBeNull();
  });

  it("does not search for fewer than three characters", async () => {
    const lookup = fakeLookup();
    render(<Harness lookup={lookup} />);
    await typeAndWait("org-inn", "77");
    expect(lookup.parties).not.toHaveBeenCalled();
  });

  it("fills bank and corr. account from a BIK and asks for the account by hand", async () => {
    const lookup = fakeLookup();
    render(<Harness lookup={lookup} initialOrg={{ legalName: "ООО" }} />);
    await typeAndWait("org-bik", "0445259");
    fireEvent.mouseDown(screen.getByText("АО «ТБанк»"));
    expect(value("org-bank")).toBe("АО «ТБанк»");
    expect(value("org-bik")).toBe("044525974");
    expect(value("org-corr")).toBe("30101810145250000974");
    expect(screen.getByText(en("estimate.export.lookup.accountHint"))).toBeTruthy();
  });

  it("an entrepreneur: no KPP, address not substituted, hint with the city", async () => {
    const lookup = fakeLookup({
      partyDetails: vi.fn(async () => ({
        status: "ok" as const,
        value: {
          ...sber,
          type: "individual" as const,
          legalName: "ИП Кузнецов Павел Андреевич",
          inn: "502712345678",
          kpp: null,
          legalAddress: null,
          addressIncomplete: true,
          addressHint: "г Люберцы",
          signatoryName: "Кузнецов Павел Андреевич",
          signatoryPosition: "Индивидуальный предприниматель",
        },
      })),
    });
    render(<Harness lookup={lookup} initialOrg={{ legalName: "", kpp: "999", legalAddress: "своё" }} />);
    await typeAndWait("org-inn", "5027123");
    fireEvent.mouseDown(screen.getByText("ПАО СБЕРБАНК"));
    await waitFor(() => expect(value("org-legal-name")).toBe("ИП Кузнецов Павел Андреевич"));
    expect(value("org-kpp")).toBe("");
    expect(value("org-address")).toBe("своё");
    expect(screen.getByText(en("estimate.export.lookup.noKpp"))).toBeTruthy();
    expect(screen.getByText(/г Люберцы/)).toBeTruthy();
  });

  it("says suggestions are off when the service is unavailable, and when nothing is found", async () => {
    const off = fakeLookup({ parties: vi.fn(async () => ({ status: "unavailable" as const })) });
    const { unmount } = render(<Harness lookup={off} />);
    await typeAndWait("org-inn", "7715284");
    expect(screen.getByText(en("estimate.export.lookup.partyUnavailable"))).toBeTruthy();
    unmount();

    const none = fakeLookup({ parties: vi.fn(async () => ({ status: "ok" as const, value: [] })) });
    render(<Harness lookup={none} />);
    await typeAndWait("org-inn", "7715000000");
    expect(screen.getByText(en("estimate.export.lookup.partyNotFound"))).toBeTruthy();
  });

  it("a legal-entity client gets the same search and the new signatory field", async () => {
    const lookup = fakeLookup();
    render(<Harness lookup={lookup} initialClient={{ name: "", isLegalEntity: true }} />);
    await typeAndWait("client-inn", "7707083");
    fireEvent.mouseDown(screen.getByText("ПАО СБЕРБАНК"));
    await waitFor(() => expect(value("client-name")).toBe("ПАО СБЕРБАНК"));
    expect(value("client-inn")).toBe("7707083893");
    expect(value("client-signatory")).toBe("Греф Герман Оскарович");
    expect(value("client-address")).toBe("117312, г Москва, ул Вавилова, д 19");
  });
});

describe("a plain organization member", () => {
  it("sees the requisites read-only with the owner/admin note, and edits the client", () => {
    render(<Harness lookup={fakeLookup()} canEdit={false} initialOrg={{ legalName: "ООО Ровно", inn: "7707083893" }} />);
    expect((document.getElementById("org-legal-name") as HTMLInputElement).disabled).toBe(true);
    expect((document.getElementById("org-inn") as HTMLInputElement).disabled).toBe(true);
    expect((document.getElementById("org-bik") as HTMLInputElement).disabled).toBe(true);
    expect((document.getElementById("client-name") as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByText(en("estimate.export.org.readOnlyBadge"))).toBeTruthy();
    expect(screen.getByText(en("estimate.export.org.readOnlyNote"))).toBeTruthy();
  });

  it("with empty requisites is told to ask the owner or an admin", () => {
    render(<Harness lookup={fakeLookup()} canEdit={false} initialOrg={{ legalName: "" }} />);
    expect(screen.getByText(en("estimate.export.org.emptyForMember"))).toBeTruthy();
  });
});
