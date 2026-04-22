import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePlacedSupplierOrders, usePlacedSupplierOrdersAllProjects } from "@/hooks/use-order-data";
import { getProject, getProjects } from "@/data/store";
import { getProcurementItemById } from "@/data/procurement-store";
import { ReceiveOrderModal } from "@/components/procurement/ReceiveOrderModal";

interface ReceiveOrderPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
}

export function ReceiveOrderPickerModal({
  open,
  onOpenChange,
  projectId,
}: ReceiveOrderPickerModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const projectOrders = usePlacedSupplierOrders(projectId ?? "");
  const allOrders = usePlacedSupplierOrdersAllProjects();

  const orders = projectId ? projectOrders : allOrders;
  const projectById = useMemo(() => {
    const map = new Map<string, string>();
    getProjects().forEach((project) => map.set(project.id, project.title));
    return map;
  }, []);

  const filtered = orders.filter((order) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const projectTitle = projectById.get(order.projectId) ?? "";
    return (
      (order.supplierName ?? "").toLowerCase().includes(q)
      || projectTitle.toLowerCase().includes(q)
      || order.lines.some((line) => {
        const item = getProcurementItemById(line.procurementItemId);
        return (
          item?.name.toLowerCase().includes(q)
          || (item?.spec?.toLowerCase().includes(q) ?? false)
        );
      })
    );
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[88vh] overflow-hidden p-0 gap-0 flex flex-col">
          <DialogHeader className="px-5 py-4 border-b border-border">
            <DialogTitle>{t("procurement.receivePicker.title")}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("procurement.receivePicker.searchPlaceholder")}
                className="pl-9 h-9"
              />
            </div>

            <div className="space-y-2">
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">{t("procurement.receivePicker.noPlaced")}</p>
              )}
              {filtered.map((order) => {
                const projectTitle = projectById.get(order.projectId) ?? getProject(order.projectId)?.title ?? order.projectId;
                const totalLines = order.lines.length;
                const totalQty = order.lines.reduce((sum, line) => sum + Math.max(0, line.qty - line.receivedQty), 0);
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => {
                      setSelectedOrderId(order.id);
                      setSelectedProjectId(order.projectId);
                    }}
                    className="w-full rounded-lg border border-border p-3 text-left hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{order.supplierName || t("procurement.receivePicker.supplierFallback")}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {t("procurement.receivePicker.summary", { lines: totalLines, qty: totalQty })}
                        </p>
                        {!projectId && (
                          <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {projectTitle}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {order.deliveryDeadline ? new Date(order.deliveryDeadline).toLocaleDateString() : t("procurement.receivePicker.noDeadline")}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {selectedOrderId && selectedProjectId && (
        <ReceiveOrderModal
          open={!!selectedOrderId}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setSelectedOrderId(null);
              setSelectedProjectId(null);
            }
          }}
          projectId={selectedProjectId}
          orderId={selectedOrderId}
        />
      )}
    </>
  );
}
