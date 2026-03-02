import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus, AlertTriangle, Minus, Package } from "lucide-react";

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  onHand: number;
  unit: string;
  location: string;
  reorderThreshold: number;
}

const MOCK_INVENTORY: InventoryItem[] = [
  { id: "inv-1", name: "Concrete pavers 200×100", category: "Paving", onHand: 450, unit: "pcs", location: "Warehouse A", reorderThreshold: 100 },
  { id: "inv-2", name: "Crushed stone 5-20mm", category: "Aggregates", onHand: 3, unit: "m³", location: "Outdoor yard", reorderThreshold: 5 },
  { id: "inv-3", name: "Geotextile 200g/m²", category: "Fabrics", onHand: 80, unit: "m²", location: "Warehouse B", reorderThreshold: 50 },
  { id: "inv-4", name: "PVC pipe 110mm", category: "Plumbing", onHand: 24, unit: "m", location: "Warehouse A", reorderThreshold: 10 },
  { id: "inv-5", name: "Cement M400", category: "Dry mixes", onHand: 12, unit: "bags", location: "Warehouse A", reorderThreshold: 20 },
  { id: "inv-6", name: "Sand washed", category: "Aggregates", onHand: 2, unit: "m³", location: "Outdoor yard", reorderThreshold: 3 },
];

export function InventoryTab() {
  const [items, setItems] = useState(MOCK_INVENTORY);
  const [search, setSearch] = useState("");
  const [showLowOnly, setShowLowOnly] = useState(false);

  const filtered = items.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
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
            <p className="text-body-sm text-warning">{lowStockCount} items below reorder threshold</p>
            <Button variant="outline" size="sm" className="ml-auto text-caption h-7" onClick={() => setShowLowOnly(!showLowOnly)}>
              {showLowOnly ? "Show all" : "Show low stock only"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search inventory…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Button variant="outline" size="sm">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add item
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-sp-3 py-2 font-medium text-muted-foreground">Item</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Category</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">On hand</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Unit</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Location</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Reorder at</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-center">Actions</th>
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
                          <span className="font-medium text-foreground">{item.name}</span>
                          {isLow && <Badge variant="destructive" className="text-[9px] px-1 py-0">Low</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{item.category}</td>
                      <td className={`px-3 py-2.5 text-right font-medium ${isLow ? "text-destructive" : "text-foreground"}`}>{item.onHand}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{item.unit}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{item.location}</td>
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
              <p className="text-caption text-muted-foreground py-8 text-center">No inventory items found.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
