import { type CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClientInfo, OrgCard } from "@/types/org-card";
import {
  type ExportLineRow,
  type ExportPayload,
  type ExportVariant,
  formatExportDate,
  formatExportMoney,
  formatExportPercent,
  formatExportQty,
  variantShowsCost,
  variantShowsRequisites,
  variantShowsSignatures,
} from "@/lib/estimate-export-data";

export interface EstimateDocumentLabels {
  title: string;
  project: string;
  generated: string;
  contractor: string;
  customer: string;
  org: {
    legalName: string;
    inn: string;
    kpp: string;
    ogrn: string;
    legalAddress: string;
    postalAddress: string;
    bank: string;
    bankAccount: string;
    correspondentAccount: string;
    bik: string;
    phone: string;
    email: string;
    signatory: string;
  };
  client: {
    name: string;
    inn: string;
    address: string;
    phone: string;
    email: string;
  };
  col: {
    number: string;
    title: string;
    type: string;
    qty: string;
    unit: string;
    costUnit: string;
    costTotal: string;
    markup: string;
    discount: string;
    unitPrice: string;
    total: string;
    discountedTotal: string;
  };
  stageWordSingular: string;
  workWordSingular: string;
  stageSubtotal: string;
  workSubtotal: string;
  totals: {
    subtotal: string;
    discount: string;
    taxableBase: string;
    vat: string;
    totalIncVat: string;
  };
  signatures: {
    contractor: string;
    customer: string;
    date: string;
    nameHint: string;
  };
  resourceType: Record<string, string>;
  placeholder: string;
}

export type DocumentOrientation = "portrait" | "landscape";

interface EstimateDocumentProps {
  payload: ExportPayload;
  variant: ExportVariant;
  orgCard: OrgCard | null;
  clientInfo: ClientInfo | null;
  labels: EstimateDocumentLabels;
  orientation?: DocumentOrientation;
}

export function getOrientationForVariant(variant: ExportVariant): DocumentOrientation {
  return variant === "internal" ? "landscape" : "portrait";
}

function buildPageStyle(orientation: DocumentOrientation): CSSProperties {
  const isLandscape = orientation === "landscape";
  return {
    fontFamily:
      "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, 'PT Sans', 'Liberation Sans', sans-serif",
    fontSize: "10pt",
    lineHeight: 1.4,
    color: "#1a1a1a",
    background: "#ffffff",
    padding: isLandscape ? "12mm 14mm" : "16mm 14mm",
    boxSizing: "border-box",
    width: isLandscape ? "297mm" : "210mm",
    minHeight: isLandscape ? "210mm" : "297mm",
    margin: "0 auto",
  };
}

const HEADER: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  borderBottom: "2px solid #1a1a1a",
  paddingBottom: "8px",
  marginBottom: "14px",
};

const H1: CSSProperties = {
  fontSize: "18pt",
  fontWeight: 700,
  letterSpacing: "0.02em",
  margin: 0,
};

const META: CSSProperties = {
  fontSize: "9pt",
  color: "#555",
  textAlign: "right",
};

const REQS_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
  border: "1px solid #c5c5c5",
  borderRadius: "4px",
  marginBottom: "14px",
  pageBreakInside: "avoid",
};

const REQS_CELL: CSSProperties = {
  padding: "10px 12px",
  fontSize: "9.5pt",
};

const REQS_CELL_RIGHT: CSSProperties = {
  ...REQS_CELL,
  borderLeft: "1px solid #c5c5c5",
};

const REQS_HEADING: CSSProperties = {
  fontSize: "8.5pt",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#666",
  marginBottom: "4px",
};

const REQS_LINE: CSSProperties = {
  margin: "2px 0",
};

const STAGE_HEADER: CSSProperties = {
  background: "#f2f2f2",
  fontWeight: 700,
  fontSize: "10.5pt",
  padding: "6px 8px",
  marginTop: "10px",
  borderTop: "1px solid #c5c5c5",
  borderLeft: "1px solid #c5c5c5",
  borderRight: "1px solid #c5c5c5",
};

const WORK_HEADER: CSSProperties = {
  background: "#fafafa",
  fontWeight: 600,
  fontSize: "9.5pt",
  padding: "4px 8px",
  borderLeft: "1px solid #c5c5c5",
  borderRight: "1px solid #c5c5c5",
};

const TABLE: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "9pt",
};

const TH: CSSProperties = {
  background: "#ececec",
  border: "1px solid #c5c5c5",
  padding: "4px 6px",
  fontWeight: 600,
  textAlign: "left",
  fontSize: "8.5pt",
};

const TH_RIGHT: CSSProperties = { ...TH, textAlign: "right" };

