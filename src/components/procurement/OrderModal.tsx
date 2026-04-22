import { useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarIcon, Loader2, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { createDraftOrder, placeOrder } from "@/data/order-store";
import { getOrdersSource } from "@/data/orders-source";
import { trackEvent } from "@/lib/analytics";
import { getStock } from "@/data/inventory-store";
import { useProcurementV2 } from "@/hooks/use-mock-data";
import { useLocations } from "@/hooks/use-inventory-data";
import { inventoryQueryKeys } from "@/hooks/use-inventory-data";
import {
  orderPlacedSupplierOrdersQueryRoot,
  orderProjectOrdersQueryRoot,
  orderQueryKeys,
  useOrders,
} from "@/hooks/use-order-data";
import { procurementProjectItemsQueryRoot } from "@/hooks/use-procurement-source";
import { computeRemainingRequestedQty, toInventoryKey } from "@/lib/procurement-fulfillment";
import { fmtCost } from "@/lib/procurement-utils";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { LocationPicker } from "@/components/procurement/LocationPicker";
import type { DraftOrderLineInput } from "@/data/order-store";
import type { OrderKind } from "@/types/entities";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { useEstimateV2Project } from "@/hooks/use-estimate-v2-data";

interface OrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  initialItemIds: string[];
  showSensitiveDetail?: boolean;
  onCompleted?: (orderId: string) => void;
}

interface DraftLineState {
  procurementItemId: string;
  qty: number;
  unit: string;
  plannedUnitPrice: number | null;
  actualUnitPrice: number | null;
}

