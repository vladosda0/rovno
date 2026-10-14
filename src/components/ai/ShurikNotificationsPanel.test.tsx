import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ShurikNotificationsPanel } from "@/components/ai/ShurikNotificationsPanel";
import type { ShurikMessage } from "@/types/entities";

const briefing: ShurikMessage = {
  id: "briefing-1",
  user_id: "profile-1",
  project_id: "p1",
  type: "briefing",
  title: "Планёрка · Ленина 42",
  body: "Сегодня срок: приёмка плитки.",
  is_read: true,
  read_at: null,
  created_at: "2026-10-09T06:00:00.000Z",
  payload: {},
};

function renderPanel(clientReportAvailable: boolean) {
  return render(
    <MemoryRouter>
      <ShurikNotificationsPanel
        messages={[briefing]}
        unreadCount={0}
        onMarkRead={vi.fn()}
        onClose={vi.fn()}
        clientReportAvailable={clientReportAvailable}
      />
    </MemoryRouter>,
  );
}

describe("ShurikNotificationsPanel", () => {
  it("offers «Client report» under a briefing outside a project where the report can be opened", () => {
    renderPanel(true);
    expect(screen.getByRole("button", { name: "Client report" })).toBeInTheDocument();
  });

  it("does not offer it where the report cannot be opened", () => {
    renderPanel(false);
    expect(screen.queryByRole("button", { name: "Client report" })).not.toBeInTheDocument();
  });
});
