import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CookieConsentBanner, isAppShellPath } from "@/components/system/CookieConsentBanner";
import { COOKIE_CONSENT_STORAGE_KEY, openCookieSettings, resetCookieConsentForTests } from "@/lib/cookie-consent";
import { CookieSettingsDialog } from "@/components/system/CookieSettingsDialog";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <button type="button">page button</button>
      <CookieConsentBanner />
    </MemoryRouter>,
  );
}

function revealBanner() {
  act(() => {
    vi.advanceTimersByTime(700);
  });
}

describe("CookieConsentBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetCookieConsentForTests();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    document.body.style.paddingBottom = "";
    document.documentElement.style.removeProperty("--cookie-banner-h");
  });

  it("shows the notice with one 'OK' button to a visitor who has not chosen", () => {
    renderAt("/");
    revealBanner();

    expect(screen.getByTestId("cookie-consent-banner")).toBeInTheDocument();
    expect(screen.getByText("We use cookies to make the platform better.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "OK" })).toHaveLength(1);
    expect(screen.queryByText(/more|decline/i)).toBeNull();
  });

  it("does not take focus from the page when it appears", () => {
    renderAt("/home");
    const pageButton = screen.getByRole("button", { name: "page button" });
    pageButton.focus();
    revealBanner();

    expect(document.activeElement).toBe(pageButton);
  });

  it("'OK' stores analytics: true and hides the notice", () => {
    renderAt("/");
    revealBanner();

    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    // Still mounted for the exit motion, already fading.
    expect(screen.getByTestId("cookie-consent-banner").style.opacity).toBe("0");
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByTestId("cookie-consent-banner")).toBeNull();
    expect(JSON.parse(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY) ?? "null")).toMatchObject({
      analytics: true,
      v: 1,
    });
  });

  it("stays hidden for a visitor who already chose", () => {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify({ analytics: false, at: "x", v: 1 }));
    renderAt("/");
    revealBanner();

    expect(screen.queryByTestId("cookie-consent-banner")).toBeNull();
  });

  it.each(["/auth/callback", "/auth/yandex/callback", "/auth/vk/callback"])("is not shown on %s", (path) => {
    renderAt(path);
    revealBanner();

    expect(screen.queryByTestId("cookie-consent-banner")).toBeNull();
  });

  it("is not shown while a sign-in credential is in the address", () => {
    window.history.replaceState({}, "", "/auth/reset-password#access_token=FAKE&refresh_token=FAKE");
    renderAt("/auth/reset-password");
    revealBanner();

    expect(screen.queryByTestId("cookie-consent-banner")).toBeNull();
  });

  it("keeps clear of Shurik and «Обратная связь» inside the app, and of the page edges elsewhere", () => {
    renderAt("/project/p1/tasks");
    revealBanner();
    expect(screen.getByTestId("cookie-consent-banner").className).toContain("md:max-w-[calc(100%-400px)]");
  });

  it("keeps the hidden card out of the tab order and the accessibility tree until it appears", () => {
    renderAt("/");
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const card = screen.getByTestId("cookie-consent-banner");
    expect(card).toHaveAttribute("aria-hidden", "true");
    expect(card.querySelector("button")).toHaveAttribute("tabindex", "-1");

    revealBanner();
    expect(card).not.toHaveAttribute("aria-hidden");
    expect(card.querySelector("button")).not.toHaveAttribute("tabindex");
  });

  it.each(["/", "/blog", "/blog/some-post", "/baza", "/baza/sp-48"])("gives the landing footer room through --cookie-banner-h on %s, not body padding", (path) => {
    renderAt(path);
    revealBanner();
    expect(document.documentElement.style.getPropertyValue("--cookie-banner-h")).not.toBe("");
    expect(document.body.style.paddingBottom).toBe("");
  });

  it("reserves its height with body padding on other public pages", () => {
    renderAt("/privacy");
    revealBanner();
    expect(document.body.style.paddingBottom).not.toBe("");
    expect(document.documentElement.style.getPropertyValue("--cookie-banner-h")).toBe("");
  });

  it("goes away when the visitor answers in «Настройки cookie», even if the browser refused to store it", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <CookieConsentBanner />
        <CookieSettingsDialog />
      </MemoryRouter>,
    );
    revealBanner();
    expect(screen.getByTestId("cookie-consent-banner")).toBeInTheDocument();

    act(() => {
      openCookieSettings();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.queryByTestId("cookie-consent-banner")).toBeNull();
  });
});

describe("isAppShellPath", () => {
  it.each([
    ["/home", true],
    ["/project/abc/tasks", true],
    ["/settings", true],
    ["/blog/admin/new", true],
    ["/", false],
    ["/blog", false],
    ["/blog/some-post", false],
    ["/baza/sp-48", false],
    ["/privacy", false],
    ["/homepage", false],
  ])("%s → %s", (path, expected) => {
    expect(isAppShellPath(path)).toBe(expected);
  });
});