function isValidActualUnitPrice(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Set true to show Save draft in the footer (draft-only flow is not in MVP). */
const SHOW_ORDER_SAVE_DRAFT_BUTTON = false;

export function OrderModal({
  open,
  onOpenChange,
  projectId,
  initialItemIds,
  showSensitiveDetail = true,
  onCompleted,
}: OrderModalProps) {
  const { t } = useTranslation();
  const baseItems = useProcurementV2(projectId);
  const orders = useOrders(projectId);
  const locations = useLocations(projectId);
  const workspaceMode = useWorkspaceMode();
  const supabaseMode = workspaceMode.kind === "supabase" ? workspaceMode : null;
  const isSupabaseMode = workspaceMode.kind === "supabase";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const estimateState = useEstimateV2Project(projectId);

  const items = useMemo(() => {
    const workById = new Map(estimateState.works.map((work) => [work.id, work]));
    const lineById = new Map(estimateState.lines.map((line) => [line.id, line]));

    const stageStartByStageId = new Map<string, string>();
    estimateState.works.forEach((work) => {
      if (!work.plannedStart) return;
      if (!work.stageId) return;
      const ts = new Date(work.plannedStart).getTime();
      if (!Number.isFinite(ts)) return;

      const existing = stageStartByStageId.get(work.stageId);
      if (!existing) {
        stageStartByStageId.set(work.stageId, work.plannedStart);
        return;
      }

      const existingTs = new Date(existing).getTime();
      if (Number.isFinite(existingTs) && ts < existingTs) {
        stageStartByStageId.set(work.stageId, work.plannedStart);
      }
    });

    const fallbackStageId = estimateState.stages[0]?.id ?? null;

    return baseItems.map((item) => {
      const lineId = item.sourceEstimateV2LineId ?? null;
      if (!lineId) return item;
      const line = lineById.get(lineId);
      if (!line) return item;

      const work = workById.get(line.workId) ?? null;
      const resolvedStageId = line.stageId || work?.stageId || fallbackStageId;
      if (!resolvedStageId) return item;

      const requiredByDate = work?.plannedStart ?? stageStartByStageId.get(resolvedStageId) ?? null;
      const derivedType = line.type === "tool" ? "tool" : "material";
      const requiredQty = Math.max(0, line.qtyMilli / 1_000);
      const plannedUnitPrice = Math.max(0, line.costUnitCents / 100);

      return {
        ...item,
        stageId: resolvedStageId,
        type: derivedType,
        name: line.title,
        unit: line.unit,
        requiredByDate,
        requiredQty,
        plannedUnitPrice,
      };
    });
  }, [baseItems, estimateState.lines, estimateState.works, estimateState.stages]);

  const [kind, setKind] = useState<OrderKind>("supplier");
  const [supplierName, setSupplierName] = useState("");
  const [deliverToLocationId, setDeliverToLocationId] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [deliveryDeadline, setDeliveryDeadline] = useState<Date | undefined>(undefined);
  const [invoiceAttachment, setInvoiceAttachment] = useState<{ name: string; url: string } | null>(null);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLineState[]>([]);
  const [orderActionInFlight, setOrderActionInFlight] = useState<null | "draft" | "place">(null);
  const orderActionInFlightRef = useRef<null | "draft" | "place">(null);

  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const defaultLocationId = useMemo(
    () => locations.find((location) => location.isDefault)?.id ?? locations[0]?.id ?? "",
    [locations],
  );

  useEffect(() => {
    if (!open) return;
    const nextItemIds = initialItemIds.length > 0
      ? initialItemIds
      : items.map((item) => item.id);

    const nextLines = nextItemIds
      .map((itemId) => {
        const item = itemById.get(itemId);
        if (!item) return null;
        const remaining = computeRemainingRequestedQty(item, orders);
        if (remaining <= 0) return null;
        return {
          procurementItemId: item.id,
          qty: remaining,
          unit: item.unit,
          plannedUnitPrice: item.plannedUnitPrice,
          actualUnitPrice: item.actualUnitPrice,
        } satisfies DraftLineState;
      })
      .filter((line): line is DraftLineState => !!line);

    setKind("supplier");
    setSupplierName("");
    setDeliverToLocationId(isSupabaseMode ? "" : defaultLocationId);
    setFromLocationId(defaultLocationId);
    setToLocationId(defaultLocationId);
    setDeliveryDeadline(undefined);
    setInvoiceAttachment(null);
    setNote("");
    setLines(nextLines);
  }, [open, initialItemIds, itemById, items, orders, defaultLocationId, isSupabaseMode]);

  const requestedRemainingByItemId = useMemo(() => (
    new Map(lines.map((line) => [line.procurementItemId, computeRemainingRequestedQty(itemById.get(line.procurementItemId), orders)]))
  ), [lines, itemById, orders]);

  const orderedLines = useMemo(() => lines.filter((line) => line.qty > 0), [lines]);
  const hasOrderedLines = orderedLines.length > 0;
  const allOrderedLinesHaveValidActualPrices = orderedLines.every((line) => isValidActualUnitPrice(line.actualUnitPrice));
  const canPlaceOrder = hasOrderedLines && allOrderedLinesHaveValidActualPrices;

  const saveOrder = async (action: "draft" | "place") => {
    if (orderActionInFlightRef.current) return;
    const positiveLines = lines.filter((line) => line.qty > 0);
    const payloadLines: DraftOrderLineInput[] = positiveLines.map((line) => ({
      procurementItemId: line.procurementItemId,
      qty: line.qty,
      unit: line.unit,
      plannedUnitPrice: line.plannedUnitPrice,
      actualUnitPrice: line.actualUnitPrice,
    }));

    if (payloadLines.length === 0) {
      toast({ title: t("procurement.orderModal.toast.noLines"), description: t("procurement.orderModal.toast.noLinesDesc"), variant: "destructive" });
      return;
    }
    if (action === "place" && !allOrderedLinesHaveValidActualPrices) {
      toast({ title: t("procurement.orderModal.toast.actualPriceRequired"), description: t("procurement.orderModal.toast.actualPriceRequiredDesc"), variant: "destructive" });
      return;
    }

    if (kind === "stock" && !fromLocationId) {
      toast({ title: t("procurement.orderModal.toast.fromRequired"), variant: "destructive" });
      return;
    }

    orderActionInFlightRef.current = action;
    setOrderActionInFlight(action);
    try {
    if (kind === "stock") {
      for (const line of payloadLines) {
        const item = itemById.get(line.procurementItemId);
        if (!item) continue;
        const available = getStock(projectId, fromLocationId, toInventoryKey(item));
        if (line.qty > available) {
          toast({
            title: t("procurement.orderModal.toast.notEnoughStock"),
            description: t("procurement.orderModal.toast.notEnoughStockDesc", { name: item.name, available, unit: item.unit }),
            variant: "destructive",
          });
          return;
        }
      }
    }

    if (kind === "stock") {
      const created = createDraftOrder({
        projectId,
        kind,
        supplierName: null,
        deliverToLocationId,
        fromLocationId,
        toLocationId,
        dueDate: null,
        deliveryDeadline: deliveryDeadline?.toISOString() ?? null,
        invoiceAttachment: invoiceAttachment
          ? {
            id: `invoice-${Date.now()}`,
            name: invoiceAttachment.name,
            url: invoiceAttachment.url,
            type: "file",
            isLocal: true,
            createdAt: new Date().toISOString(),
          }
          : null,
        note: note || null,
        lines: payloadLines,
      });

      if (action === "place") {
        const placed = placeOrder(created.id);
        if (!placed.ok) {
          toast({ title: t("procurement.orderModal.toast.unablePlace"), description: placed.error, variant: "destructive" });
          return;
        }
        trackEvent("procurement_order_placed", { project_id: projectId, kind: "stock", line_count: payloadLines.length });
        toast({ title: t("procurement.orderModal.toast.stockCompleted") });
        onCompleted?.(created.id);
        onOpenChange(false);
        return;
      }

      trackEvent("procurement_order_draft_created", { project_id: projectId, kind: "stock", line_count: payloadLines.length });
      toast({ title: t("procurement.orderModal.toast.draftSaved") });
      onCompleted?.(created.id);
      onOpenChange(false);
      return;
    }

    try {
      const source = await getOrdersSource(supabaseMode ?? undefined);
      const created = await source.createDraftSupplierOrder({
        projectId,
        supplierName: supplierName || null,
        deliverToLocationId,
        deliveryDeadline: deliveryDeadline?.toISOString() ?? null,
        invoiceAttachment: invoiceAttachment
          ? {
            id: `invoice-${Date.now()}`,
            name: invoiceAttachment.name,
            url: invoiceAttachment.url,
            type: "file",
            isLocal: true,
            createdAt: new Date().toISOString(),
          }
          : null,
        note: note || null,
        lines: positiveLines.map((line) => ({
          procurementItemId: line.procurementItemId,
          title: itemById.get(line.procurementItemId)?.name ?? t("procurement.orderModal.untitledItem"),
          qty: line.qty,
          unit: line.unit,
          plannedUnitPrice: line.plannedUnitPrice,
          actualUnitPrice: line.actualUnitPrice,
        })),
      });

      let finalOrderId = created.id;
      if (action === "place") {
        const placed = await source.placeSupplierOrder(created.id);
        finalOrderId = placed.id;
        trackEvent("procurement_order_placed", { project_id: projectId, kind: "supplier", supplier_name: supplierName || null, line_count: positiveLines.length });
      } else {
        trackEvent("procurement_order_draft_created", { project_id: projectId, kind: "supplier", supplier_name: supplierName || null, line_count: positiveLines.length });
      }

      if (supabaseMode) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: orderProjectOrdersQueryRoot(supabaseMode.profileId, projectId),
          }),
          queryClient.invalidateQueries({
            queryKey: orderPlacedSupplierOrdersQueryRoot(supabaseMode.profileId, projectId),
          }),
          queryClient.invalidateQueries({
            queryKey: orderQueryKeys.placedSupplierOrdersAllProjects(supabaseMode.profileId),
          }),
          queryClient.invalidateQueries({
            queryKey: orderQueryKeys.orderById(supabaseMode.profileId, finalOrderId),
          }),
          queryClient.invalidateQueries({
            queryKey: procurementProjectItemsQueryRoot(supabaseMode.profileId, projectId),
          }),
          queryClient.invalidateQueries({
            queryKey: inventoryQueryKeys.projectLocations(supabaseMode.profileId, projectId),
          }),
        ]);
      }

      toast({ title: action === "place" ? t("procurement.orderModal.toast.orderPlaced") : t("procurement.orderModal.toast.draftSaved") });
      onCompleted?.(finalOrderId);
      onOpenChange(false);
    } catch (error) {
      const description = error instanceof Error ? error.message : t("procurement.orderModal.toast.unablePlaceFallback");
      toast({
        title: action === "place" ? t("procurement.orderModal.toast.unablePlace") : t("procurement.orderModal.toast.unableDraft"),
        description,
        variant: "destructive",
      });
    }
    } finally {
      orderActionInFlightRef.current = null;
      setOrderActionInFlight(null);
    }
  };

  const totalAmount = allOrderedLinesHaveValidActualPrices
    ? orderedLines.reduce((sum, line) => sum + ((line.actualUnitPrice ?? 0) * line.qty), 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-5xl max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle>{t("procurement.orderModal.createTitle")}</DialogTitle>
        </DialogHeader>

        {!showSensitiveDetail ? (
          <>
            <div className="flex-1 px-5 py-4">
              <p className="text-sm text-muted-foreground">
                {t("procurement.orderModal.noSensitive")}
              </p>
            </div>
            <DialogFooter className="px-5 py-4 border-t border-border">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
            </DialogFooter>
          </>
        ) : (
        <>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={kind === "supplier" ? "default" : "outline"}
              onClick={() => setKind("supplier")}
              className={cn(kind === "supplier" && "bg-accent text-accent-foreground hover:bg-accent/90")}
            >
              {t("procurement.orderModal.kindSupplier")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={kind === "stock" ? "default" : "outline"}
              onClick={() => setKind("stock")}
              disabled={isSupabaseMode}
              className={cn(kind === "stock" && "bg-accent text-accent-foreground hover:bg-accent/90")}
            >
              {t("procurement.orderModal.kindStock")}
            </Button>
          </div>
          {isSupabaseMode && (
            <p className="text-xs text-muted-foreground">
              {t("procurement.orderModal.supabaseStockNote")}
            </p>
          )}

          {kind === "supplier" ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("procurement.orderModal.supplier")}</label>
                <Input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} className="h-9" placeholder={t("procurement.orderModal.supplierPlaceholder")} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("procurement.orderModal.deliverTo")}</label>
                <LocationPicker
                  projectId={projectId}
                  value={deliverToLocationId}
                  onChange={setDeliverToLocationId}
                  className="h-9"
                  placeholder={isSupabaseMode ? t("procurement.orderModal.deliverPlaceholderSupabase") : t("procurement.locationPicker.placeholder")}
                  disabled={isSupabaseMode}
                />
                {isSupabaseMode && (
                  <p className="text-[11px] text-muted-foreground">{t("procurement.orderModal.deliverHintSupabase")}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("procurement.orderModal.fromLocation")}</label>
                <LocationPicker projectId={projectId} value={fromLocationId} onChange={setFromLocationId} className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("procurement.orderModal.toLocation")}</label>
                <LocationPicker projectId={projectId} value={toLocationId} onChange={setToLocationId} className="h-9" />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("procurement.orderModal.deliveryDate")}</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start h-9 text-left font-normal">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {deliveryDeadline ? deliveryDeadline.toLocaleDateString() : t("procurement.orderModal.setDate")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={deliveryDeadline} onSelect={setDeliveryDeadline} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("procurement.orderModal.invoiceAttachment")}</label>
            <Input
              type="file"
              className="h-9"
              aria-label={t("procurement.orderModal.invoiceAria")}
              disabled={isSupabaseMode}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  setInvoiceAttachment(null);
                  return;
                }
                setInvoiceAttachment({
                  name: file.name,
                  url: URL.createObjectURL(file),
                });
                event.currentTarget.value = "";
              }}
            />
            {isSupabaseMode && (
              <p className="text-[11px] text-muted-foreground">{t("procurement.orderModal.invoiceSupabaseHint")}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("procurement.orderModal.note")}</label>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="h-9"
              placeholder={t("procurement.orderModal.notePlaceholder")}
              disabled={isSupabaseMode}
            />
            {isSupabaseMode && (
              <p className="text-[11px] text-muted-foreground">{t("procurement.orderModal.noteSupabaseHint")}</p>
            )}
          </div>

          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-[132px]" />
                <col className="w-[96px]" />
                <col className="w-[140px]" />
                <col className="w-[192px]" />
                {kind === "stock" && <col className="w-[136px]" />}
              </colgroup>
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("procurement.orderModal.colItem")}</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("procurement.orderModal.colQty")}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("procurement.orderModal.colUnit")}</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("procurement.orderModal.colPlanned")}</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("procurement.orderModal.colFactual")}</th>
                  {kind === "stock" && <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("procurement.orderModal.colAvailable")}</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const item = itemById.get(line.procurementItemId);
                  if (!item) return null;
                  const available = kind === "stock"
                    ? getStock(projectId, fromLocationId, toInventoryKey(item))
                    : 0;
                  const requestedRemaining = requestedRemainingByItemId.get(line.procurementItemId) ?? 0;
                  const remainingAfterThisOrder = Math.max(requestedRemaining - line.qty, 0);
                  const showUnderOrderWarning = remainingAfterThisOrder > 0;
                  const underOrderMessage = deliveryDeadline
                    ? t("procurement.orderModal.underOrderBy", { count: remainingAfterThisOrder, date: deliveryDeadline.toLocaleDateString() })
                    : t("procurement.orderModal.underOrder", { count: remainingAfterThisOrder });
                  const actualPriceInvalid = line.qty > 0 && !isValidActualUnitPrice(line.actualUnitPrice);
                  const showFeedback = showUnderOrderWarning || actualPriceInvalid;

                  return (
                    <Fragment key={line.procurementItemId}>
                      <tr className={cn("align-middle", !showFeedback && "border-b border-border/70")}>
                        <td className="px-3 py-2 align-middle">
                          <p className="font-medium text-foreground truncate">{item.name}</p>
                          {item.spec && <p className="text-xs text-muted-foreground truncate">{item.spec}</p>}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <Input
                            type="number"
                            min="0"
                            value={line.qty}
                            onChange={(event) => {
                              const qty = Math.max(0, Number(event.target.value));
                              setLines((prev) => prev.map((entry) => (
                                entry.procurementItemId === line.procurementItemId
                                  ? { ...entry, qty }
                                : entry
                              )));
                            }}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <span className="text-sm text-foreground">{line.unit}</span>
                        </td>
                        <td className="px-3 py-2 text-right align-middle">
                          <span className="text-sm tabular-nums text-foreground whitespace-nowrap">
                            {line.plannedUnitPrice == null ? "—" : fmtCost(line.plannedUnitPrice)}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.actualUnitPrice ?? ""}
                            onChange={(event) => {
                              const value = event.target.value ? Number(event.target.value) : null;
                              setLines((prev) => prev.map((entry) => (
                                entry.procurementItemId === line.procurementItemId
                                  ? { ...entry, actualUnitPrice: value }
                                  : entry
                              )));
                            }}
                            className={cn(
                              "h-8 text-right",
                              actualPriceInvalid && "border-destructive focus-visible:ring-destructive/40",
                            )}
                            aria-invalid={actualPriceInvalid}
                          />
                        </td>
                        {kind === "stock" && (
                          <td className={cn(
                            "px-3 py-2 align-middle text-right text-xs",
                            line.qty > available ? "text-destructive" : "text-muted-foreground",
                          )}
                          >
                            {available} {line.unit}
                          </td>
                        )}
                      </tr>
                      {showFeedback && (
                        <tr className="border-b border-border/70">
                          <td className="px-3 pb-2 pt-0" />
                          <td className="px-3 pb-2 pt-0 text-right text-[11px] leading-4 text-destructive">
                            {showUnderOrderWarning ? underOrderMessage : ""}
                          </td>
                          <td className="px-3 pb-2 pt-0" />
                          <td className="px-3 pb-2 pt-0" />
                          <td className="px-3 pb-2 pt-0 text-right text-[11px] leading-4 text-destructive">
                            {actualPriceInvalid ? t("procurement.orderModal.actualRequired") : ""}
                          </td>
                          {kind === "stock" && <td className="px-3 pb-2 pt-0" />}
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="px-5 py-4 border-t border-border">
          <div className="mr-auto text-sm text-muted-foreground">{t("procurement.orderModal.total", { amount: fmtCost(totalAmount) })}</div>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
          {SHOW_ORDER_SAVE_DRAFT_BUTTON ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => saveOrder("draft")}
              disabled={!hasOrderedLines || !!orderActionInFlight}
            >
              {orderActionInFlight === "draft"
                ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                : <Save className="h-4 w-4 mr-1" />}
              {orderActionInFlight === "draft" ? t("procurement.orderModal.saving") : t("procurement.orderModal.saveDraft")}
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => saveOrder("place")}
            disabled={!canPlaceOrder || !!orderActionInFlight}
          >
            {orderActionInFlight === "place"
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <Send className="h-4 w-4 mr-1" />}
            {orderActionInFlight === "place" ? t("procurement.orderModal.placing") : t("procurement.orderModal.placeOrder")}
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
