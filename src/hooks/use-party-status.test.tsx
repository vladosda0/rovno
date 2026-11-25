import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { usePartyStatusChecks, isCheckableInn, type PartyCheck } from "@/hooks/use-party-status";
import { PartyStatusTag, partyTagKind } from "@/components/requisites/PartyStatusTag";
import type { PartyDetails, PartyStatus } from "@/data/requisites-lookup-source";
import enLocale from "@/locales/en.json";

const en = (key: string) => (enLocale as Record<string, string>)[key];

function details(status: PartyStatus, type: "legal" | "individual" = "legal", inn = "7707083893"): PartyDetails {
  return {
    type,
    legalName: "ООО «СТРОЙМАСТЕР-СЕВЕР»",
    inn,
    kpp: null,
    ogrn: null,
    legalAddress: null,
    addressIncomplete: false,
    addressHint: null,
    signatoryName: null,
    signatoryPosition: null,
    status,
  };
}

describe("isCheckableInn", () => {
  it("accepts only 10 or 12 digits", () => {
    expect(isCheckableInn("7707083893")).toBe(true);
    expect(isCheckableInn(" 770708389312 ")).toBe(true);
    expect(isCheckableInn("770708389")).toBe(false);
    expect(isCheckableInn("77070838931")).toBe(false);
    expect(isCheckableInn("77070838a3")).toBe(false);
    expect(isCheckableInn(undefined)).toBe(false);
  });
});

