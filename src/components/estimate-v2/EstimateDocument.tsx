import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClientInfo, OrgCard } from "@/types/org-card";
import {
  type ExportLineRow,
  type ExportPayload,
  type ExportVariant,
  type ExportWorkGroup,
  formatExportDate,
  formatExportMoney,
  formatExportPercent,
  formatExportQty,
  variantShowsCost,
  variantShowsRequisites,
  variantShowsSignatures,
} from "@/lib/estimate-export-data";
import {
  type BlockMeasure,
  type PageGeometry,
  type PageOrientation,
  getPageGeometry,
  paginateBlocks,
} from "@/components/estimate-v2/estimate-pagination";

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

export type DocumentOrientation = PageOrientation;

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

/**
 * Base text styling shared by the on-screen measuring pass, the visible sheets
 * and the print document, so measured heights match what is rendered.
 */
const BASE_TEXT: CSSProperties = {
  fontFamily:
    "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, 'PT Sans', 'Liberation Sans', sans-serif",
  fontSize: "10pt",
  lineHeight: 1.4,
  color: "#1a1a1a",
};

const HEADER: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  borderBottom: "2px solid #1a1a1a",
  paddingBottom: "8px",
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

const STAGE_SUBTOTAL: CSSProperties = {
  background: "#ececec",
  borderLeft: "1px solid #c5c5c5",
  borderRight: "1px solid #c5c5c5",
  borderBottom: "1px solid #c5c5c5",
  padding: "6px 8px",
  fontWeight: 700,
  textAlign: "right",
};

// Fixed table layout keeps every work's columns at identical widths, so the
// whole document lines up column-under-column like the Excel original instead
// of each table sizing its own columns to its content.
const TABLE: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  fontSize: "9pt",
};

const TH: CSSProperties = {
  background: "#ececec",
  border: "1px solid #c5c5c5",
  padding: "4px 6px",
  fontWeight: 600,
  textAlign: "left",
  fontSize: "8.5pt",
  overflowWrap: "anywhere",
};

const TH_RIGHT: CSSProperties = { ...TH, textAlign: "right" };

const TD: CSSProperties = {
  border: "1px solid #c5c5c5",
  padding: "4px 6px",
  verticalAlign: "top",
  overflowWrap: "anywhere",
};

const TD_RIGHT: CSSProperties = {
  ...TD,
  textAlign: "right",
  whiteSpace: "nowrap",
  padding: "4px 5px",
};

const TD_SUBTOTAL: CSSProperties = {
  ...TD,
  background: "#fafafa",
  fontWeight: 600,
  textAlign: "right",
};

const TOTALS_WRAP: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
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
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "32px",
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

interface DocColumn {
  key: string;
  label: string;
  right?: boolean;
  widthPct?: number;
}

// Consistent column widths (percent of table width) shared by every work so the
// fixed-layout tables align. The title column is intentionally width-less and
// soaks up the remaining space.
const COL_WIDTH_PCT: Record<string, number> = {
  no: 5,
  type: 8,
  qty: 8,
  unit: 7,
  costUnit: 11,
  costTotal: 11,
  markup: 7,
  discount: 7,
  unitPrice: 12,
  total: 12,
  discountedTotal: 12,
};

function buildColumns(
  payload: ExportPayload,
  variant: ExportVariant,
  labels: EstimateDocumentLabels,
): DocColumn[] {
  const showCost = variantShowsCost(variant);
  const includeMarkup = showCost && payload.projectMode === "contractor";
  const columns: DocColumn[] = [];
  const push = (key: string, label: string, right = false) =>
    columns.push({ key, label, right, widthPct: COL_WIDTH_PCT[key] });

  push("no", labels.col.number);
  columns.push({ key: "title", label: labels.col.title });
  if (showCost) push("type", labels.col.type);
  push("qty", labels.col.qty, true);
  push("unit", labels.col.unit);
  if (showCost) {
    push("costUnit", labels.col.costUnit, true);
    push("costTotal", labels.col.costTotal, true);
    if (includeMarkup) push("markup", labels.col.markup, true);
    push("discount", labels.col.discount, true);
  }
  push("unitPrice", labels.col.unitPrice, true);
  push("total", labels.col.total, true);
  if (!showCost && payload.hasDiscountedClientTotal) {
    push("discountedTotal", labels.col.discountedTotal, true);
  }
  return columns;
}

