import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, FileDown, FileText, Info, Loader2, Printer, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  type ExportPayload,
  type ExportVariant,
  variantCanShare,
  variantShowsRequisites,
} from "@/lib/estimate-export-data";
import { printHtmlDocument } from "@/lib/print-html";
import {
  EstimateDocument,
  getOrientationForVariant,
  renderEstimateDocumentToHtml,
  type EstimateDocumentLabels,
} from "@/components/estimate-v2/EstimateDocument";
import { EstimateExportForm } from "@/components/estimate-v2/EstimateExportForm";
import { useClientInfo, useOrgCard, useSetClientInfo, useSetOrgCard } from "@/hooks/use-org-card";
import { useActiveOrg } from "@/hooks/use-orgs";
import {
  type ClientInfo,
  type OrgCard,
  EMPTY_CLIENT_INFO,
  EMPTY_ORG_CARD,
  orgCardHasRequiredFields,
  clientInfoHasRequiredFields,
} from "@/types/org-card";

export type EnsureShareLinkResult = { url: string } | { error: string };

interface EstimateExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: ExportPayload | null;
  canShowInternal: boolean;
  onDownloadCsv: () => void;
  /**
   * Resolves to a public `/share/estimate/:shareId` URL for the current estimate.
   * Implementations reuse the latest submitted version's shareId when present,
   * otherwise create a fresh proposed version (preview-only) to generate one.
   */
  onEnsureShareLink: () => Promise<EnsureShareLinkResult>;
}

function useDocumentLabels(): EstimateDocumentLabels {
  const { t } = useTranslation();
  return useMemo<EstimateDocumentLabels>(
    () => ({
      title: t("estimate.export.document.title"),
      project: t("estimate.export.document.project"),
      generated: t("estimate.export.document.generated"),
      contractor: t("estimate.export.document.contractor"),
      customer: t("estimate.export.document.customer"),
      org: {
        legalName: t("estimate.export.org.legalName"),
        inn: t("estimate.export.org.inn"),
        kpp: t("estimate.export.org.kpp"),
        ogrn: t("estimate.export.org.ogrn"),
        legalAddress: t("estimate.export.org.legalAddress"),
        postalAddress: t("estimate.export.org.postalAddress"),
        bank: t("estimate.export.org.bank"),
        bankAccount: t("estimate.export.org.bankAccount"),
        correspondentAccount: t("estimate.export.org.correspondentAccount"),
        bik: t("estimate.export.org.bik"),
        phone: t("estimate.export.org.phone"),
        email: t("estimate.export.org.email"),
        signatory: t("estimate.export.org.signatory"),
      },
      client: {
        name: t("estimate.export.client.name"),
        inn: t("estimate.export.client.inn"),
        address: t("estimate.export.client.address"),
        phone: t("estimate.export.client.phone"),
        email: t("estimate.export.client.email"),
      },
      col: {
        number: t("estimate.export.col.number"),
        title: t("estimate.export.col.title"),
        type: t("estimate.export.col.type"),
        qty: t("estimate.export.col.qty"),
        unit: t("estimate.export.col.unit"),
        costUnit: t("estimate.export.col.costUnit"),
        costTotal: t("estimate.export.col.costTotal"),
        markup: t("estimate.export.col.markup"),
        discount: t("estimate.export.col.discount"),
        unitPrice: t("estimate.export.col.unitPrice"),
        total: t("estimate.export.col.total"),
        discountedTotal: t("estimate.export.col.discountedTotal"),
      },
      stageWordSingular: t("estimate.export.document.stage"),
      workWordSingular: t("estimate.export.document.work"),
      stageSubtotal: t("estimate.export.document.stageSubtotal"),
      workSubtotal: t("estimate.export.document.workSubtotal"),
      totals: {
        subtotal: t("estimate.export.totals.subtotal"),
        discount: t("estimate.export.totals.discount"),
        taxableBase: t("estimate.export.totals.taxableBase"),
        vat: t("estimate.export.totals.vat"),
        totalIncVat: t("estimate.export.totals.totalIncVat"),
      },
      signatures: {
        contractor: t("estimate.export.signatures.contractor"),
        customer: t("estimate.export.signatures.customer"),
        date: t("estimate.export.signatures.date"),
        nameHint: t("estimate.export.signatures.nameHint"),
      },
      resourceType: {},
      placeholder: t("estimate.export.document.placeholder"),
    }),
    [t],
  );
}