describe("usePartyStatusChecks", () => {
  it("asks the registry once per INN and keeps the answer", async () => {
    const lookup = vi.fn(async () => ({ status: "ok" as const, value: details("active") }));
    const { result } = renderHook(() => usePartyStatusChecks(lookup));
    act(() => result.current.check("7707083893"));
    expect(result.current.get("7707083893")).toEqual({ phase: "checking" });
    await act(async () => {});
    expect(result.current.get("7707083893")).toMatchObject({ phase: "found", status: "active", type: "legal" });
    act(() => result.current.check("7707083893"));
    act(() => result.current.check(" 7707083893 "));
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith("7707083893", null);
  });

  it("does not ask for an INN that is not 10 or 12 digits", () => {
    const lookup = vi.fn(async () => ({ status: "ok" as const, value: null }));
    const { result } = renderHook(() => usePartyStatusChecks(lookup));
    act(() => result.current.check("123"));
    expect(lookup).not.toHaveBeenCalled();
    expect(result.current.get("123")).toBeNull();
  });

  it("records not found and unavailable answers", async () => {
    const lookup = vi.fn(async (inn: string) =>
      inn === "7707083893" ? { status: "ok" as const, value: null } : { status: "unavailable" as const });
    const { result } = renderHook(() => usePartyStatusChecks(lookup));
    act(() => {
      result.current.check("7707083893");
      result.current.check("7707083894");
    });
    await act(async () => {});
    expect(result.current.get("7707083893")).toEqual({ phase: "notFound" });
    expect(result.current.get("7707083894")).toEqual({ phase: "unavailable" });
  });

  it("takes a status from details already fetched, without a second request", () => {
    const lookup = vi.fn();
    const { result } = renderHook(() => usePartyStatusChecks(lookup));
    act(() => result.current.seed(details("liquidated")));
    expect(result.current.get("7707083893")).toMatchObject({ phase: "found", status: "liquidated" });
    act(() => result.current.check("7707083893"));
    expect(lookup).not.toHaveBeenCalled();
  });

  it("ignores an answer that arrives after unmount", async () => {
    let resolve: (value: { status: "ok"; value: PartyDetails }) => void = () => {};
    const lookup = vi.fn(() => new Promise<{ status: "ok"; value: PartyDetails }>((r) => { resolve = r; }));
    const { result, unmount } = renderHook(() => usePartyStatusChecks(lookup));
    act(() => result.current.check("7707083893"));
    unmount();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => resolve({ status: "ok", value: details("active") }));
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("a late answer to the pause check does not overwrite a status taken from a pick", async () => {
    let resolve: (value: { status: "unavailable" }) => void = () => {};
    const lookup = vi.fn(() => new Promise<{ status: "unavailable" }>((r) => { resolve = r; }));
    const { result } = renderHook(() => usePartyStatusChecks(lookup));
    act(() => result.current.check("7707083893"));
    act(() => result.current.seed(details("active")));
    await act(async () => resolve({ status: "unavailable" }));
    expect(result.current.get("7707083893")).toMatchObject({ phase: "found", status: "active" });
  });

  it("after a reset, only the newest request's answer is kept", async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    const lookup = vi.fn(() => new Promise((r) => { resolvers.push(r); })) as never;
    const { result } = renderHook(() => usePartyStatusChecks(lookup));
    act(() => result.current.check("7707083893"));
    act(() => result.current.reset());
    act(() => result.current.check("7707083893"));
    await act(async () => resolvers[0]({ status: "unavailable" }));
    expect(result.current.get("7707083893")).toEqual({ phase: "checking" });
    await act(async () => resolvers[1]({ status: "ok", value: details("active") }));
    expect(result.current.get("7707083893")).toMatchObject({ phase: "found", status: "active" });
  });

  it("forgets every answer on reset, so the next open asks again", async () => {
    const lookup = vi.fn(async () => ({ status: "unavailable" as const }));
    const { result } = renderHook(() => usePartyStatusChecks(lookup));
    act(() => result.current.check("7707083893"));
    await act(async () => {});
    act(() => result.current.reset());
    expect(result.current.get("7707083893")).toBeNull();
    act(() => result.current.check("7707083893"));
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});

const found = (status: PartyStatus, type: "legal" | "individual" = "legal"): PartyCheck => ({
  phase: "found",
  status,
  type,
  name: "ООО «СТРОЙМАСТЕР-СЕВЕР»",
  checkedAt: "2026-10-26T09:00:00.000Z",
});

describe("PartyStatusTag", () => {
  const cases: Array<[PartyCheck, string, string]> = [
    [found("active"), "requisites.partyStatus.org.active", "ok"],
    [found("liquidated"), "requisites.partyStatus.org.liquidated", "bad"],
    [found("liquidating"), "requisites.partyStatus.org.liquidating", "bad"],
    [found("bankrupt"), "requisites.partyStatus.org.bankrupt", "bad"],
    [found("reorganizing"), "requisites.partyStatus.org.reorganizing", "neutral"],
    [{ phase: "notFound" }, "requisites.partyStatus.org.notFound", "bad"],
    [{ phase: "checking" }, "requisites.partyStatus.checking", "neutral"],
    [found("active", "individual"), "requisites.partyStatus.ip.active", "ok"],
    [found("liquidated", "individual"), "requisites.partyStatus.ip.liquidated", "bad"],
  ];

  it.each(cases)("shows the right words and tone for %j", (check, key, tone) => {
    render(<PartyStatusTag check={check} inn="7707083893" advice="client" />);
    const tag = screen.getByTestId("party-status-tag");
    expect(tag).toHaveTextContent(en(key));
    expect(tag).toHaveAttribute("data-tone", tone);
  });

  it("says «ИП не найден» for a 12-digit INN that is not in the registry", () => {
    render(<PartyStatusTag check={{ phase: "notFound" }} inn="770708389312" advice="client" />);
    expect(screen.getByTestId("party-status-tag")).toHaveTextContent(en("requisites.partyStatus.ip.notFound"));
  });

  it("shows nothing when the check did not answer or the status is unknown", () => {
    const { container, rerender } = render(<PartyStatusTag check={{ phase: "unavailable" }} inn="7707083893" advice="client" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PartyStatusTag check={found("unknown")} inn="7707083893" advice="client" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PartyStatusTag check={null} inn="7707083893" advice="client" />);
    expect(container).toBeEmptyDOMElement();
    expect(partyTagKind({ phase: "unavailable" }, "7707083893")).toBeNull();
  });

  // Vlad 2026-10-28 (rovno#243, option A): a tap only opens the tooltip; a press
  // elsewhere, Escape, blur or scroll close it. The toggle broke twice in review.
  it("a tap opens the tooltip and a second tap keeps it open", () => {
    render(<PartyStatusTag check={found("active")} inn="7707083893" advice="client" />);
    const tag = screen.getByTestId("party-status-tag");
    fireEvent.pointerDown(tag);
    fireEvent.click(tag);
    expect(tag).toHaveAttribute("data-state", "instant-open");
    fireEvent.pointerDown(tag);
    fireEvent.click(tag);
    expect(tag).toHaveAttribute("data-state", "instant-open");
  });

  it("a press outside the tag closes the tooltip", async () => {
    render(<PartyStatusTag check={found("active")} inn="7707083893" advice="client" />);
    const tag = screen.getByTestId("party-status-tag");
    fireEvent.pointerDown(tag);
    fireEvent.click(tag);
    expect(tag).toHaveAttribute("data-state", "instant-open");
    // The outside-press listener is attached on the next tick.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.pointerDown(document.body);
    expect(tag).toHaveAttribute("data-state", "closed");
  });

  it("a press that slid off the tag does not swallow the next Enter", () => {
    render(<PartyStatusTag check={found("active")} inn="7707083893" advice="client" />);
    const tag = screen.getByTestId("party-status-tag");
    fireEvent.pointerDown(tag);
    fireEvent.click(tag);
    expect(tag).toHaveAttribute("data-state", "instant-open");
    // Pressed again, released elsewhere: no click follows.
    fireEvent.pointerDown(tag);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(tag).toHaveAttribute("data-state", "closed");
    // Enter on the focused button arrives as a click without a press.
    fireEvent.click(tag);
    expect(tag).toHaveAttribute("data-state", "instant-open");
  });

  it("names the sole trader register EGRIP in the tooltip of a sole trader", () => {
    render(<PartyStatusTag check={found("active", "individual")} inn="770708389312" advice="own" />);
    fireEvent.click(screen.getByTestId("party-status-tag"));
    expect(screen.getAllByText(en("requisites.partyStatus.asOfIp").replace("{{date}}", "26.10.2026")).length).toBeGreaterThan(0);
  });

  it("names EGRIP for a 12-digit INN the registry does not know", () => {
    render(<PartyStatusTag check={{ phase: "notFound" }} inn="770708389312" advice="client" />);
    fireEvent.click(screen.getByTestId("party-status-tag"));
    expect(screen.getAllByText(/EGRIP/).length).toBeGreaterThan(0);
  });

  it("opens the date and advice on a tap", () => {
    render(<PartyStatusTag check={found("liquidated")} inn="7707083893" advice="client" showName />);
    fireEvent.click(screen.getByTestId("party-status-tag"));
    expect(screen.getAllByText(en("requisites.partyStatus.asOf").replace("{{date}}", "26.10.2026")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(en("requisites.partyStatus.advice.client")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("ООО «СТРОЙМАСТЕР-СЕВЕР»").length).toBeGreaterThan(0);
  });
});
