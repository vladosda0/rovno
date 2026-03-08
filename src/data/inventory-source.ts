import type { SupabaseClient } from "@supabase/supabase-js";
import { listLocations } from "@/data/inventory-store";
import type { WorkspaceMode } from "@/data/workspace-source";
import { resolveWorkspaceMode } from "@/data/workspace-source";
import type { InventoryLocation } from "@/types/entities";
import type { Database as ProcurementDatabase } from "../../backend-truth/generated/supabase-types";

type InventoryLocationRow = ProcurementDatabase["public"]["Tables"]["inventory_locations"]["Row"];
type TypedSupabaseClient = SupabaseClient<ProcurementDatabase>;

export interface InventorySource {
  mode: WorkspaceMode["kind"];
  getProjectLocations: (projectId: string) => Promise<InventoryLocation[]>;
}

function createBrowserInventorySource(mode: "demo" | "local"): InventorySource {
  return {
    mode,
    async getProjectLocations(projectId: string) {
      return listLocations(projectId);
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

async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
}

function createSupabaseInventorySource(
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
