import { formatRubFromKopecks, type PaymentIntentRow } from "@/lib/billing";

export interface ReceiptLabels {
  title: string;
  date: string;
  id: string;
  plan: string;
  amount: string;
  email: string;
  note: string;
}

export interface ReceiptData {
  payment: PaymentIntentRow;
  planName: string;
  dateLabel: string;
  userEmail: string;
  labels: ReceiptLabels;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

// Builds a self-contained, printable HTML receipt. This is an INFORMATIONAL copy:
// the official 54-FZ fiscal receipt is emailed by the OFD. Dependency-free so it
// downloads as a .html the user can open and print to PDF.
export function buildReceiptHtml(data: ReceiptData): string {
  const { payment, planName, dateLabel, userEmail, labels } = data;
  const rows: Array<[string, string]> = [
    [labels.date, dateLabel],
    [labels.id, payment.id],
    [labels.plan, planName],
    [labels.amount, formatRubFromKopecks(payment.amount_kopecks)],
    [labels.email, userEmail],
  ];
  const rowsHtml = rows
    .map(([k, v]) => `<tr><td class="k">${escapeHtml(k)}</td><td class="v">${escapeHtml(v)}</td></tr>`)
    .join("");
  return [
    "<!doctype html>",
    '<html lang="ru"><head><meta charset="utf-8">',
    `<title>${escapeHtml(labels.title)} ${escapeHtml(payment.id)}</title>`,
    "<style>",
    "body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1a1a1a;max-width:520px;margin:40px auto;padding:0 24px}",
    "h1{font-size:20px;margin:0 0 16px}.brand{color:#1E5CCB;font-weight:700}",
    "table{width:100%;border-collapse:collapse;margin:8px 0}",
    "td{padding:10px 0;border-bottom:1px solid #ececec;font-size:14px}",
    ".k{color:#666}.v{text-align:right;font-weight:500;word-break:break-all}",
    ".note{color:#888;font-size:12px;margin-top:20px;line-height:1.5}",
    "@media print{body{margin:0}}",
    "</style></head><body>",
    `<h1><span class="brand">Ровно</span> · ${escapeHtml(labels.title)}</h1>`,
    `<table>${rowsHtml}</table>`,
    `<p class="note">${escapeHtml(labels.note)}</p>`,
    "</body></html>",
  ].join("");
}
