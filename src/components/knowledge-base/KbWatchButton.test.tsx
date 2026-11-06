import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeAuthState } from "@/hooks/use-runtime-auth";

const fetchKbWatching = vi.fn();
const setKbWatch = vi.fn();
vi.mock("@/lib/knowledge-base/api", () => ({
  fetchKbWatching: (slug: string) => fetchKbWatching(slug),
  setKbWatch: (slug: string, watch: boolean) => setKbWatch(slug, watch),
}));

import { __unsafeResetRuntimeAuthForTests, __unsafeSetRuntimeAuthStateForTests } from "@/hooks/use-runtime-auth";
import { KbWatchButton } from "@/components/knowledge-base/KbWatchButton";
import { KbPendingWatch } from "@/components/knowledge-base/KbPendingWatch";
import { KB_PENDING_WATCH_KEY, peekKbPendingWatch, rememberKbPendingWatch } from "@/lib/knowledge-base/kbPendingWatch";

const SIGNED_IN = {
  status: "authenticated",
  session: null,
  user: null,
  profileId: "profile-1",
} as unknown as RuntimeAuthState;
const GUEST: RuntimeAuthState = { status: "guest", session: null, user: null, profileId: null };

function renderWith(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  fetchKbWatching.mockReset().mockResolvedValue(false);
  setKbWatch.mockReset().mockImplementation(async (_slug: string, watch: boolean) => watch);
});
afterEach(() => {
  __unsafeResetRuntimeAuthForTests();
});

describe("KbWatchButton (docs-library 8.5, mockup frames 4, 4a, 5a)", () => {
  it("follows a document and a second click stops following", async () => {
    __unsafeSetRuntimeAuthStateForTests(SIGNED_IN);
    renderWith(<KbWatchButton slug="sp-29-13330" />);
    const follow = await screen.findByRole("button", { name: "Follow changes" });
    await waitFor(() => expect(follow).toBeEnabled());
    fireEvent.click(follow);
    await waitFor(() => expect(setKbWatch).toHaveBeenLastCalledWith("sp-29-13330", true));
    const following = await screen.findByRole("button", { name: "Following" });
    await waitFor(() => expect(following).toBeEnabled());
    fireEvent.click(following);
    await waitFor(() => expect(setKbWatch).toHaveBeenLastCalledWith("sp-29-13330", false));
    expect(await screen.findByRole("button", { name: "Follow changes" })).toBeInTheDocument();
    expect(fetchKbWatching).toHaveBeenCalledWith("sp-29-13330");
  });

  it("reads «Following» for a document already followed", async () => {
    __unsafeSetRuntimeAuthStateForTests(SIGNED_IN);
    fetchKbWatching.mockResolvedValue(true);
    renderWith(<KbWatchButton slug="sp-29-13330" />);
    expect(await screen.findByRole("button", { name: "Following" })).toBeInTheDocument();
  });

  it("is not in the app for someone who is not signed in", () => {
    __unsafeSetRuntimeAuthStateForTests(GUEST);
    renderWith(<KbWatchButton slug="sp-29-13330" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("on the site sends a guest to sign up and remembers the document", () => {
    __unsafeSetRuntimeAuthStateForTests(GUEST);
    renderWith(<KbWatchButton slug="sp-29-13330" appearance="site" />);
    const link = screen.getByRole("link", { name: "Follow changes" });
    expect(link).toHaveAttribute("href", "/auth/signup?next=%2Fbaza%2Fsp-29-13330%2F");
    fireEvent.click(link);
    expect(peekKbPendingWatch()).toBe("sp-29-13330");
    expect(setKbWatch).not.toHaveBeenCalled();
  });

  it("after sign-up the remembered document is followed and the button says so", async () => {
    rememberKbPendingWatch("sp-29-13330");
    __unsafeSetRuntimeAuthStateForTests(SIGNED_IN);
    let resolveWatching: (value: boolean) => void = () => {};
    fetchKbWatching.mockReturnValue(new Promise<boolean>((resolve) => { resolveWatching = resolve; }));
    renderWith(
      <>
        <KbPendingWatch />
        <KbWatchButton slug="sp-29-13330" appearance="site" />
      </>,
    );
    await waitFor(() => expect(setKbWatch).toHaveBeenCalledWith("sp-29-13330", true));
    expect(await screen.findByRole("button", { name: "Following" })).toBeInTheDocument();
    expect(localStorage.getItem(KB_PENDING_WATCH_KEY)).toBeNull();
    // A late answer of the first read does not undo it.
    resolveWatching(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole("button", { name: "Following" })).toBeInTheDocument();
    expect(setKbWatch).toHaveBeenCalledTimes(1);
  });

  it("keeps the remembered document after a network error or a refused session, for the next sign-in", async () => {
    for (const error of [new Error("offline"), Object.assign(new Error("denied"), { code: "42501" })]) {
      rememberKbPendingWatch("sp-29-13330");
      setKbWatch.mockReset().mockRejectedValue(error);
      __unsafeSetRuntimeAuthStateForTests(SIGNED_IN);
      const view = renderWith(<KbPendingWatch />);
      await waitFor(() => expect(setKbWatch).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(peekKbPendingWatch()).toBe("sp-29-13330");
      view.unmount();
      __unsafeResetRuntimeAuthForTests();
    }
  });

  it("forgets the remembered document when the server refuses it for good (no such document, bad slug)", async () => {
    for (const code of ["P0002", "22023"]) {
      rememberKbPendingWatch("gone");
      setKbWatch.mockReset().mockRejectedValue(Object.assign(new Error("refused"), { code }));
      __unsafeSetRuntimeAuthStateForTests(SIGNED_IN);
      const view = renderWith(<KbPendingWatch />);
      await waitFor(() => expect(setKbWatch).toHaveBeenCalled());
      await waitFor(() => expect(localStorage.getItem(KB_PENDING_WATCH_KEY)).toBeNull());
      view.unmount();
      __unsafeResetRuntimeAuthForTests();
    }
  });

  it("drops a remembered document older than a day, and an entry in the old format", async () => {
    const now = Date.now();
    rememberKbPendingWatch("sp-29-13330", now - 25 * 60 * 60 * 1000);
    expect(peekKbPendingWatch(now)).toBeNull();
    expect(localStorage.getItem(KB_PENDING_WATCH_KEY)).toBeNull();
    rememberKbPendingWatch("sp-29-13330", now - 23 * 60 * 60 * 1000);
    expect(peekKbPendingWatch(now)).toBe("sp-29-13330");
    localStorage.setItem(KB_PENDING_WATCH_KEY, "sp-29-13330");
    expect(peekKbPendingWatch(now)).toBeNull();

    localStorage.setItem(KB_PENDING_WATCH_KEY, "sp-29-13330");
    __unsafeSetRuntimeAuthStateForTests(SIGNED_IN);
    renderWith(<KbPendingWatch />);
    await new Promise((r) => setTimeout(r, 0));
    expect(setKbWatch).not.toHaveBeenCalled();
  });
});
