import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import NotFound from "@/pages/NotFound";

describe("NotFound (site-redesign 1.2)", () => {
  it("tells crawlers not to index an unknown address", () => {
    render(
      <MemoryRouter initialEntries={["/no-such-page-xyz"]}>
        <NotFound />
      </MemoryRouter>,
    );
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
  });

  it("does not leave the landing canonical next to noindex (review round 1)", () => {
    const link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute("href", "https://rovno.ai/");
    document.head.appendChild(link);
    render(
      <MemoryRouter initialEntries={["/no-such-page-xyz"]}>
        <NotFound />
      </MemoryRouter>,
    );
    const canonicals = [...document.head.querySelectorAll('link[rel="canonical"]')].map((el) => el.getAttribute("href"));
    expect(canonicals).not.toContain("https://rovno.ai/");
  });
});
