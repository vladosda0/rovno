import { useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import { orderQueryKeys, useOrders } from "@/hooks/use-order-data";
import { procurementQueryKeys } from "@/hooks/use-procurement-source";
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

export function OrderModal({
  open,
  onOpenChange,
  projectId,
  initialItemIds,
  onCompleted,
}: OrderModalProps) {
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
      toast({ title: "No lines selected", description: "Add at least one line with quantity", variant: "destructive" });
      return;
    }
    if (action === "place" && !allOrderedLinesHaveValidActualPrices) {
      toast({ title: "Actual price required", description: "Set a valid actual price for each ordered line", variant: "destructive" });
      return;
    }

    if (kind === "stock" && !fromLocationId) {
      toast({ title: "From location is required", variant: "destructive" });
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
            title: "Not enough stock",
            description: `${item.name}: available ${available} ${item.unit}`,
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
          toast({ title: "Unable to place order", description: placed.error, variant: "destructive" });
          return;
        }
        trackEvent("procurement_order_placed", { project_id: projectId, kind: "stock", line_count: payloadLines.length });
        toast({ title: "Stock allocation completed" });
        onCompleted?.(created.id);
        onOpenChange(false);
        return;
      }

      trackEvent("procurement_order_draft_created", { project_id: projectId, kind: "stock", line_count: payloadLines.length });
      toast({ title: "Draft saved" });
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
          title: itemById.get(line.procurementItemId)?.name ?? "Untitled item",
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
            queryKey: orderQueryKeys.projectOrders(supabaseMode.profileId, projectId),
          }),
          queryClient.invalidateQueries({
            queryKey: orderQueryKeys.placedSupplierOrders(supabaseMode.profileId, projectId),
          }),
          queryClient.invalidateQueries({
            queryKey: orderQueryKeys.placedSupplierOrdersAllProjects(supabaseMode.profileId),
          }),
          queryClient.invalidateQueries({
            queryKey: orderQueryKeys.orderById(supabaseMode.profileId, finalOrderId),
          }),
          queryClient.invalidateQueries({
            queryKey: procurementQueryKeys.projectItems(supabaseMode.profileId, projectId),
          }),
          queryClient.invalidateQueries({
            queryKey: inventoryQueryKeys.projectLocations(supabaseMode.profileId, projectId),
          }),
        ]);
      }

      toast({ title: action === "place" ? "Order placed" : "Draft saved" });
      onCompleted?.(finalOrderId);
      onOpenChange(false);
    } catch (error) {
      const description = error instanceof Error ? error.message : "Please try again.";
      toast({
        title: action === "place" ? "Unable to place order" : "Unable to save draft",
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
          <DialogTitle>Create order</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={kind === "supplier" ? "default" : "outline"}
              onClick={() => setKind("supplier")}
              className={cn(kind === "supplier" && "bg-accent text-accent-foreground hover:bg-accent/90")}
            >
              Supplier
            </Button>
            <Button
              type="button"
              size="sm"
              variant={kind === "stock" ? "default" : "outline"}
              onClick={() => setKind("stock")}
              disabled={isSupabaseMode}
              className={cn(kind === "stock" && "bg-accent text-accent-foreground hover:bg-accent/90")}
            >
              Stock
            </Button>
          </div>
          {isSupabaseMode && (
            <p className="text-xs text-muted-foreground">
              Stock allocation stays local-only for now and is disabled in Supabase mode.
            </p>
          )}

          {kind === "supplier" ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Supplier</label>
                <Input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} className="h-9" placeholder="Supplier name" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Deliver to</label>
                <LocationPicker
                  projectId={projectId}
                  value={deliverToLocationId}
                  onChange={setDeliverToLocationId}
                  className="h-9"
                  placeholder={isSupabaseMode ? "Choose at receive time" : "Select location"}
                  disabled={isSupabaseMode}
                />
                {isSupabaseMode && (
                  <p className="text-[11px] text-muted-foreground">Receive location is saved when the order is received.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">From location</label>
                <LocationPicker projectId={projectId} value={fromLocationId} onChange={setFromLocationId} className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">To location</label>
                <LocationPicker projectId={projectId} value={toLocationId} onChange={setToLocationId} className="h-9" />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Delivery date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start h-9 text-left font-normal">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {deliveryDeadline ? deliveryDeadline.toLocaleDateString() : "Set date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={deliveryDeadline} onSelect={setDeliveryDeadline} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Invoice attachment</label>
            <Input
              type="file"
              className="h-9"
              aria-label="Invoice attachment"
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
              <p className="text-[11px] text-muted-foreground">Invoice uploads are not persisted in this Supabase slice yet.</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Note</label>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="h-9"
              placeholder="Optional note"
              disabled={isSupabaseMode}
            />
            {isSupabaseMode && (
              <p className="text-[11px] text-muted-foreground">Order notes are not persisted in this Supabase slice yet.</p>
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
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Qty</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Unit</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Planned</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Factual price</th>
                  {kind === "stock" && <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Available</th>}
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
                  const deliveryDateFragment = deliveryDeadline ? ` by ${deliveryDeadline.toLocaleDateString()}` : "";
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
                            {showUnderOrderWarning ? `⚠️ ${remainingAfterThisOrder} more materials requested${deliveryDateFragment}` : ""}
                          </td>
                          <td className="px-3 pb-2 pt-0" />
                          <td className="px-3 pb-2 pt-0" />
                          <td className="px-3 pb-2 pt-0 text-right text-[11px] leading-4 text-destructive">
                            {actualPriceInvalid ? "Actual price required" : ""}
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
          <div className="mr-auto text-sm text-muted-foreground">Total: {fmtCost(totalAmount)}</div>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => saveOrder("draft")}
            disabled={!hasOrderedLines || !!orderActionInFlight}
          >
            {orderActionInFlight === "draft"
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <Save className="h-4 w-4 mr-1" />}
            {orderActionInFlight === "draft" ? "Saving..." : "Save draft"}
          </Button>
          <Button
            type="button"
            onClick={() => saveOrder("place")}
            disabled={!canPlaceOrder || !!orderActionInFlight}
          >
            {orderActionInFlight === "place"
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <Send className="h-4 w-4 mr-1" />}
            {orderActionInFlight === "place" ? "Placing..." : "Place order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
