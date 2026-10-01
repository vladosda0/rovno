import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PaymentIntentRow } from "@/lib/billing";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const receiptHtml: string[] = [];
vi.mock("@/lib/receipt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/receipt")>();
  return {
    ...actual,
    buildReceiptHtml: (...args: Parameters<typeof actual.buildReceiptHtml>) => {
      const html = actual.buildReceiptHtml(...args);
      receiptHtml.push(html);
      return html;
    },
  };
});

import { PaymentDetailDialog } from "@/components/billing/PaymentDetailDialog";

function payment(status: string): PaymentIntentRow {
  return {
    id: "22222222-0000-0000-0000-000000000000",
    profile_id: "p1",
    plan_code: "master",
    amount_kopecks: 99000,
    currency: "RUB",
    status,
    error_code: null,
    error_message: null,
    confirmed_at: "2026-05-15T00:00:00Z",
    created_at: "2026-05-15T00:00:00Z",
  };
}

function openReceipt(status: string) {
  render(
    <PaymentDetailDialog
      payment={payment(status)}
      userEmail="vlad@example.com"
      trigger={<button type="button">open</button>}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "open" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /download receipt/i }));
  return { dialog, html: receiptHtml[receiptHtml.length - 1] };
}

describe("PaymentDetailDialog receipt tab", () => {
  beforeEach(() => {
    receiptHtml.length = 0;
    URL.createObjectURL = vi.fn(() => "blob:receipt");
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("marks a refunded payment as refunded on screen and in the downloaded receipt", () => {
    const { dialog, html } = openReceipt("refunded");

    const list = dialog.querySelector("dl") as HTMLElement;
    expect(within(list).getByText("Status")).toBeInTheDocument();
    expect(within(list).getByText("Refunded")).toBeInTheDocument();
    expect(html).toContain("Status");
    expect(html).toContain("Refunded");
  });

  it("adds no status row for a confirmed payment", () => {
    const { dialog, html } = openReceipt("confirmed");

    const list = dialog.querySelector("dl") as HTMLElement;
    expect(within(list).queryByText("Status")).toBeNull();
    expect(html).not.toContain("Status");
    expect(html).not.toContain("Refunded");
  });

  it("does not call a partially refunded payment refunded", () => {
    const { dialog, html } = openReceipt("partial_refund");

    const list = dialog.querySelector("dl") as HTMLElement;
    expect(within(list).queryByText("Refunded")).toBeNull();
    expect(html).not.toContain("Refunded");
  });
});