export function EstimateExportModal({
  open,
  onOpenChange,
  payload,
  canShowInternal,
  onDownloadCsv,
  onEnsureShareLink,
}: EstimateExportModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const labels = useDocumentLabels();
  const activeOrg = useActiveOrg();
  const orgId = activeOrg?.id ?? null;
  const projectId = payload?.projectId ?? null;
  // When the user has no active org, fall back to a project-scoped local key
  // so signing details still persist on this device. The banner in the modal
  // tells the user this is what will happen.
  const effectiveOrgKey = orgId ?? (projectId ? `local:${projectId}` : null);

  const orgCardQuery = useOrgCard(effectiveOrgKey);
  const clientInfoQuery = useClientInfo(projectId);
  const setOrgCardMutation = useSetOrgCard();
  const setClientInfoMutation = useSetClientInfo();

  const [variant, setVariant] = useState<ExportVariant>("client_simple");
  const [orgCardDraft, setOrgCardDraft] = useState<OrgCard>(EMPTY_ORG_CARD);
  const [clientInfoDraft, setClientInfoDraft] = useState<ClientInfo>(EMPTY_CLIENT_INFO);
  const [shareState, setShareState] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "ready"; url: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  useEffect(() => {
    if (!open) return;
    setOrgCardDraft(orgCardQuery.data ?? EMPTY_ORG_CARD);
  }, [open, orgCardQuery.data]);

  useEffect(() => {
    if (!open) return;
    setClientInfoDraft(clientInfoQuery.data ?? EMPTY_CLIENT_INFO);
  }, [open, clientInfoQuery.data]);

  useEffect(() => {
    if (!open) return;
    if (!canShowInternal && variant === "internal") {
      setVariant("client_simple");
    }
  }, [open, canShowInternal, variant]);

  useEffect(() => {
    if (!open) {
      setShareState({ phase: "idle" });
    }
  }, [open]);

  useEffect(() => {
    setShareState((current) => (current.phase === "idle" ? current : { phase: "idle" }));
  }, [variant]);

  if (!payload) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("estimate.export.modal.title")}</DialogTitle>
            <DialogDescription>{t("estimate.export.modal.loading")}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const showRequisites = variantShowsRequisites(variant);
  const variantSupportsShare = variantCanShare(variant);
  const orientation = getOrientationForVariant(variant);
  const previewWidthMm = orientation === "landscape" ? "297mm" : "210mm";
  const previewScale = orientation === "landscape" ? 0.5 : 0.7;

  const signingReady =
    variant !== "client_signing"
    || (orgCardHasRequiredFields(orgCardDraft) && clientInfoHasRequiredFields(clientInfoDraft));

  const persistSigningDraft = async () => {
    if (variant !== "client_signing") return;
    const tasks: Promise<unknown>[] = [];
    if (effectiveOrgKey) {
      tasks.push(setOrgCardMutation.mutateAsync({ orgId: effectiveOrgKey, card: orgCardDraft }));
    }
    if (projectId) {
      tasks.push(setClientInfoMutation.mutateAsync({ projectId, info: clientInfoDraft }));
    }
    await Promise.all(tasks);
  };

  const triggerPrintFlow = async (mode: "print" | "pdf") => {
    if (!signingReady) {
      toast({
        title: t("estimate.export.toast.fillRequired"),
        variant: "destructive",
      });
      return;
    }
    await persistSigningDraft();
    const html = renderEstimateDocumentToHtml(
      {
        payload,
        variant,
        orgCard: variant === "client_signing" ? orgCardDraft : null,
        clientInfo: variant === "client_signing" ? clientInfoDraft : null,
        labels,
        orientation,
      },
      `${labels.title} – ${payload.projectTitle}`,
    );
    if (mode === "pdf") {
      toast({
        title: t("estimate.export.toast.downloadPdfHint.title"),
        description: t("estimate.export.toast.downloadPdfHint.description"),
      });
    }
    printHtmlDocument(html, { titleForDownload: payload.projectTitle });
  };

  const handlePrint = () => { void triggerPrintFlow("print"); };
  const handleDownloadPdf = () => { void triggerPrintFlow("pdf"); };

  const handleShare = async () => {
    setShareState({ phase: "loading" });
    try {
      const result = await onEnsureShareLink();
      if ("error" in result) {
        setShareState({ phase: "error", message: result.error });
        return;
      }
      setShareState({ phase: "ready", url: result.url });
      try {
        await navigator.clipboard.writeText(result.url);
        toast({
          title: t("estimate.export.toast.linkCopied"),
          description: t("estimate.export.share.warning"),
        });
      } catch {
        // clipboard failure is non-fatal — link is still visible in the share panel.
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setShareState({ phase: "error", message });
    }
  };

  const handleCopyFromPanel = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t("estimate.export.toast.linkCopied") });
    } catch {
      toast({
        title: t("estimate.export.toast.linkCopyFailed"),
        description: url,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{t("estimate.export.modal.title")}</DialogTitle>
          <DialogDescription>{t("estimate.export.modal.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(320px,420px)_1fr]">
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto border-b border-border p-5 lg:border-b-0 lg:border-r">
            <div>
              <div className="mb-2 text-sm font-semibold">{t("estimate.export.variant.label")}</div>
              <RadioGroup
                value={variant}
                onValueChange={(value) => setVariant(value as ExportVariant)}
                className="gap-2"
              >
                <VariantOption
                  value="client_simple"
                  title={t("estimate.export.variant.clientSimple.title")}
                  description={t("estimate.export.variant.clientSimple.description")}
                />
                <VariantOption
                  value="client_signing"
                  title={t("estimate.export.variant.clientSigning.title")}
                  description={t("estimate.export.variant.clientSigning.description")}
                />
                <VariantOption
                  value="internal"
                  title={t("estimate.export.variant.internal.title")}
                  description={
                    canShowInternal
                      ? t("estimate.export.variant.internal.description")
                      : t("estimate.export.variant.internal.disabledReason")
                  }
                  disabled={!canShowInternal}
                />
              </RadioGroup>
            </div>

            {showRequisites ? (
              <EstimateExportForm
                orgCard={orgCardDraft}
                onOrgCardChange={setOrgCardDraft}
                clientInfo={clientInfoDraft}
                onClientInfoChange={setClientInfoDraft}
              />
            ) : null}

            {variantSupportsShare ? (
              <SharePanel
                state={shareState}
                onCopy={handleCopyFromPanel}
                onDismiss={() => setShareState({ phase: "idle" })}
                onRetry={handleShare}
              />
            ) : null}
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden bg-muted/30">
            <div className="border-b border-border bg-background px-4 py-2 text-caption text-muted-foreground">
              {t("estimate.export.preview.label")}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div
                className="origin-top-left shadow-md"
                style={{
                  width: previewWidthMm,
                  transform: `scale(${previewScale})`,
                  transformOrigin: "top left",
                }}
              >
                <EstimateDocument
                  payload={payload}
                  variant={variant}
                  orgCard={variant === "client_signing" ? orgCardDraft : null}
                  clientInfo={variant === "client_signing" ? clientInfoDraft : null}
                  labels={labels}
                  orientation={orientation}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-warning text-warning-foreground hover:bg-warning/90"
          >
            <X className="mr-1.5 h-4 w-4" />
            {t("common.close")}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {variant === "internal" && canShowInternal ? (
              <Button variant="outline" onClick={onDownloadCsv}>
                <FileDown className="mr-1.5 h-4 w-4" />
                {t("estimate.export.actions.downloadCsv")}
              </Button>
            ) : null}
            <Button variant="outline" onClick={handleDownloadPdf} disabled={!signingReady}>
              <FileText className="mr-1.5 h-4 w-4" />
              {t("estimate.export.actions.downloadPdf")}
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={!signingReady}>
              <Printer className="mr-1.5 h-4 w-4" />
              {t("estimate.export.actions.print")}
            </Button>
            {variantSupportsShare ? (
              <Button
                variant="outline"
                onClick={handleShare}
                disabled={shareState.phase === "loading"}
              >
                {shareState.phase === "loading"
                  ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  : <Share2 className="mr-1.5 h-4 w-4" />}
                {t("estimate.export.actions.share")}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
        {!signingReady ? (
          <div className="border-t border-border bg-warning/5 px-5 py-2 text-caption text-warning-foreground">
            {t("estimate.export.signing.missingRequired")}
          </div>
        ) : null}
        {variant === "client_signing" && !orgId ? (
          <div className="border-t border-border bg-info/5 px-5 py-2 text-caption text-info">
            <Info className="mr-1 inline h-3.5 w-3.5" />
            {t("estimate.export.signing.noActiveOrg")}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface VariantOptionProps {
  value: ExportVariant;
  title: string;
  description: string;
  disabled?: boolean;
}

function VariantOption({ value, title, description, disabled }: VariantOptionProps) {
  return (
    <Label
      htmlFor={`variant-${value}`}
      className={`flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background p-3 transition hover:border-accent/40 ${
        disabled ? "cursor-not-allowed opacity-50 hover:border-border" : ""
      }`}
    >
      <RadioGroupItem id={`variant-${value}`} value={value} disabled={disabled} className="mt-0.5" />
      <span className="flex flex-col">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-caption text-muted-foreground">{description}</span>
      </span>
    </Label>
  );
}

interface SharePanelProps {
  state:
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "ready"; url: string }
    | { phase: "error"; message: string };
  onCopy: (url: string) => void;
  onDismiss: () => void;
  onRetry: () => void;
}

function SharePanel({ state, onCopy, onDismiss, onRetry }: SharePanelProps) {
  const { t } = useTranslation();
  if (state.phase === "idle") return null;
  return (
    <div className="rounded-md border border-accent/30 bg-accent/5 p-3 text-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="font-semibold text-foreground">{t("estimate.export.share.panel.title")}</div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground"
          aria-label={t("common.close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mb-2 text-caption text-foreground">
        {t("estimate.export.share.warning")}
      </p>
      {state.phase === "loading" ? (
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("estimate.export.share.panel.busy")}
        </div>
      ) : null}
      {state.phase === "ready" ? (
        <div className="flex items-center gap-2">
          <Input readOnly value={state.url} className="font-mono text-xs" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onCopy(state.url)}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            {t("estimate.export.share.panel.copy")}
          </Button>
        </div>
      ) : null}
      {state.phase === "error" ? (
        <div className="space-y-2">
          <p className="text-caption text-destructive">{state.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {t("estimate.export.share.panel.retry")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
