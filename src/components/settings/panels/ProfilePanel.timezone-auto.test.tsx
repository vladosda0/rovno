// "Browser (auto-detect)" saves the browser's real zone: the server counts days by
// `profiles.timezone`, and the literal string `auto` tells it nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

const BROWSER_ZONE = "Europe/Samara";

const { currentUser, mutateIdentity, browser } = vi.hoisted(() => ({
  browser: { zone: "Europe/Samara" },
  currentUser: {
    id: "u1",
    email: "a@b.co",
    name: "Alex Builder",
    avatar: undefined as string | undefined,
    locale: "ru",
    timezone: "Europe/Moscow",
    plan: "free" as const,
    credits_free: 0,
    credits_paid: 0,
  },
  mutateIdentity: vi.fn(),
}));
const contactInfo = { roleTitle: "", phone: "", bio: "", signatureBlock: "" };

vi.mock("@/hooks/use-mock-data", () => ({ useCurrentUser: () => currentUser }));
vi.mock("@/hooks/use-workspace-source", () => ({
  useWorkspaceMode: () => ({ kind: "supabase", profileId: "u1" }),
  useWorkspaceProfileContactInfoState: () => ({ contactInfo, isLoading: false }),
  useUpdateWorkspaceProfileIdentity: () => ({ mutateAsync: mutateIdentity, isPending: false }),
  useUpdateWorkspaceProfileContactInfo: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-avatar-upload", () => ({ useAvatarUpload: () => ({ uploadAvatar: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { ProfilePanel } from "@/components/settings/panels/ProfilePanel";
import { readTimezoneFromBrowser, rememberTimezoneFromBrowser } from "@/lib/profile-timezone";

function timezoneTrigger() {
  return screen.getByRole("combobox");
}

async function pickTimezone(label: string) {
  fireEvent.click(timezoneTrigger());
  fireEvent.click(within(await screen.findByRole("listbox")).getByText(label));
}

async function save() {
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mutateIdentity).toHaveBeenCalledTimes(1));
}

describe("ProfilePanel, Browser (auto-detect)", () => {
  beforeEach(() => {
    localStorage.clear();
    currentUser.timezone = "Europe/Moscow";
    browser.zone = BROWSER_ZONE;
    mutateIdentity.mockReset();
    // What the database answers with: the zone it was sent.
    mutateIdentity.mockImplementation(async (patch: { timezone?: string }) => {
      if (patch.timezone !== undefined) currentUser.timezone = patch.timezone;
      return currentUser;
    });
    const real = Intl.DateTimeFormat.prototype.resolvedOptions;
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) {
      return { ...real.call(this), timeZone: browser.zone };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the browser's zone, not the word auto", async () => {
    render(<ProfilePanel />);

    await pickTimezone("Browser (auto-detect)");
    await save();

    expect(mutateIdentity.mock.calls[0][0]).toMatchObject({ timezone: BROWSER_ZONE });
  });

  it("still shows the auto option after the save and after a reload", async () => {
    render(<ProfilePanel />);
    await pickTimezone("Browser (auto-detect)");
    await save();

    await waitFor(() => expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument());
    expect(timezoneTrigger()).toHaveTextContent("Browser (auto-detect)");

    cleanup();
    render(<ProfilePanel />);

    expect(currentUser.timezone).toBe(BROWSER_ZONE);
    expect(timezoneTrigger()).toHaveTextContent("Browser (auto-detect)");
    fireEvent.click(timezoneTrigger());
    expect(within(await screen.findByRole("listbox")).queryByText(BROWSER_ZONE)).not.toBeInTheDocument();
  });

  it("names a zone that was picked by hand, even when it is the browser's own", () => {
    currentUser.timezone = BROWSER_ZONE;
    render(<ProfilePanel />);

    expect(timezoneTrigger()).toHaveTextContent(BROWSER_ZONE);
  });

  it("follows the zone the app wrote on its own while the form was open", () => {
    currentUser.timezone = "UTC";
    const { rerender } = render(<ProfilePanel />);
    expect(timezoneTrigger()).toHaveTextContent("UTC (UTC+0)");

    rememberTimezoneFromBrowser("u1", true);
    currentUser.timezone = BROWSER_ZONE;
    rerender(<ProfilePanel />);

    expect(timezoneTrigger()).toHaveTextContent("Browser (auto-detect)");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("forgets the auto choice once a zone is picked by hand", async () => {
    render(<ProfilePanel />);
    await pickTimezone("Browser (auto-detect)");
    await save();
    mutateIdentity.mockClear();

    await pickTimezone("Asia/Tokyo (UTC+9)");
    await save();
    expect(mutateIdentity.mock.calls[0][0]).toMatchObject({ timezone: "Asia/Tokyo" });

    // Back in the browser's zone by hand: it is named, not shown as auto.
    currentUser.timezone = BROWSER_ZONE;
    cleanup();
    render(<ProfilePanel />);
    expect(timezoneTrigger()).toHaveTextContent(BROWSER_ZONE);
  });
  describe("UTC", () => {
    it("saves the UTC option as Etc/UTC: a bare UTC in the profile means no zone was chosen", async () => {
      render(<ProfilePanel />);

      await pickTimezone("UTC (UTC+0)");
      await save();

      expect(mutateIdentity.mock.calls[0][0]).toMatchObject({ timezone: "Etc/UTC" });
    });

    it("leaves the zone out of a save that did not touch it, and does not count it as picked by hand", async () => {
      currentUser.timezone = "UTC";
      render(<ProfilePanel />);

      fireEvent.change(screen.getByDisplayValue("Alex Builder"), { target: { value: "Alex B." } });
      await save();

      expect(mutateIdentity.mock.calls[0][0]).toMatchObject({ fullName: "Alex B." });
      expect(mutateIdentity.mock.calls[0][0].timezone).toBeUndefined();
      expect(readTimezoneFromBrowser("u1")).toBeNull();
    });

    it("leaves a stored zone and the auto choice alone on a save that did not touch them", async () => {
      rememberTimezoneFromBrowser("u1", true);
      currentUser.timezone = BROWSER_ZONE;
      render(<ProfilePanel />);
      expect(timezoneTrigger()).toHaveTextContent("Browser (auto-detect)");

      fireEvent.change(screen.getByDisplayValue("Alex Builder"), { target: { value: "Alex B." } });
      await save();

      expect(mutateIdentity.mock.calls[0][0].timezone).toBeUndefined();
      expect(readTimezoneFromBrowser("u1")).toBe(true);
    });

    it("saves Etc/UTC over the default UTC once the UTC option is picked by hand", async () => {
      currentUser.timezone = "UTC";
      render(<ProfilePanel />);
      expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

      await pickTimezone("Asia/Tokyo (UTC+9)");
      await pickTimezone("UTC (UTC+0)");
      await save();

      expect(mutateIdentity.mock.calls[0][0]).toMatchObject({ timezone: "Etc/UTC" });
      expect(readTimezoneFromBrowser("u1")).toBe(false);
    });

    it("shows a stored Etc/UTC as the UTC option, once in the list", async () => {
      currentUser.timezone = "Etc/UTC";
      render(<ProfilePanel />);

      expect(timezoneTrigger()).toHaveTextContent("UTC (UTC+0)");
      expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
      fireEvent.click(timezoneTrigger());
      const listbox = await screen.findByRole("listbox");
      expect(within(listbox).getAllByRole("option")).toHaveLength(7);
      expect(within(listbox).queryByText("Etc/UTC")).not.toBeInTheDocument();
    });

    it("shows the stored default UTC as before", () => {
      currentUser.timezone = "UTC";
      render(<ProfilePanel />);

      expect(timezoneTrigger()).toHaveTextContent("UTC (UTC+0)");
    });

    it.each(["UTC", "Etc/UTC", "GMT", "Etc/GMT"])("sends Etc/UTC for the auto option in a browser on %s", async (zone) => {
      browser.zone = zone;
      render(<ProfilePanel />);

      await pickTimezone("Browser (auto-detect)");
      await save();

      expect(mutateIdentity.mock.calls[0][0]).toMatchObject({ timezone: "Etc/UTC" });
      await waitFor(() => expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument());
      expect(timezoneTrigger()).toHaveTextContent("Browser (auto-detect)");
    });
  });
});
