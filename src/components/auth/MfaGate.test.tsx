import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { Session, User } from "@supabase/supabase-js";
import { MfaGate } from "@/components/auth/MfaGate";
import { __unsafeResetRuntimeAuthForTests, __unsafeSetRuntimeAuthStateForTests } from "@/hooks/use-runtime-auth";

const { auth } = vi.hoisted(() => ({
  auth: { refreshSession: vi.fn(), mfa: { getAuthenticatorAssuranceLevel: vi.fn() } },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));

function Where({ label }: { label: string }) {
  const location = useLocation();
  return <p data-testid="where">{`${label} ${location.pathname}${location.search}`}</p>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <MfaGate>
        <Routes>
          <Route path="/auth/mfa" element={<Where label="code" />} />
          <Route path="*" element={<Where label="page" />} />
        </Routes>
      </MfaGate>
    </MemoryRouter>,
  );
}

const tokenWith = (aal: string) => `h.${btoa(JSON.stringify({ aal, sub: "u1" })).replace(/=+$/, "")}.s`;

function signIn(aal = "aal1", factors: { id: string; status: string }[] = [{ id: "f1", status: "verified" }]) {
  const user = { id: "u1", factors } as unknown as User;
  __unsafeSetRuntimeAuthStateForTests({ status: "authenticated", session: { user, access_token: tokenWith(aal) } as unknown as Session, user, profileId: "u1" });
}

function Draft() {
  const [text, setText] = useState("");
  return <input aria-label="draft" value={text} onChange={(e) => setText(e.target.value)} />;
}

describe("MfaGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn();
  });
  afterEach(() => __unsafeResetRuntimeAuthForTests());

  it("a session without the second step goes to the code screen and keeps where it was going", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
    renderAt("/project/7?tab=docs");
    expect(await screen.findByTestId("where")).toHaveTextContent("code /auth/mfa?next=%2Fproject%2F7%3Ftab%3Ddocs");
  });

  it("sign-in and the legal pages stay open without the second step; the knowledge base does not", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
    const { unmount } = renderAt("/privacy");
    expect(await screen.findByTestId("where")).toHaveTextContent("page /privacy");
    unmount();
    renderAt("/baza/snip");
    expect(await screen.findByTestId("where")).toHaveTextContent("code /auth/mfa?next=%2Fbaza%2Fsnip");
  });

  it("a token refresh or a return to the tab does not unmount the page: what was typed stays", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null });
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <MfaGate>
          <Routes>
            <Route path="*" element={<Draft />} />
          </Routes>
        </MfaGate>
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText("draft"), { target: { value: "half a sentence" } });
    // A new session object for the same person and level (TOKEN_REFRESHED, SIGNED_IN on focus).
    await act(async () => signIn());
    // The second step passed in Security (aal2): asked again, still no remount.
    await act(async () => signIn("aal2"));
    expect(screen.getByLabelText("draft")).toHaveValue("half a sentence");
  });

  it("a drop from aal2 to aal1 hides the page while the step is asked again, then sends to the code", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null });
    signIn("aal2");
    renderAt("/home");
    expect(await screen.findByTestId("where")).toHaveTextContent("page /home");
    let answer: (value: unknown) => void = () => {};
    auth.mfa.getAuthenticatorAssuranceLevel.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await act(async () => signIn("aal1"));
    expect(screen.queryByTestId("where")).not.toBeInTheDocument();
    await act(async () => answer({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null }));
    expect(await screen.findByTestId("where")).toHaveTextContent("code /auth/mfa?next=%2Fhome");
  });

  it("turning the protection off (aal2 to aal1, no factor left) keeps the page mounted", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null });
    signIn("aal2");
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <MfaGate>
          <Routes>
            <Route path="*" element={<Draft />} />
          </Routes>
        </MfaGate>
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText("draft"), { target: { value: "kept" } });
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null });
    await act(async () => signIn("aal1", []));
    expect(screen.getByLabelText("draft")).toHaveValue("kept");
  });

  it("only the newest check decides: an older answer arriving late is dropped", async () => {
    let older: (value: unknown) => void = () => {};
    auth.mfa.getAuthenticatorAssuranceLevel
      .mockReturnValueOnce(new Promise((resolve) => (older = resolve)))
      .mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null });
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <MfaGate>
          <Routes>
            <Route path="*" element={<Draft />} />
          </Routes>
        </MfaGate>
      </MemoryRouter>,
    );
    // A newer check starts (the factors changed) and answers «not owed»: the page opens.
    await act(async () => signIn("aal1", []));
    fireEvent.change(await screen.findByLabelText("draft"), { target: { value: "kept" } });
    // The first check answers «owed» late; it must not close the page.
    await act(async () => older({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null }));
    expect(screen.getByLabelText("draft")).toHaveValue("kept");
  });

  it("signed in by face or fingerprint with the protection on: straight in, no code screen (5.10)", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [{ method: "passkey", timestamp: 1 }] },
      error: null,
    });
    renderAt("/project/7");
    expect(await screen.findByTestId("where")).toHaveTextContent("page /project/7");
  });

  it("signed in by password with the protection on: still the code screen (5.10)", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [{ method: "password", timestamp: 1 }] },
      error: null,
    });
    renderAt("/project/7");
    expect(await screen.findByTestId("where")).toHaveTextContent("code /auth/mfa?next=%2Fproject%2F7");
  });

  it("passed the second step, or never turned it on: the page opens", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null });
    const { unmount } = renderAt("/home");
    expect(await screen.findByTestId("where")).toHaveTextContent("page /home");
    unmount();
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null });
    renderAt("/home");
    expect(await screen.findByTestId("where")).toHaveTextContent("page /home");
  });
});
