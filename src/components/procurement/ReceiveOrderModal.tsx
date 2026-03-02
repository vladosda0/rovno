import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { receiveOrder } from "@/data/order-store";
import { ensureDefaultLocation } from "@/data/inventory-store";
import { useProcurementV2 } from "@/hooks/use-mock-data";
import { useOrder } from "@/hooks/use-order-data";
import { useToast } from "@/hooks/use-toast";
import { LocationPicker } from "@/components/procurement/LocationPicker";

interface ReceiveOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  orderId: string;
  onCompleted?: () => void;
}

export function ReceiveOrderModal({
  open,
  onOpenChange,
  projectId,
  orderId,
  onCompleted,
}: ReceiveOrderModalProps) {
  const order = useOrder(orderId);
  const items = useProcurementV2(projectId);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const { toast } = useToast();

  const [locationId, setLocationId] = useState("");
  const [lineQty, setLineQty] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open || !order) return;
    const fallback = ensureDefaultLocation(projectId).id;
    setLocationId(order.deliverToLocationId ?? fallback);
    const nextLineQty: Record<string, number> = {};
    order.lines.forEach((line) => {
      nextLineQty[line.id] = Math.max(0, line.qty - line.receivedQty);
    });
    setLineQty(nextLineQty);
  }, [open, order, projectId]);

  const submit = () => {
    if (!order) return;
    if (order.status !== "placed") {
      toast({ title: "Order is not receivable", variant: "destructive" });
      return;
    }
    const lines = order.lines
      .map((line) => ({ lineId: line.id, qty: Number(lineQty[line.id] ?? 0) }))
      .filter((line) => line.qty > 0);

    if (lines.length === 0) {
      toast({ title: "No quantities entered", variant: "destructive" });
      return;
    }

    const result = receiveOrder(order.id, { locationId, lines });
    if (!result.ok) {
      toast({ title: "Receive failed", description: result.error, variant: "destructive" });
      return;
    }

    toast({ title: "Order received" });
    onCompleted?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-2xl max-h-[88vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle>Receive order</DialogTitle>
        </DialogHeader>

        {!order ? (
          <div className="px-5 py-4 text-sm text-muted-foreground">Order not found.</div>
        ) : (
          <div className="px-5 py-4 overflow-y-auto space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">Receive to location</label>
              <LocationPicker projectId={projectId} value={locationId} onChange={setLocationId} />
            </div>

            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2">Item</th>
                    <th className="text-right px-3 py-2">Ordered</th>
                    <th className="text-right px-3 py-2">Already received</th>
                    <th className="text-right px-3 py-2">Receive now</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => {
                    const item = itemById.get(line.procurementItemId);
                    const remaining = Math.max(0, line.qty - line.receivedQty);

                    return (
                      <tr key={line.id} className="border-b border-border/70 last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium text-foreground">{item?.name ?? "Unknown item"}</p>
                          {item?.spec && <p className="text-xs text-muted-foreground">{item.spec}</p>}
                        </td>
                        <td className="px-3 py-2 text-right">{line.qty} {line.unit}</td>
                        <td className="px-3 py-2 text-right">{line.receivedQty} {line.unit}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0"
                            max={remaining}
                            value={lineQty[line.id] ?? 0}
                            onChange={(event) => {
                              const nextValue = Math.min(remaining, Math.max(0, Number(event.target.value)));
                              setLineQty((prev) => ({ ...prev, [line.id]: nextValue }));
                            }}
                            className="h-8 text-right"
                          />
                        </td>
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
          <Button type="button" onClick={submit} disabled={!order || order.status !== "placed"}>Receive</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
