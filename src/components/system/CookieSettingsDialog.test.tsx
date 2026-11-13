import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CookieSettingsDialog, cookieSettingsReload } from "@/components/system/CookieSettingsDialog";
import {
  COOKIE_CONSENT_STORAGE_KEY,
  openCookieSettings,
  readCookieConsent,
  resetCookieConsentForTests,
} from "@/lib/cookie-consent";

function renderDialog() {
  return render(
    <MemoryRouter>
      <CookieSettingsDialog />
    </MemoryRouter>,
  );
}

function open() {
  act(() => {
    openCookieSettings();
  });
}

describe("CookieSettingsDialog", () => {
  let reload: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    resetCookieConsentForTests();
    reload = vi.spyOn(cookieSettingsReload, "reload").mockImplementation(() => {});
  });

  afterEach(() => {
    reload.mockRestore();
    localStorage.clear();
  });

  it("opens on the settings event with necessary always on and analytics on", () => {
    renderDialog();
    expect(screen.queryByRole("dialog")).toBeNull();

    open();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Cookie settings")).toBeInTheDocument();
    const necessary = screen.getByRole("switch", { name: /Necessary/ });
    expect(necessary).toBeChecked();
    expect(necessary).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Analytics" })).toBeChecked();
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy#cookies");
  });

  it("switching analytics off and saving stores the choice and reloads the page", () => {
    renderDialog();
    open();

    fireEvent.click(screen.getByRole("switch", { name: "Analytics" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(readCookieConsent()?.analytics).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("saving without a change closes the dialog without a reload", () => {
    renderDialog();
    open();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(reload).not.toHaveBeenCalled();
    expect(readCookieConsent()?.analytics).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows analytics off for a visitor who switched it off earlier, and turning it back on reloads", () => {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify({ analytics: false, at: "x", v: 1 }));
    renderDialog();
    open();

    const analytics = screen.getByRole("switch", { name: "Analytics" });
    expect(analytics).not.toBeChecked();
    fireEvent.click(analytics);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(readCookieConsent()?.analytics).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload when the browser refuses to keep the choice", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    renderDialog();
    open();

    fireEvent.click(screen.getByRole("switch", { name: "Analytics" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(reload).not.toHaveBeenCalled();
    open();
    expect(screen.getByRole("switch", { name: "Analytics" })).not.toBeChecked();
    setItem.mockRestore();
  });

  it("shows 'Always on' next to the necessary switch", () => {
    renderDialog();
    open();
    // jsdom applies no Tailwind, so check the label carries no breakpoint-hiding class.
    expect(screen.getByText("Always on").className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });
});