const TD: CSSProperties = {
  border: "1px solid #c5c5c5",
  padding: "4px 6px",
  verticalAlign: "top",
  pageBreakInside: "avoid",
};

const TD_RIGHT: CSSProperties = { ...TD, textAlign: "right", whiteSpace: "nowrap" };

const TD_SUBTOTAL: CSSProperties = {
  ...TD,
  background: "#fafafa",
  fontWeight: 600,
  textAlign: "right",
};

const TOTALS_WRAP: CSSProperties = {
  marginTop: "14px",
  display: "flex",
  justifyContent: "flex-end",
  pageBreakInside: "avoid",
};

const TOTALS_TABLE: CSSProperties = {
  borderCollapse: "collapse",
  fontSize: "10pt",
  minWidth: "55%",
};

const TOTAL_ROW_LABEL: CSSProperties = {
  padding: "5px 12px",
  textAlign: "left",
  borderBottom: "1px solid #ececec",
};

const TOTAL_ROW_VALUE: CSSProperties = {
  padding: "5px 12px",
  textAlign: "right",
  borderBottom: "1px solid #ececec",
  whiteSpace: "nowrap",
};

const TOTAL_GRAND_LABEL: CSSProperties = {
  ...TOTAL_ROW_LABEL,
  fontWeight: 700,
  fontSize: "11pt",
  borderTop: "2px solid #1a1a1a",
  borderBottom: "none",
};

const TOTAL_GRAND_VALUE: CSSProperties = {
  ...TOTAL_ROW_VALUE,
  fontWeight: 700,
  fontSize: "11pt",
  borderTop: "2px solid #1a1a1a",
  borderBottom: "none",
};

const SIGNATURES_WRAP: CSSProperties = {
  marginTop: "28px",
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "32px",
  pageBreakInside: "avoid",
};

const SIGN_BLOCK: CSSProperties = {
  fontSize: "9.5pt",
};

const SIGN_LINE: CSSProperties = {
  borderBottom: "1px solid #1a1a1a",
  height: "24px",
  marginBottom: "4px",
};

const SIGN_NAME_HINT: CSSProperties = {
  fontSize: "8pt",
  color: "#666",
};

function formatLineQty(line: ExportLineRow): string {
  return formatExportQty(line.qtyMilli);
}

function reqsLine(label: string, value: string | undefined | null, placeholder: string) {
  return (
    <div style={REQS_LINE}>
      <span style={{ color: "#666" }}>{label}: </span>
      <span style={{ fontWeight: value?.trim() ? 500 : 400, color: value?.trim() ? "#1a1a1a" : "#999" }}>
        {value?.trim() ? value : placeholder}
      </span>
    </div>
  );
}

