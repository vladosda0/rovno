import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus, AlertTriangle, Minus, Package } from "lucide-react";
import { ReceiveOrderPickerModal } from "@/components/procurement/ReceiveOrderPickerModal";

interface InventoryItem {
  id: string;
  nameKey: string;
  categoryKey: string;
  onHand: number;
  unitKey: string;
  locationKey: string;
  reorderThreshold: number;
}

const MOCK_INVENTORY: InventoryItem[] = [
  { id: "inv-1", nameKey: "inventoryTab.mock.pavers.name", categoryKey: "inventoryTab.mock.pavers.category", onHand: 450, unitKey: "inventoryTab.mock.pavers.unit", locationKey: "inventoryTab.mock.locationWarehouseA", reorderThreshold: 100 },
  { id: "inv-2", nameKey: "inventoryTab.mock.gravel.name", categoryKey: "inventoryTab.mock.gravel.category", onHand: 3, unitKey: "inventoryTab.mock.gravel.unit", locationKey: "inventoryTab.mock.locationOutdoorYard", reorderThreshold: 5 },
  { id: "inv-3", nameKey: "inventoryTab.mock.geotextile.name", categoryKey: "inventoryTab.mock.geotextile.category", onHand: 80, unitKey: "inventoryTab.mock.geotextile.unit", locationKey: "inventoryTab.mock.locationWarehouseB", reorderThreshold: 50 },
  { id: "inv-4", nameKey: "inventoryTab.mock.pipe.name", categoryKey: "inventoryTab.mock.pipe.category", onHand: 24, unitKey: "inventoryTab.mock.pipe.unit", locationKey: "inventoryTab.mock.locationWarehouseA", reorderThreshold: 10 },
  { id: "inv-5", nameKey: "inventoryTab.mock.cement.name", categoryKey: "inventoryTab.mock.cement.category", onHand: 12, unitKey: "inventoryTab.mock.cement.unit", locationKey: "inventoryTab.mock.locationWarehouseA", reorderThreshold: 20 },
  { id: "inv-6", nameKey: "inventoryTab.mock.sand.name", categoryKey: "inventoryTab.mock.sand.category", onHand: 2, unitKey: "inventoryTab.mock.sand.unit", locationKey: "inventoryTab.mock.locationOutdoorYard", reorderThreshold: 3 },
];

export function InventoryTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState(MOCK_INVENTORY);
  const [search, setSearch] = useState("");
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [receiveOrderOpen, setReceiveOrderOpen] = useState(false);

  const filtered = items.filter((item) => {
    if (search && !t(item.nameKey).toLowerCase().includes(search.toLowerCase())) return false;
    if (showLowOnly && item.onHand >= item.reorderThreshold) return false;
    return true;
  });

  const lowStockCount = items.filter((i) => i.onHand < i.reorderThreshold).length;

  function adjustStock(id: string, delta: number) {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, onHand: Math.max(0, i.onHand + delta) } : i));
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Low stock alert */}
      {lowStockCount > 0 && (
        <Card className="border-warning/30">
          <CardContent className="flex items-center gap-2 p-4 sm:p-6">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <p className="text-body-sm text-warning">{t("inventoryTab.belowThreshold", { count: lowStockCount })}</p>
            <Button variant="outline" size="sm" className="ml-auto text-caption h-7" onClick={() => setShowLowOnly(!showLowOnly)}>
              {showLowOnly ? t("inventoryTab.showAll") : t("inventoryTab.showLow")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("inventoryTab.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Button variant="outline" size="sm">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> {t("inventoryTab.addItem")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setReceiveOrderOpen(true)}>
          {t("inventoryTab.receivePO")}
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-sp-3 py-2 font-medium text-muted-foreground">{t("inventoryTab.col.item")}</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("inventoryTab.col.category")}</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("inventoryTab.col.onHand")}</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("inventoryTab.col.unit")}</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("inventoryTab.col.location")}</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("inventoryTab.col.reorder")}</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-center">{t("inventoryTab.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isLow = item.onHand < item.reorderThreshold;
                  return (
                    <tr key={item.id} className={`border-b border-border hover:bg-muted/20 transition-colors ${isLow ? "bg-warning/5" : ""}`}>
                      <td className="px-sp-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium text-foreground">{t(item.nameKey)}</span>
                          {isLow && <Badge variant="destructive" className="text-[9px] px-1 py-0">{t("inventoryTab.lowBadge")}</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{t(item.categoryKey)}</td>
                      <td className={`px-3 py-2.5 text-right font-medium ${isLow ? "text-destructive" : "text-foreground"}`}>{item.onHand}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{t(item.unitKey)}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{t(item.locationKey)}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{item.reorderThreshold}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => adjustStock(item.id, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => adjustStock(item.id, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="text-caption text-muted-foreground py-8 text-center">{t("inventoryTab.empty")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <ReceiveOrderPickerModal
        open={receiveOrderOpen}
        onOpenChange={setReceiveOrderOpen}
      />
    </div>
  );
}