function lineCellContent(
  line: ExportLineRow,
  idx: number,
  columnKey: string,
  payload: ExportPayload,
): string {
  switch (columnKey) {
    case "no":
      return String(idx + 1);
    case "title":
      return line.title;
    case "type":
      return line.typeLabel;
    case "qty":
      return formatExportQty(line.qtyMilli);
    case "unit":
      return line.unit;
    case "costUnit":
      return formatExportMoney(line.costUnitCents, payload.currency);
    case "costTotal":
      return formatExportMoney(line.costTotalCents, payload.currency);
    case "markup":
      return formatExportPercent(line.markupBps);
    case "discount":
      return formatExportPercent(line.discountBps);
    case "unitPrice":
      return formatExportMoney(line.clientUnitCents, payload.currency);
    case "total":
      return formatExportMoney(line.clientTotalCents, payload.currency);
    case "discountedTotal":
      return line.discountedClientTotalCents != null
        ? formatExportMoney(line.discountedClientTotalCents, payload.currency)
        : "—";
    default:
      return "";
  }
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

function renderWorkNode(
  work: ExportWorkGroup,
  columns: DocColumn[],
  payload: ExportPayload,
  labels: EstimateDocumentLabels,
): ReactNode {
  return (
    <div>
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
              {columns.map((c) => (
                <td key={c.key} style={c.right ? TD_RIGHT : TD}>
                  {lineCellContent(line, idx, c.key, payload)}
                </td>
              ))}
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
  );
}

export type DocBlockKind =
  | "header"
  | "requisites"
  | "stageHeader"
  | "work"
  | "stageSubtotal"
  | "totals"
  | "signatures";

export interface DocBlock {
  id: string;
  kind: DocBlockKind;
  /** Space above this block when it is not first on a page. */
  gapBefore: number;
  keepWithNext?: boolean;
  node: ReactNode;
}

/**
 * Flatten the estimate into independently page-able blocks. The visible sheets,
 * the measuring pass and the print document all consume the same list, so what
 * the user previews is exactly what prints.
 */
export function buildEstimateBlocks(props: EstimateDocumentProps): DocBlock[] {
  const { payload, variant, orgCard, clientInfo, labels } = props;
  const showCost = variantShowsCost(variant);
  const showRequisites = variantShowsRequisites(variant);
  const showSignatures = variantShowsSignatures(variant);
  const columns = buildColumns(payload, variant, labels);
  const blocks: DocBlock[] = [];

  blocks.push({
    id: "header",
    kind: "header",
    gapBefore: 0,
    node: (
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
    ),
  });

  if (showRequisites) {
    blocks.push({
      id: "requisites",
      kind: "requisites",
      gapBefore: 14,
      node: (
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
      ),
    });
  }

  payload.stages.forEach((stage) => {
    blocks.push({
      id: `stage-${stage.id}`,
      kind: "stageHeader",
      gapBefore: 12,
      keepWithNext: true,
      node: (
        <div style={STAGE_HEADER}>
          {labels.stageWordSingular} {stage.number}. {stage.title}
        </div>
      ),
    });

    stage.works.forEach((work) => {
      blocks.push({
        id: `work-${work.id}`,
        kind: "work",
        gapBefore: 0,
        node: renderWorkNode(work, columns, payload, labels),
      });
    });

    blocks.push({
      id: `stage-subtotal-${stage.id}`,
      kind: "stageSubtotal",
      gapBefore: 0,
      node: (
        <div style={STAGE_SUBTOTAL}>
          {labels.stageSubtotal}: {formatExportMoney(
            stage.works.reduce(
              (acc, w) => acc + w.lines.reduce((a, l) => a + l.clientTotalCents, 0),
              0,
            ),
            payload.currency,
          )}
        </div>
      ),
    });
  });

  blocks.push({
    id: "totals",
    kind: "totals",
    gapBefore: 16,
    node: (
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
    ),
  });

  if (showSignatures) {
    blocks.push({
      id: "signatures",
      kind: "signatures",
      gapBefore: 28,
      node: (
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
      ),
    });
  }

  return blocks;
}

/**
 * Continuous (non-paginated) render of the whole document. Kept for any caller
 * that wants a single flowing page; the export preview uses the paginated view.
 */
export function EstimateDocument(props: EstimateDocumentProps) {
  const orientation = props.orientation ?? getOrientationForVariant(props.variant);
  const geom = getPageGeometry(orientation);
  const blocks = buildEstimateBlocks(props);
  return (
    <div
      style={{
        ...BASE_TEXT,
        background: "#ffffff",
        padding: `${geom.marginYMm}mm ${geom.marginXMm}mm`,
        boxSizing: "border-box",
        width: `${geom.pageWidthMm}mm`,
        minHeight: `${geom.pageHeightMm}mm`,
        margin: "0 auto",
      }}
    >
      {blocks.map((b, i) => (
        <div key={b.id} style={{ marginTop: i === 0 ? 0 : b.gapBefore }}>
          {b.node}
        </div>
      ))}
    </div>
  );
}

function Sheet({ geom, children }: { geom: PageGeometry; children: ReactNode }) {
  return (
    <div
      className="est-sheet"
      style={{
        ...BASE_TEXT,
        width: `${geom.pageWidthMm}mm`,
        minHeight: `${geom.pageHeightMm}mm`,
        padding: `${geom.marginYMm}mm ${geom.marginXMm}mm`,
        boxSizing: "border-box",
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
        borderRadius: "2px",
      }}
    >
      {children}
    </div>
  );
}

function PageBlocks({ ids, blockMap }: { ids: string[]; blockMap: Map<string, DocBlock> }) {
  return (
    <>
      {ids.map((id, i) => {
        const b = blockMap.get(id);
        if (!b) return null;
        return (
          <div key={`${id}-${i}`} style={{ marginTop: i === 0 ? 0 : b.gapBefore }}>
            {b.node}
          </div>
        );
      })}
    </>
  );
}

interface PaginatedEstimateDocumentProps extends EstimateDocumentProps {
  /** Display scale of the sheets (1 = 100%). */
  zoom?: number;
  /** Reports the computed page layout (block ids per page) to the parent. */
  onPagesChange?: (pages: string[][]) => void;
}

/**
 * Renders the estimate as discrete A4 sheets. A hidden pass measures every block
 * at the real content width, then `paginateBlocks` packs them onto pages.
 */
export function PaginatedEstimateDocument({
  payload,
  variant,
  orgCard,
  clientInfo,
  labels,
  orientation: orientationProp,
  zoom = 1,
  onPagesChange,
}: PaginatedEstimateDocumentProps) {
  const orientation = orientationProp ?? getOrientationForVariant(variant);
  const geom = useMemo(() => getPageGeometry(orientation), [orientation]);
  // Depend on the concrete fields (not a spread object that changes identity
  // every render) so blocks/heights stay stable and don't loop the measure pass.
  const blocks = useMemo(
    () => buildEstimateBlocks({ payload, variant, orgCard, clientInfo, labels, orientation }),
    [payload, variant, orgCard, clientInfo, labels, orientation],
  );
  const blockMap = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  const allBlockIds = useMemo(() => blocks.map((b) => b.id), [blocks]);

  const measureRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Record<string, number> | null>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      const root = measureRef.current;
      if (cancelled || !root) return;
      const map: Record<string, number> = {};
      root.querySelectorAll<HTMLElement>("[data-bid]").forEach((el) => {
        const id = el.dataset.bid;
        if (id) map[id] = el.getBoundingClientRect().height;
      });
      setHeights(map);
    };
    measure();
    // Font swaps shift text metrics; re-measure once webfonts settle.
    const fonts = document.fonts;
    if (fonts && fonts.status !== "loaded") {
      fonts.ready.then(() => measure()).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [blocks, geom.contentWidthPx]);

  const pages = useMemo(() => {
    if (!heights) return [allBlockIds];
    const measures: BlockMeasure[] = blocks.map((b) => ({
      id: b.id,
      height: heights[b.id] ?? 0,
      gapBefore: b.gapBefore,
      keepWithNext: b.keepWithNext,
    }));
    return paginateBlocks(measures, { pageContentHeightPx: geom.contentHeightPx, safetyPx: 2 });
  }, [heights, blocks, allBlockIds, geom.contentHeightPx]);

  useEffect(() => {
    onPagesChange?.(pages);
  }, [pages, onPagesChange]);

  return (
    <>
      {/* Hidden measuring pass at the true content width. */}
      <div
        ref={measureRef}
        aria-hidden
        style={{
          ...BASE_TEXT,
          position: "absolute",
          visibility: "hidden",
          pointerEvents: "none",
          left: "-100000px",
          top: 0,
          width: `${geom.contentWidthMm}mm`,
        }}
      >
        {blocks.map((b) => (
          <div key={b.id} data-bid={b.id}>
            {b.node}
          </div>
        ))}
      </div>

      {/* `zoom` (not transform) so the scaled sheets reflow the scroll area and
          stay centered without phantom scrollbars. */}
      <div style={{ zoom, width: "fit-content", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "20px",
          }}
        >
          {pages.map((ids, pi) => (
            <Sheet key={pi} geom={geom}>
              <PageBlocks ids={ids} blockMap={blockMap} />
            </Sheet>
          ))}
        </div>
      </div>
    </>
  );
}

