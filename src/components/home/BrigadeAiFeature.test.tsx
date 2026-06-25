import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { useActiveSubscriptionMock } = vi.hoisted(() => ({
  useActiveSubscriptionMock: vi.fn(),
}));

vi.mock("@/hooks/useActiveSubscription", () => ({
  useActiveSubscription: useActiveSubscriptionMock,
}));

import { BrigadeAiFeature } from "@/components/home/BrigadeAiFeature";

function renderGate() {
  return render(
    <MemoryRouter>
      <BrigadeAiFeature title="My feature" feature="verdict">
        <div>SECRET CONTENT</div>
      </BrigadeAiFeature>
    </MemoryRouter>,
  );
}

function subscription(
  planCode: string | null,
  { isLoading = false, status = "active" }: { isLoading?: boolean; status?: string } = {},
) {
  return {
    status,
    subscription: planCode ? { plan_code: planCode } : null,
    readOnly: status === "expired",
    isLoading,
    refetch: () => {},
  };
}

describe("BrigadeAiFeature gate", () => {
  beforeEach(() => {
    useActiveSubscriptionMock.mockReset();
  });

  it("always shows the title and the AI-experimental badge", () => {
    useActiveSubscriptionMock.mockReturnValue(subscription("brigade"));
    renderGate();
    expect(screen.getByText("My feature")).toBeInTheDocument();
    expect(screen.getByText("AI · experimental")).toBeInTheDocument();
  });

  it("renders the feature on the Brigade plan", () => {
    useActiveSubscriptionMock.mockReturnValue(subscription("brigade"));
    renderGate();
    expect(screen.getByText("SECRET CONTENT")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("locks the feature and shows an upgrade CTA on a lower plan", () => {
    useActiveSubscriptionMock.mockReturnValue(subscription("master"));
    renderGate();
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
    expect(screen.getByText("Available on the «Brigade» plan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upgrade to «Brigade»/ })).toBeInTheDocument();
  });

  it("locks for a free/demo user with no subscription", () => {
    useActiveSubscriptionMock.mockReturnValue(subscription(null));
    renderGate();
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
    expect(screen.getByText("Available on the «Brigade» plan")).toBeInTheDocument();
  });

  it("shows a skeleton (not the locked state) while the subscription loads", () => {
    useActiveSubscriptionMock.mockReturnValue(subscription(null, { isLoading: true }));
    const { container } = renderGate();
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
    expect(screen.queryByText("Available on the «Brigade» plan")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("locks an expired brigade subscription (plan kept but soft-blocked)", () => {
    useActiveSubscriptionMock.mockReturnValue(subscription("brigade", { status: "expired" }));
    renderGate();
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
    expect(screen.getByText("Available on the «Brigade» plan")).toBeInTheDocument();
  });

  it("keeps the feature available during the grace window", () => {
    useActiveSubscriptionMock.mockReturnValue(subscription("brigade", { status: "grace" }));
    renderGate();
    expect(screen.getByText("SECRET CONTENT")).toBeInTheDocument();
  });
});