export function EstimateDocument({
  payload,
  variant,
  orgCard,
  clientInfo,
  labels,
  orientation,
}: EstimateDocumentProps) {
  const showCost = variantShowsCost(variant);
  const showRequisites = variantShowsRequisites(variant);
  const showSignatures = variantShowsSignatures(variant);
  const includeMarkup = showCost && payload.projectMode === "contractor";
  const pageOrientation = orientation ?? getOrientationForVariant(variant);
  const pageStyle = buildPageStyle(pageOrientation);

  const columns: Array<{ key: string; label: string; right?: boolean; widthPct?: number }> = [];
  columns.push({ key: "no", label: labels.col.number, widthPct: 4 });
  columns.push({ key: "title", label: labels.col.title });
  if (showCost) columns.push({ key: "type", label: labels.col.type, widthPct: 8 });
  columns.push({ key: "qty", label: labels.col.qty, right: true, widthPct: 7 });
  columns.push({ key: "unit", label: labels.col.unit, widthPct: 7 });
  if (showCost) {
    columns.push({ key: "costUnit", label: labels.col.costUnit, right: true, widthPct: 10 });
    columns.push({ key: "costTotal", label: labels.col.costTotal, right: true, widthPct: 10 });
    if (includeMarkup) {
      columns.push({ key: "markup", label: labels.col.markup, right: true, widthPct: 7 });
    }
    columns.push({ key: "discount", label: labels.col.discount, right: true, widthPct: 7 });
  }
  columns.push({ key: "unitPrice", label: labels.col.unitPrice, right: true, widthPct: 10 });
  columns.push({ key: "total", label: labels.col.total, right: true, widthPct: 10 });
  if (!showCost && payload.hasDiscountedClientTotal) {
    columns.push({ key: "discountedTotal", label: labels.col.discountedTotal, right: true, widthPct: 10 });
  }

  return (
    <div style={pageStyle}>
      <div style={HEADER}>
        <div>
          <h1 style={H1}>{labels.title}</h1>
          <div style={{ fontSize: "11pt", marginTop: "4px" }}>
            {labels.project}: «{payload.projectTitle}»
          </div>
        </div>
        <div style={META}>
          <div>{labels.generated}: {formatExportDate(payload.generatedAt)}</div>
        </div>
      </div>

      {showRequisites ? (
        <div style={REQS_GRID}>
          <div style={REQS_CELL}>
            <div style={REQS_HEADING}>{labels.contractor}</div>
            {reqsLine(labels.org.legalName, orgCard?.legalName, labels.placeholder)}
            {(orgCard?.inn || orgCard?.kpp) ? (
              <div style={REQS_LINE}>
                {orgCard?.inn ? (<><span style={{ color: "#666" }}>{labels.org.inn}: </span><span style={{ fontWeight: 500 }}>{orgCard.inn}</span></>) : null}
                {orgCard?.inn && orgCard?.kpp ? <span style={{ color: "#666" }}>{"  "}</span> : null}
                {orgCard?.kpp ? (<><span style={{ color: "#666" }}>{labels.org.kpp}: </span><span style={{ fontWeight: 500 }}>{orgCard.kpp}</span></>) : null}
              </div>
            ) : null}
            {orgCard?.ogrn ? reqsLine(labels.org.ogrn, orgCard.ogrn, labels.placeholder) : null}
            {reqsLine(labels.org.legalAddress, orgCard?.legalAddress, labels.placeholder)}
            {orgCard?.postalAddress && orgCard.postalAddress !== orgCard.legalAddress
              ? reqsLine(labels.org.postalAddress, orgCard.postalAddress, labels.placeholder)
              : null}
            {orgCard?.bankName ? reqsLine(labels.org.bank, orgCard.bankName, labels.placeholder) : null}
            {orgCard?.bankAccount ? reqsLine(labels.org.bankAccount, orgCard.bankAccount, labels.placeholder) : null}
            {orgCard?.correspondentAccount ? reqsLine(labels.org.correspondentAccount, orgCard.correspondentAccount, labels.placeholder) : null}
            {orgCard?.bik ? reqsLine(labels.org.bik, orgCard.bik, labels.placeholder) : null}
            {orgCard?.phone ? reqsLine(labels.org.phone, orgCard.phone, labels.placeholder) : null}
            {orgCard?.email ? reqsLine(labels.org.email, orgCard.email, labels.placeholder) : null}
            {reqsLine(
              labels.org.signatory,
              [orgCard?.signatoryPosition, orgCard?.signatoryName].filter(Boolean).join(", ") || undefined,
              labels.placeholder,
            )}
          </div>
          <div style={REQS_CELL_RIGHT}>
            <div style={REQS_HEADING}>{labels.customer}</div>
            {reqsLine(labels.client.name, clientInfo?.name, labels.placeholder)}
            {clientInfo?.inn ? reqsLine(labels.client.inn, clientInfo.inn, labels.placeholder) : null}
            {clientInfo?.address ? reqsLine(labels.client.address, clientInfo.address, labels.placeholder) : null}
            {clientInfo?.phone ? reqsLine(labels.client.phone, clientInfo.phone, labels.placeholder) : null}
            {clientInfo?.email ? reqsLine(labels.client.email, clientInfo.email, labels.placeholder) : null}
          </div>
        </div>
      ) : null}

      {payload.stages.map((stage) => (
        <div key={stage.id} style={{ marginTop: "8px" }}>
          <div style={STAGE_HEADER}>
            {labels.stageWordSingular} {stage.number}. {stage.title}
          </div>
          {stage.works.map((work) => (
            <div key={work.id}>
              <div style={WORK_HEADER}>
                {labels.workWordSingular} {work.number}. {work.title}
              </div>
              <table style={TABLE}>
                <colgroup>
                  {columns.map((c) => (
                    <col key={c.key} style={c.widthPct ? { width: `${c.widthPct}%` } : undefined} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c.key} style={c.right ? TH_RIGHT : TH}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {work.lines.map((line, idx) => (
                    <tr key={line.id}>
                      {columns.map((c) => {
                        let content: string;
                        switch (c.key) {
                          case "no": content = String(idx + 1); break;
                          case "title": content = line.title; break;
                          case "type": content = line.typeLabel; break;
                          case "qty": content = formatLineQty(line); break;
                          case "unit": content = line.unit; break;
                          case "costUnit": content = formatExportMoney(line.costUnitCents, payload.currency); break;
                          case "costTotal": content = formatExportMoney(line.costTotalCents, payload.currency); break;
                          case "markup": content = formatExportPercent(line.markupBps); break;
                          case "discount": content = formatExportPercent(line.discountBps); break;
                          case "unitPrice": content = formatExportMoney(line.clientUnitCents, payload.currency); break;
                          case "total": content = formatExportMoney(line.clientTotalCents, payload.currency); break;
                          case "discountedTotal":
                            content = line.discountedClientTotalCents != null
                              ? formatExportMoney(line.discountedClientTotalCents, payload.currency)
                              : "—";
                            break;
                          default: content = "";
                        }
                        return <td key={c.key} style={c.right ? TD_RIGHT : TD}>{content}</td>;
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={columns.length - 1} style={TD_SUBTOTAL}>
                      {labels.workSubtotal}
                    </td>
                    <td style={TD_SUBTOTAL}>
                      {formatExportMoney(
                        work.lines.reduce((acc, l) => acc + l.clientTotalCents, 0),
                        payload.currency,
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
          <div style={{
            background: "#ececec",
            borderLeft: "1px solid #c5c5c5",
            borderRight: "1px solid #c5c5c5",
            borderBottom: "1px solid #c5c5c5",
            padding: "6px 8px",
            fontWeight: 700,
            textAlign: "right",
          }}>
            {labels.stageSubtotal}: {formatExportMoney(
              stage.works.reduce(
                (acc, w) => acc + w.lines.reduce((a, l) => a + l.clientTotalCents, 0),
                0,
              ),
              payload.currency,
            )}
          </div>
        </div>
      ))}

      <div style={TOTALS_WRAP}>
        <table style={TOTALS_TABLE}>
          <tbody>
            {showCost ? (
              <>
                <tr>
                  <td style={TOTAL_ROW_LABEL}>{labels.totals.subtotal}</td>
                  <td style={TOTAL_ROW_VALUE}>{formatExportMoney(payload.totals.subtotalBeforeDiscountCents, payload.currency)}</td>
                </tr>
                <tr>
                  <td style={TOTAL_ROW_LABEL}>{labels.totals.discount}</td>
                  <td style={TOTAL_ROW_VALUE}>{formatExportMoney(payload.totals.discountTotalCents, payload.currency)}</td>
                </tr>
                <tr>
                  <td style={TOTAL_ROW_LABEL}>{labels.totals.taxableBase}</td>
                  <td style={TOTAL_ROW_VALUE}>{formatExportMoney(payload.totals.taxableBaseCents, payload.currency)}</td>
                </tr>
              </>
            ) : null}
            <tr>
              <td style={TOTAL_ROW_LABEL}>
                {labels.totals.vat} ({formatExportPercent(payload.totals.vatBps)})
              </td>
              <td style={TOTAL_ROW_VALUE}>{formatExportMoney(payload.totals.taxAmountCents, payload.currency)}</td>
            </tr>
            <tr>
              <td style={TOTAL_GRAND_LABEL}>{labels.totals.totalIncVat}</td>
              <td style={TOTAL_GRAND_VALUE}>{formatExportMoney(payload.totals.totalIncVatCents, payload.currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {showSignatures ? (
        <div style={SIGNATURES_WRAP}>
          <div style={SIGN_BLOCK}>
            <div style={{ fontWeight: 600, marginBottom: "16px" }}>{labels.signatures.contractor}</div>
            <div style={SIGN_LINE} />
            <div style={SIGN_NAME_HINT}>
              {orgCard?.signatoryName?.trim()
                ? `/ ${orgCard.signatoryName} /`
                : labels.signatures.nameHint}
            </div>
            <div style={{ marginTop: "18px", fontSize: "9pt" }}>{labels.signatures.date}: __.__.____</div>
          </div>
          <div style={SIGN_BLOCK}>
            <div style={{ fontWeight: 600, marginBottom: "16px" }}>{labels.signatures.customer}</div>
            <div style={SIGN_LINE} />
            <div style={SIGN_NAME_HINT}>
              {clientInfo?.signatoryName?.trim() || clientInfo?.name?.trim()
                ? `/ ${clientInfo.signatoryName?.trim() || clientInfo.name} /`
                : labels.signatures.nameHint}
            </div>
            <div style={{ marginTop: "18px", fontSize: "9pt" }}>{labels.signatures.date}: __.__.____</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildPrintResetCss(orientation: DocumentOrientation): string {
  return `
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    @page { size: A4 ${orientation}; margin: 0; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

export function renderEstimateDocumentToHtml(
  props: EstimateDocumentProps,
  documentTitle: string,
): string {
  const orientation = props.orientation ?? getOrientationForVariant(props.variant);
  const body = renderToStaticMarkup(<EstimateDocument {...props} orientation={orientation} />);
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8" /><title>${escapeHtml(documentTitle)}</title><style>${buildPrintResetCss(orientation)}</style></head><body>${body}</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