// Load the same Inter webfont the app uses (src/index.css). The print iframe is
// a separate document and would otherwise render in a fallback face, breaking
// the pagination that was measured against Inter. Weights mirror index.css so
// the browser serves the already-cached font with no extra round trip.
const PRINT_FONT_LINKS =
  '<link rel="preconnect" href="https://fonts.googleapis.com" />' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" />';

function buildPrintResetCss(geom: PageGeometry, orientation: DocumentOrientation): string {
  return `
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    @page { size: A4 ${orientation}; margin: ${geom.marginYMm}mm ${geom.marginXMm}mm; }
    .est-sheet-print { break-after: page; }
    .est-sheet-print:last-child { break-after: auto; }
    .est-block { break-inside: avoid; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

function PrintBody({
  blocks,
  pages,
}: {
  blocks: DocBlock[];
  pages: string[][];
}) {
  const blockMap = new Map(blocks.map((b) => [b.id, b]));
  return (
    <div style={BASE_TEXT}>
      {pages.map((ids, pi) => (
        <div key={pi} className="est-sheet-print">
          {ids.map((id, i) => {
            const b = blockMap.get(id);
            if (!b) return null;
            return (
              <div
                key={`${id}-${i}`}
                className="est-block"
                style={{ marginTop: i === 0 ? 0 : b.gapBefore }}
              >
                {b.node}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * A supplied page layout is only usable if it partitions the current blocks
 * exactly — every block present once, no phantom ids. A layout computed for a
 * different variant/estimate (stale ref during a fast variant switch) would
 * otherwise drop or misplace content, so we reject it and fall back.
 */
function pageLayoutMatchesBlocks(pages: string[][] | null, blockIds: string[]): boolean {
  if (!pages || pages.length === 0) return false;
  const flat = pages.flat();
  if (flat.length !== blockIds.length) return false;
  const wanted = new Set(blockIds);
  const seen = new Set<string>();
  for (const id of flat) {
    if (!wanted.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return seen.size === blockIds.length;
}

/**
 * Print/PDF document built from an explicit page layout (the same one the
 * preview computed), so the printed pages match the on-screen sheets. When no
 * valid layout is supplied, falls back to a single flowing page the browser
 * paginates (blocks stay intact via `break-inside: avoid`).
 */
export function renderEstimatePagesToHtml(
  props: EstimateDocumentProps,
  pages: string[][] | null,
  documentTitle: string,
): string {
  const orientation = props.orientation ?? getOrientationForVariant(props.variant);
  const geom = getPageGeometry(orientation);
  const blocks = buildEstimateBlocks(props);
  const allIds = blocks.map((b) => b.id);
  const effectivePages = pageLayoutMatchesBlocks(pages, allIds) ? (pages as string[][]) : [allIds];
  const body = renderToStaticMarkup(<PrintBody blocks={blocks} pages={effectivePages} />);
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8" />${PRINT_FONT_LINKS}<title>${escapeHtml(documentTitle)}</title><style>${buildPrintResetCss(geom, orientation)}</style></head><body>${body}</body></html>`;
}

/**
 * Backwards-compatible single-page renderer. Prefer `renderEstimatePagesToHtml`
 * with the preview's computed pages for WYSIWYG output.
 */
export function renderEstimateDocumentToHtml(
  props: EstimateDocumentProps,
  documentTitle: string,
): string {
  return renderEstimatePagesToHtml(props, null, documentTitle);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
