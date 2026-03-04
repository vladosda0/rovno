import { useEffect, useMemo, useState } from "react";
import { CalendarIcon, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { createDraftOrder, placeOrder } from "@/data/order-store";
import { getStock, ensureDefaultLocation } from "@/data/inventory-store";
import { useProcurementV2 } from "@/hooks/use-mock-data";
import { useOrders } from "@/hooks/use-order-data";
import { useLocations } from "@/hooks/use-inventory-data";
import { computeRemainingRequestedQty, toInventoryKey } from "@/lib/procurement-fulfillment";
import { fmtCost } from "@/lib/procurement-utils";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { LocationPicker } from "@/components/procurement/LocationPicker";
import type { DraftOrderLineInput } from "@/data/order-store";
import type { OrderKind } from "@/types/entities";

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

function toDateInput(dateIso?: string | null): Date | undefined {
  if (!dateIso) return undefined;
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

export function OrderModal({
  open,
  onOpenChange,
  projectId,
  initialItemIds,
  onCompleted,
}: OrderModalProps) {
  const items = useProcurementV2(projectId);
  const orders = useOrders(projectId);
  const locations = useLocations(projectId);
  const { toast } = useToast();

  const [kind, setKind] = useState<OrderKind>("supplier");
  const [supplierName, setSupplierName] = useState("");
  const [deliverToLocationId, setDeliverToLocationId] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [deliveryDeadline, setDeliveryDeadline] = useState<Date | undefined>(undefined);
  const [invoiceAttachment, setInvoiceAttachment] = useState<{ name: string; url: string } | null>(null);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLineState[]>([]);

  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  useEffect(() => {
    if (!open) return;

    const defaultLocation = ensureDefaultLocation(projectId);
    const nextItemIds = initialItemIds.length > 0
      ? initialItemIds
      : items.map((item) => item.id);

    const nextLines = nextItemIds
      .map((itemId) => {
        const item = itemById.get(itemId);
        if (!item) return null;
        const remaining = computeRemainingRequestedQty(item.id, orders);
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
    setDeliverToLocationId(defaultLocation.id);
    setFromLocationId(defaultLocation.id);
    setToLocationId(defaultLocation.id);
    setDueDate(undefined);
    setDeliveryDeadline(undefined);
    setInvoiceAttachment(null);
    setNote("");
    setLines(nextLines);
  }, [open, initialItemIds, itemById, items, orders, projectId]);

  const hasValidLines = lines.some((line) => line.qty > 0);

  const saveOrder = (action: "draft" | "place") => {
    const payloadLines: DraftOrderLineInput[] = lines
      .filter((line) => line.qty > 0)
      .map((line) => ({
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

    if (kind === "stock" && !fromLocationId) {
      toast({ title: "From location is required", variant: "destructive" });
      return;
    }

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

    const created = createDraftOrder({
      projectId,
      kind,
      supplierName: kind === "supplier" ? (supplierName || null) : null,
      deliverToLocationId,
      fromLocationId: kind === "stock" ? fromLocationId : null,
      toLocationId: kind === "stock" ? toLocationId : null,
      dueDate: dueDate?.toISOString() ?? null,
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
      toast({ title: kind === "supplier" ? "Order placed" : "Stock allocation completed" });
      onCompleted?.(created.id);
      onOpenChange(false);
      return;
    }

    toast({ title: "Draft saved" });
    onCompleted?.(created.id);
    onOpenChange(false);
  };

  const totalAmount = lines.reduce((sum, line) => {
    const unitPrice = line.actualUnitPrice ?? line.plannedUnitPrice ?? 0;
    return sum + unitPrice * line.qty;
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-5xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle>Create order</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
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
              className={cn(kind === "stock" && "bg-accent text-accent-foreground hover:bg-accent/90")}
            >
              Stock
            </Button>
          </div>

          {kind === "supplier" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Supplier</label>
                <Input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} className="h-9" placeholder="Supplier name" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Deliver to</label>
                <LocationPicker projectId={projectId} value={deliverToLocationId} onChange={setDeliverToLocationId} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">From location</label>
                <LocationPicker projectId={projectId} value={fromLocationId} onChange={setFromLocationId} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">To location</label>
                <LocationPicker projectId={projectId} value={toLocationId} onChange={setToLocationId} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Due date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start h-9 text-left font-normal">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {dueDate ? dueDate.toLocaleDateString() : "Set date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Delivery deadline</label>
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
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Invoice attachment</label>
            <Input
              type="file"
              className="h-9"
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
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Note</label>
            <Input value={note} onChange={(event) => setNote(event.target.value)} className="h-9" placeholder="Optional note" />
          </div>

          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-right px-3 py-2">Qty</th>
                  <th className="text-left px-3 py-2">Unit</th>
                  <th className="text-right px-3 py-2">Planned</th>
                  <th className="text-right px-3 py-2">Actual</th>
                  {kind === "stock" && <th className="text-right px-3 py-2">Available</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const item = itemById.get(line.procurementItemId);
                  if (!item) return null;
                  const available = kind === "stock"
                    ? getStock(projectId, fromLocationId, toInventoryKey(item))
                    : 0;

                  return (
                    <tr key={line.procurementItemId} className="border-b border-border/70 last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground">{item.name}</p>
                        {item.spec && <p className="text-xs text-muted-foreground">{item.spec}</p>}
                      </td>
                      <td className="px-3 py-2">
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
                      <td className="px-3 py-2">
                        <span className="text-sm text-foreground">{line.unit}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-sm tabular-nums text-foreground">
                          {line.plannedUnitPrice == null ? "—" : fmtCost(line.plannedUnitPrice)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          value={line.actualUnitPrice ?? ""}
                          onChange={(event) => {
                            const value = event.target.value ? Number(event.target.value) : null;
                            setLines((prev) => prev.map((entry) => (
                              entry.procurementItemId === line.procurementItemId
                                ? { ...entry, actualUnitPrice: value }
                                : entry
                            )));
                          }}
                          className="h-8 text-right"
                        />
                      </td>
                      {kind === "stock" && (
                        <td className={cn(
                          "px-3 py-2 text-right text-xs",
                          line.qty > available ? "text-destructive" : "text-muted-foreground",
                        )}
                        >
                          {available} {line.unit}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="px-5 py-4 border-t border-border">
          <div className="mr-auto text-sm text-muted-foreground">Total: {fmtCost(totalAmount)}</div>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button type="button" variant="secondary" onClick={() => saveOrder("draft")} disabled={!hasValidLines}>
            <Save className="h-4 w-4 mr-1" />
            Save draft
          </Button>
          <Button type="button" onClick={() => saveOrder("place")} disabled={!hasValidLines}>
            <Send className="h-4 w-4 mr-1" />
            Place order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
