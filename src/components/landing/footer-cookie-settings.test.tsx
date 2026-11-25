import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { Footer } from "@/components/landing/LandingSections";
import { OPEN_COOKIE_SETTINGS_EVENT } from "@/lib/cookie-consent";
import en from "@/locales/en.json";
import ru from "@/locales/ru.json";

describe("landing footer: «Настройки cookie» (rovno#333)", () => {
  it("puts 'Cookie settings' after the contacts link and opens the settings on click", () => {
    render(
      <MemoryRouter>
        <Footer onDemo={() => {}} />
      </MemoryRouter>,
    );
    const button = screen.getByRole("button", { name: "Cookie settings" });
    const contacts = screen.getAllByRole("link", { name: "Contact" }).at(-1)!;
    expect(contacts.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const onOpen = vi.fn();
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, onOpen);
    fireEvent.click(button);
    window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, onOpen);

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("has every cookie text in both locales, and the English offer strip's texts are gone", () => {
    const keys = Object.keys(ru).filter((key) => key.startsWith("cookieConsent.") || key === "landing.footer.cookies");
    expect(keys.length).toBe(13);
    for (const key of keys) expect(en).toHaveProperty([key]);
    expect((ru as Record<string, string>)["cookieConsent.text"]).toBe(
      "Мы используем cookie, чтобы делать платформу удобнее.",
    );
    expect(Object.keys(ru).some((key) => key.startsWith("landing.languagePrompt."))).toBe(false);
    expect(Object.keys(en).some((key) => key.startsWith("landing.languagePrompt."))).toBe(false);
  });
});
