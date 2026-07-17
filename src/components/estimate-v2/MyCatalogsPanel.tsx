import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, Home, Loader2, Search, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useAllUserCatalogItems, useUserCatalogs } from "@/hooks/use-user-catalogs";
import { formatCentsAsRub } from "@/lib/user-catalog/validation";
import { getUnitLabel } from "@/lib/estimate-v2/resource-units";
import { QuantityStepper } from "@/components/estimate-v2/QuantityStepper";
import type { UserCatalogItem } from "@/types/user-catalog";

const CATALOGS_TAB_URL = "/home?tab=documents&docTab=catalogs";

interface MyCatalogsPanelProps {
  /** Queries fire only when the tab is visible in supabase mode. */
  enabled: boolean;
  onAddItem: (item: UserCatalogItem, quantity: number) => void;
}

/**
 * "Мои каталоги" tab of the estimate constructor (spec R-7): the user's
 * personal catalogs, expandable to items; clicking an item adds it to the
 * target work with the user's own price.
 */
export function MyCatalogsPanel({ enabled, onAddItem }: MyCatalogsPanelProps) {
  const { t } = useTranslation();
  const catalogsQuery = useUserCatalogs(enabled);
  const itemsQuery = useAllUserCatalogItems(enabled);

  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // "How many to add" per item, keyed by item id. Absent = 1.
  const [qtyByItemId, setQtyByItemId] = useState<Record<string, number>>({});

  const itemsByCatalog = useMemo(() => {
    const map = new Map<string, UserCatalogItem[]>();
    for (const item of itemsQuery.data ?? []) {
      const list = map.get(item.catalogId);
      if (list) list.push(item);
      else map.set(item.catalogId, [item]);
    }
    if (filter.trim()) {
      const query = filter.trim().toLowerCase();
      for (const [catalogId, list] of map) {
        map.set(
          catalogId,
          list.filter((item) => item.name.toLowerCase().includes(query)),
        );
      }
    }
    return map;
  }, [itemsQuery.data, filter]);

  const catalogs = catalogsQuery.data ?? [];
  const isLoading = catalogsQuery.isLoading || itemsQuery.isLoading;
  const hasFilter = filter.trim().length > 0;

  if (catalogsQuery.isError || itemsQuery.isError) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        {t("estimate.myCatalogs.loadError")}
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("estimate.constructor.catalogLoading")}
      </div>
    );
  }

  if (catalogs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <div className="rounded-full bg-muted p-3 text-muted-foreground">
          <Home className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="text-sm text-muted-foreground">
          {t("estimate.myCatalogs.emptyBody")}
        </p>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to={CATALOGS_TAB_URL}>
            <Upload className="h-4 w-4" />
            {t("estimate.myCatalogs.emptyCta")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t("estimate.myCatalogs.searchPlaceholder")}
            className="h-8 pl-8"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {catalogs.map((catalog) => {
          const items = itemsByCatalog.get(catalog.id) ?? [];
          if (hasFilter && items.length === 0) return null;
          const isOpen = hasFilter || (expanded[catalog.id] ?? false);
          return (
            <Collapsible
              key={catalog.id}
              open={isOpen}
              onOpenChange={(value) =>
                setExpanded((prev) => ({ ...prev, [catalog.id]: value }))
              }
              className="border-b border-border/60 last:border-b-0"
            >
              <CollapsibleTrigger asChild>
                <button type="button" className="flex w-full items-start gap-1 py-2 text-left">
                  <ChevronDown
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug">{catalog.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t("estimate.myCatalogs.itemCount", { count: items.length })}
                    </span>
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pb-2 pl-5">
                {items.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">
                    {t("estimate.constructor.catalogEmpty")}
                  </p>
                ) : (
                  items.map((item) => {
                    const qty = qtyByItemId[item.id] ?? 1;
                    return (
                      <div key={item.id} className="rounded-md px-2 py-2 hover:bg-accent/40">
                        <span className="block break-words text-sm leading-snug">{item.name}</span>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {formatCentsAsRub(item.priceCents)} ₽
                          </span>
                          <div className="flex items-center gap-2">
                            <QuantityStepper
                              className="shrink-0"
                              value={qty}
                              onChange={(next) => setQtyByItemId((prev) => ({ ...prev, [item.id]: next }))}
                              ariaLabel={item.name}
                              unitLabel={item.unit ? getUnitLabel(item.unit, t) : null}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-7 shrink-0 px-3"
                              onClick={() => {
                                onAddItem(item, qty);
                                setQtyByItemId((prev) => {
                                  const next = { ...prev };
                                  delete next[item.id];
                                  return next;
                                });
                              }}
                            >
                              {t("estimate.constructor.catalogAddAction")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </>
  );
}
