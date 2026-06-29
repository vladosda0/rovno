import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Plus, Minus, Package, ArrowRight } from "lucide-react";
import { ReceiveOrderPickerModal } from "@/components/procurement/ReceiveOrderPickerModal";
import { useHomeInventorySnapshot } from "@/hooks/use-inventory-data";

export function InventoryTab() {
  const { t } = useTranslation();
  const { projects, isLoading, totalRows } = useHomeInventorySnapshot();
  const [search, setSearch] = useState("");
  const [receiveOrderOpen, setReceiveOrderOpen] = useState(false);

  const query = search.trim().toLowerCase();
  const visibleProjects = projects
    .map((project) => ({
      ...project,
      rows: query
        ? project.rows.filter((row) => {
            const name = (row.title ?? row.inventoryKey).toLowerCase();
            return name.includes(query) || row.inventoryKey.toLowerCase().includes(query);
          })
        : project.rows,
    }))
    .filter((project) => project.rows.length > 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-accent" />
        <h2 className="text-body font-semibold text-foreground">{t("inventoryTab.title")}</h2>
        <Badge variant="secondary" className="text-caption">{t("inventoryTab.itemsCount", { count: totalRows })}</Badge>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("inventoryTab.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex">
              <Button variant="outline" size="sm" disabled>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> {t("inventoryTab.addItem")}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t("common.comingSoon")}</TooltipContent>
        </Tooltip>
        <Button variant="outline" size="sm" onClick={() => setReceiveOrderOpen(true)}>
          {t("inventoryTab.receivePO")}
        </Button>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <p className="text-body-sm text-muted-foreground animate-pulse">{t("common.loading")}</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && visibleProjects.map((project) => (
        <Card key={project.projectId}>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
              <h3 className="text-body-sm font-semibold text-foreground">{project.projectTitle}</h3>
              <Link to={`/project/${project.projectId}/procurement`} className="text-caption text-accent hover:underline flex items-center gap-1">
                {t("inventoryTab.view")} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-border px-4 pb-4 sm:px-6 sm:pb-6">
              {project.rows.map((row) => (
                <div key={`${row.locationId}::${row.inventoryItemId ?? row.inventoryKey}`} className="flex items-center gap-3 py-2">
                  <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm text-foreground truncate">{row.title ?? row.inventoryKey}</p>
                    {row.spec && <p className="text-caption text-muted-foreground truncate">{row.spec}</p>}
                  </div>
                  <span className="text-body-sm font-medium text-foreground whitespace-nowrap">
                    {row.qty}{row.unit ? ` ${row.unit}` : ""}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="inline-flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{t("common.comingSoon")}</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {!isLoading && visibleProjects.length === 0 && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <p className="text-caption text-muted-foreground py-8 text-center">{t("inventoryTab.empty")}</p>
          </CardContent>
        </Card>
      )}

      <ReceiveOrderPickerModal
        open={receiveOrderOpen}
        onOpenChange={setReceiveOrderOpen}
      />
    </div>
  );
}
