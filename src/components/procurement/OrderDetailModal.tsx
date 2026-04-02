import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cancelDraftOrder, voidOrder } from "@/data/order-store";
import { useOrder } from "@/hooks/use-order-data";
import { useProcurementV2 } from "@/hooks/use-mock-data";
import { useLocations } from "@/hooks/use-inventory-data";
import { useToast } from "@/hooks/use-toast";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { fmtCost } from "@/lib/procurement-utils";
import { StatusBadge } from "@/components/StatusBadge";
import { ReceiveOrderModal } from "@/components/procurement/ReceiveOrderModal";

interface OrderDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  orderId: string;
  showSensitiveDetail?: boolean;
  onOpenRequest?: (requestId: string) => void;
}

function orderStatusLabel(status: "draft" | "placed" | "received" | "voided") {
  if (status === "draft") return "Draft";
  if (status === "placed") return "Ordered";
  if (status === "voided") return "Voided";
  return "In stock";
}

export function OrderDetailModal({
  open,
  onOpenChange,
  projectId,
  orderId,
  showSensitiveDetail = true,
  onOpenRequest,
}: OrderDetailModalProps) {
  const order = useOrder(orderId);
  const items = useProcurementV2(projectId);
  const locations = useLocations(projectId);
  const workspaceMode = useWorkspaceMode();
  const isSupabaseMode = workspaceMode.kind === "supabase";
  const [receiveOpen, setReceiveOpen] = useState(false);
  const { toast } = useToast();

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);

  const total = useMemo(() => {
    if (!order) return 0;
    return order.lines.reduce((sum, line) => {
      const fallback = itemById.get(line.procurementItemId);
      const unitPrice = line.actualUnitPrice
        ?? line.plannedUnitPrice
        ?? fallback?.actualUnitPrice
        ?? fallback?.plannedUnitPrice
        ?? 0;
      return sum + unitPrice * line.qty;
    }, 0);
  }, [order, itemById]);

  const plannedTotal = useMemo(() => {
    if (!order) return 0;
    return order.lines.reduce((sum, line) => {
      const fallback = itemById.get(line.procurementItemId);
      const plannedUnit = line.plannedUnitPrice
        ?? fallback?.plannedUnitPrice
        ?? 0;
      return sum + plannedUnit * line.qty;
    }, 0);
  }, [order, itemById]);

  const factualTotal = useMemo(() => {
    if (!order) return 0;
    return order.lines.reduce((sum, line) => {
      const fallback = itemById.get(line.procurementItemId);
      const factualUnit = line.actualUnitPrice
        ?? fallback?.actualUnitPrice
        ?? line.plannedUnitPrice
        ?? fallback?.plannedUnitPrice
        ?? 0;
      return sum + factualUnit * line.qty;
    }, 0);
  }, [order, itemById]);

  const onCancelDraft = () => {
    if (!order) return;
    const result = cancelDraftOrder(order.id);
    if (!result.ok) {
      toast({ title: "Unable to cancel draft", description: result.error, variant: "destructive" });
      return;
    }
    toast({ title: "Draft cancelled" });
  };

  const onVoidOrder = () => {
    if (!order) return;
    const result = voidOrder(order.id);
    if (!result.ok) {
      toast({ title: "Unable to void order", description: result.error, variant: "destructive" });
      return;
    }
    toast({ title: "Order voided" });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-5 py-4 border-b border-border">
            <DialogTitle className="flex items-center gap-2">
              Order details
              {order && <StatusBadge status={orderStatusLabel(order.status)} variant="procurement" />}
            </DialogTitle>
          </DialogHeader>

          {!order ? (
            <div className="flex-1 px-5 py-4 text-sm text-muted-foreground">Order not found.</div>
          ) : (
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Source</p>
                  <p className="text-foreground capitalize">{order.kind}</p>
                  {order.supplierName && (
                    <>
                      <p className="text-xs text-muted-foreground pt-1">Supplier</p>
                      <p className="text-foreground">{order.supplierName}</p>
                    </>
                  )}
                </div>
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Deliver to</p>
                  <p className="text-foreground">{locationById.get(order.deliverToLocationId ?? "")?.name ?? "—"}</p>
                  {order.kind === "stock" && order.fromLocationId && (
                    <>
                      <p className="text-xs text-muted-foreground pt-1">From location</p>
                      <p className="text-foreground">{locationById.get(order.fromLocationId)?.name ?? "—"}</p>
                    </>
                  )}
                </div>
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Due date</p>
                  <p className="text-foreground">{order.dueDate ? new Date(order.dueDate).toLocaleDateString() : "—"}</p>
                  <p className="text-xs text-muted-foreground pt-1">Delivery deadline</p>
                  <p className="text-foreground">{order.deliveryDeadline ? new Date(order.deliveryDeadline).toLocaleDateString() : "—"}</p>
                </div>
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Invoice</p>
                  <p className="text-foreground">{order.invoiceAttachment?.name ?? "—"}</p>
                  {showSensitiveDetail && (
                    <>
                      <p className="text-xs text-muted-foreground pt-1">Planned total</p>
                      <p className="text-foreground">{fmtCost(plannedTotal)}</p>
                      <p className="text-xs text-muted-foreground pt-1">Factual total</p>
                      <p className="text-foreground">{fmtCost(factualTotal)}</p>
                      <p className="text-xs text-muted-foreground pt-1">Open value</p>
                      <p className="text-foreground">{fmtCost(total)}</p>
                    </>
                  )}
                </div>
              </div>

              {order.note && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Note</p>
                  <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{order.note}</p>
                </div>
              )}

              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2">Item</th>
                      <th className="text-right px-3 py-2">Qty</th>
                      <th className="text-left px-3 py-2">Unit</th>
                      {showSensitiveDetail && <th className="text-right px-3 py-2">Planned unit</th>}
                      {showSensitiveDetail && <th className="text-right px-3 py-2">Factual unit</th>}
                      {showSensitiveDetail && <th className="text-right px-3 py-2">Planned total</th>}
                      {showSensitiveDetail && <th className="text-right px-3 py-2">Factual total</th>}
                      <th className="text-right px-3 py-2">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.map((line) => {
                      const item = itemById.get(line.procurementItemId);
                      const plannedUnit = line.plannedUnitPrice
                        ?? item?.plannedUnitPrice
                        ?? 0;
                      const factualUnit = line.actualUnitPrice
                        ?? item?.actualUnitPrice
                        ?? line.plannedUnitPrice
                        ?? item?.plannedUnitPrice
                        ?? 0;

                      return (
                        <tr key={line.id} className="border-b border-border/70 last:border-0">
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="text-left hover:underline"
                              onClick={() => onOpenRequest?.(line.procurementItemId)}
                            >
                              <p className="font-medium text-foreground">{item?.name ?? "Unknown item"}</p>
                              {item?.spec && <p className="text-xs text-muted-foreground">{item.spec}</p>}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right">{line.qty}</td>
                          <td className="px-3 py-2">{line.unit}</td>
                          {showSensitiveDetail && <td className="px-3 py-2 text-right">{fmtCost(plannedUnit)}</td>}
                          {showSensitiveDetail && <td className="px-3 py-2 text-right">{fmtCost(factualUnit)}</td>}
                          {showSensitiveDetail && <td className="px-3 py-2 text-right">{fmtCost(plannedUnit * line.qty)}</td>}
                          {showSensitiveDetail && <td className="px-3 py-2 text-right">{fmtCost(factualUnit * line.qty)}</td>}
                          <td className="px-3 py-2 text-right">{line.receivedQty}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter className="px-5 py-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            {order?.status === "draft" && !isSupabaseMode && (
              <Button type="button" variant="destructive" onClick={onCancelDraft}>Cancel draft</Button>
            )}
            {order?.status === "draft" && isSupabaseMode && order.kind === "supplier" && (
              <Button type="button" variant="destructive" disabled>Cancel draft</Button>
            )}
            {order?.status === "placed" && !isSupabaseMode && (
              <Button type="button" variant="destructive" onClick={onVoidOrder}>Void order</Button>
            )}
            {order?.status === "placed" && isSupabaseMode && order.kind === "supplier" && (
              <Button type="button" variant="destructive" disabled>Void order</Button>
            )}
            {order?.kind === "stock" && order?.status === "received" && !isSupabaseMode && (
              <Button type="button" variant="destructive" onClick={onVoidOrder}>Void allocation</Button>
            )}
            {order?.kind === "supplier" && order.status === "placed" && (
              <Button type="button" onClick={() => setReceiveOpen(true)}>Receive</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {order && (
        <ReceiveOrderModal
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
          projectId={projectId}
          orderId={order.id}
        />
      )}
    </>
  );
}
