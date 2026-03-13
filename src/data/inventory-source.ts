import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createLocation,
  listLocations,
  listStockByProject,
  type InventoryStockRow,
} from "@/data/inventory-store";
import { normalizeName } from "@/lib/procurement-utils";
import type { WorkspaceMode } from "@/data/workspace-source";
import { resolveWorkspaceMode } from "@/data/workspace-source";
import type { InventoryLocation } from "@/types/entities";
import type { Database as ProcurementDatabase } from "../../backend-truth/generated/supabase-types";

type InventoryLocationRow = ProcurementDatabase["public"]["Tables"]["inventory_locations"]["Row"];
type InventoryLocationInsert = ProcurementDatabase["public"]["Tables"]["inventory_locations"]["Insert"];
type InventoryItemRow = ProcurementDatabase["public"]["Tables"]["inventory_items"]["Row"];
type InventoryBalanceRow = ProcurementDatabase["public"]["Tables"]["inventory_balances"]["Row"];
type TypedSupabaseClient = SupabaseClient<ProcurementDatabase>;

export interface InventorySource {
  mode: WorkspaceMode["kind"];
  getProjectLocations: (projectId: string) => Promise<InventoryLocation[]>;
  createProjectLocation: (
    projectId: string,
    input: { name: string; address?: string | null },
  ) => Promise<InventoryLocation>;
  getProjectStock: (projectId: string) => Promise<InventoryStockRow[]>;
}

function createBrowserInventorySource(mode: "demo" | "local"): InventorySource {
  return {
    mode,
    async getProjectLocations(projectId: string) {
      return listLocations(projectId);
    },
    async createProjectLocation(projectId: string, input: { name: string; address?: string | null }) {
      return createLocation(projectId, {
        name: input.name,
        address: input.address ?? undefined,
      });
    },
    async getProjectStock(projectId: string) {
      return listStockByProject(projectId);
    },
  };
}

export function mapInventoryLocationRowToLocation(
  row: InventoryLocationRow,
): InventoryLocation {
  return {
    id: row.id,
    name: row.title,
    address: row.description ?? undefined,
    isDefault: false,
  };
}

export function mapInventoryItemRowToStockKey(
  row: Pick<InventoryItemRow, "title" | "unit" | "notes">,
): string {
  return [
    normalizeName(row.title),
    row.notes ? normalizeName(row.notes) : "",
    row.unit.trim().toLowerCase(),
  ].join("|");
}

export function mapInventoryBalanceRowsToStockRows(input: {
  balanceRows: InventoryBalanceRow[];
  inventoryItemRows: InventoryItemRow[];
}): InventoryStockRow[] {
  const itemById = new Map(input.inventoryItemRows.map((row) => [row.id, row]));

  return input.balanceRows
    .filter((row) => row.quantity > 0 && !!row.inventory_location_id)
    .map((row) => {
      const inventoryItem = itemById.get(row.inventory_item_id);
      if (!inventoryItem || !row.inventory_location_id) {
        return null;
      }

      return {
        projectId: row.project_id,
        locationId: row.inventory_location_id,
        inventoryKey: mapInventoryItemRowToStockKey(inventoryItem),
        qty: row.quantity,
      } satisfies InventoryStockRow;
    })
    .filter((row): row is InventoryStockRow => !!row);
}

async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
}

export function createSupabaseInventorySource(
  supabase: TypedSupabaseClient,
): InventorySource {
  return {
    mode: "supabase",
    async getProjectLocations(projectId: string) {
      const { data, error } = await supabase
        .from("inventory_locations")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []).map(mapInventoryLocationRowToLocation);
    },
    async createProjectLocation(projectId: string, input: { name: string; address?: string | null }) {
      const name = input.name.trim();
      if (!name) {
        throw new Error("Location name is required");
      }

      const insert: InventoryLocationInsert = {
        project_id: projectId,
        title: name,
        description: input.address?.trim() ?? null,
      };

      const { data, error } = await supabase
        .from("inventory_locations")
        .insert(insert)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return mapInventoryLocationRowToLocation(data);
    },
    async getProjectStock(projectId: string) {
      const { data: balanceRows, error: balanceError } = await supabase
        .from("inventory_balances")
        .select("*")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false });

      if (balanceError) {
        throw balanceError;
      }

      const balances = balanceRows ?? [];
      if (balances.length === 0) {
        return [];
      }

      const inventoryItemIds = Array.from(new Set(balances.map((row) => row.inventory_item_id)));
      const { data: inventoryItemRows, error: inventoryItemsError } = await supabase
        .from("inventory_items")
        .select("*")
        .in("id", inventoryItemIds);

      if (inventoryItemsError) {
        throw inventoryItemsError;
      }

      return mapInventoryBalanceRowsToStockRows({
        balanceRows: balances,
        inventoryItemRows: inventoryItemRows ?? [],
      });
    },
  };
}

export async function getInventorySource(
  mode?: WorkspaceMode,
): Promise<InventorySource> {
  const resolvedMode = mode ?? await resolveWorkspaceMode();
  if (resolvedMode.kind !== "supabase") {
    return createBrowserInventorySource(resolvedMode.kind);
  }

  const supabase = await loadSupabaseClient();
  return createSupabaseInventorySource(supabase);
}
