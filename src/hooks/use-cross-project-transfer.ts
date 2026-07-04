import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { getOrdersSource } from "@/data/orders-source";
import {
  orderPlacedSupplierOrdersQueryRoot,
  orderProjectOrdersQueryRoot,
  orderQueryKeys,
} from "@/hooks/use-order-data";
import { procurementProjectItemsQueryRoot } from "@/hooks/use-procurement-source";
import { inventoryQueryKeys } from "@/hooks/use-inventory-data";
import { useToast } from "@/hooks/use-toast";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";

interface ReceivableTransfer {
  id: string;
  projectId: string;
  transferGroupId?: string | null;
  counterpartyProjectId?: string | null;
}

/**
 * Receive a placed cross-project stock transfer (source -qty, destination +qty) and refresh BOTH
 * projects' order / procurement / inventory caches so each side reflects the move. Supabase-only;
 * a no-op in demo/local mode. `receivingId` tracks the in-flight order so callers can disable the
 * exact row/button being received.
 */
export function useReceiveCrossProjectTransfer() {
  const workspaceMode = useWorkspaceMode();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [receivingId, setReceivingId] = useState<string | null>(null);

  const receive = useCallback(
    async (order: ReceivableTransfer): Promise<boolean> => {
      if (workspaceMode.kind !== "supabase" || !order.transferGroupId) return false;
      const profileId = workspaceMode.profileId;
      setReceivingId(order.id);
      try {
        const source = await getOrdersSource(workspaceMode);
        const result = await source.receiveCrossProjectStockTransfer(order.transferGroupId);
        const projectIds = [order.projectId, order.counterpartyProjectId].filter(
          (id): id is string => Boolean(id),
        );
        // Both linked orders (this 'in' order + its paired 'out' order) flip to 'received', so
        // refresh both order-detail caches, not just the one acted on — otherwise a directly-open
        // source-side (out) detail view stays stale at 'placed'.
        const orderIds = [order.id, result.fromOrderId, result.toOrderId].filter(
          (id): id is string => Boolean(id),
        );
        await Promise.all([
          ...projectIds.flatMap((pid) => [
            queryClient.invalidateQueries({ queryKey: orderProjectOrdersQueryRoot(profileId, pid) }),
            queryClient.invalidateQueries({ queryKey: orderPlacedSupplierOrdersQueryRoot(profileId, pid) }),
            queryClient.invalidateQueries({ queryKey: procurementProjectItemsQueryRoot(profileId, pid) }),
            queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.projectStock(profileId, pid) }),
            queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.projectLocations(profileId, pid) }),
          ]),
          ...orderIds.map((oid) =>
            queryClient.invalidateQueries({ queryKey: orderQueryKeys.orderById(profileId, oid) }),
          ),
          queryClient.invalidateQueries({
            queryKey: orderQueryKeys.placedSupplierOrdersAllProjects(profileId),
          }),
        ]);
        toast({ title: t("procurement.orderDetail.transferReceived") });
        return true;
      } catch (error) {
        toast({
          title: t("procurement.orderDetail.transferReceiveFailed"),
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
        return false;
      } finally {
        setReceivingId(null);
      }
    },
    [workspaceMode, queryClient, toast, t],
  );

  return { receive, receivingId };
}
