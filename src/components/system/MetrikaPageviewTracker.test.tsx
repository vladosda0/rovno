import { useEffect } from "react";
import { BrowserRouter, useNavigate } from "react-router-dom";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const COUNTER_ID = "99999";
const AUTH_FRAGMENT = "#access_token=FAKEQAACCESS&refresh_token=FAKEQAREFRESH&token_type=bearer&type=recovery";

type YmMock = ReturnType<typeof vi.fn>;

function Navigate({ to }: { to: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to);
  }, [navigate, to]);
  return null;
}

describe("MetrikaPageviewTracker", () => {
  let ym: YmMock;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_METRIKA_COUNTER_ID", COUNTER_ID);
    ym = vi.fn();
    (window as unknown as { ym?: unknown }).ym = ym;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    delete (window as unknown as { ym?: unknown }).ym;
    window.history.replaceState({}, "", "/");
  });

  // BrowserRouter, not MemoryRouter: the tracker reads window.location, so the
  // router has to drive it or the assertion pins the pre-navigation URL.
  it("sends a pageview whose url carries neither the auth fragment nor private query params", async () => {
    window.history.replaceState({}, "", `/auth/reset-password?lang=ru${AUTH_FRAGMENT}`);
    const referrer = `${window.location.origin}/auth/login?next=%2Finvite%2Faccept%2FQA-INVITE`;
    Object.defineProperty(document, "referrer", { value: referrer, configurable: true });
    const { MetrikaPageviewTracker } = await import("./MetrikaPageviewTracker");

    render(
      <BrowserRouter>
        <MetrikaPageviewTracker />
        <Navigate to="/auth/email-sent?lang=ru&email=user%40example.com" />
      </BrowserRouter>,
    );

    await waitFor(() => expect(ym.mock.calls.some((call) => call[1] === "hit")).toBe(true));

    const hits = ym.mock.calls.filter((call) => call[1] === "hit");
    expect(hits).toHaveLength(1);
    expect(window.location.pathname).toBe("/auth/email-sent");
    expect(hits[0][2]).toBe(`${window.location.origin}/auth/email-sent?lang=ru`);
    expect(hits[0][2]).not.toContain("access_token");
    expect(hits[0][2]).not.toContain("example.com");
    expect((hits[0][3] as { referer: string }).referer).toBe(window.location.origin);
    Object.defineProperty(document, "referrer", { value: "", configurable: true });
  });

  it("loads a share link afresh instead of showing it next to a running tag", async () => {
    window.history.replaceState({}, "", "/home");
    const analytics = await import("@/lib/analytics");
    const replace = vi.spyOn(analytics.documentNavigation, "replace").mockImplementation(() => {});
    const { MetrikaPageviewTracker } = await import("./MetrikaPageviewTracker");

    render(
      <BrowserRouter>
        <MetrikaPageviewTracker />
        <Navigate to="/share/estimate/QA-SHARE-TOKEN" />
      </BrowserRouter>,
    );

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(`${window.location.origin}/share/estimate/QA-SHARE-TOKEN`),
    );
    expect(ym.mock.calls.filter((call) => call[1] === "hit")).toHaveLength(0);
  });

  it("loads the next page afresh when leaving a share link, and starts no tag on the way", async () => {
    window.history.replaceState({}, "", "/share/estimate/QA-SHARE-TOKEN");
    const analytics = await import("@/lib/analytics");
    const replace = vi.spyOn(analytics.documentNavigation, "replace").mockImplementation(() => {});
    const { MetrikaPageviewTracker } = await import("./MetrikaPageviewTracker");

    render(
      <BrowserRouter>
        <MetrikaPageviewTracker />
        <Navigate to="/home" />
      </BrowserRouter>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith(`${window.location.origin}/home`));
    expect(ym.mock.calls.filter((call) => call[1] === "init" || call[1] === "hit")).toHaveLength(0);
  });
});
