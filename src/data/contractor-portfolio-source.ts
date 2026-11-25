import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Same untyped client as contractor-profile-source: the table reaches the
// generated Database type only with the backend-truth sync.
const rawSupabase = supabase as unknown as SupabaseClient;

/** Limits of the form; the database holds the same ones (rovno#294). */
export const PORTFOLIO_MAX_OBJECTS = 12;
export const PORTFOLIO_MAX_PHOTOS = 10;
export const PORTFOLIO_TITLE_MAX = 80;
/** Longest edge of a portfolio photo: six covers of 4 MB are too heavy on a phone. */
export const PORTFOLIO_PHOTO_EDGE = 2048;

export interface PortfolioObject {
  id: string;
  org_id: string;
  title: string;
  /** Public URLs; the first one is the cover. */
  photos: string[];
  position: number;
}

export interface PortfolioObjectInput {
  title: string;
  photos: string[];
}

const COLUMNS = "id, org_id, title, photos, position";

function toObject(row: Record<string, unknown>): PortfolioObject {
  const photos = Array.isArray(row.photos) ? row.photos.filter((p): p is string => typeof p === "string") : [];
  return {
    id: String(row.id),
    org_id: String(row.org_id),
    title: String(row.title ?? ""),
    photos,
    position: Number(row.position ?? 0),
  };
}

export async function fetchPortfolioObjects(orgId: string): Promise<PortfolioObject[]> {
  const { data, error } = await rawSupabase
    .from("contractor_portfolio_objects")
    .select(COLUMNS)
    .eq("org_id", orgId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => toObject(row as Record<string, unknown>));
}

export async function createPortfolioObject(orgId: string, input: PortfolioObjectInput): Promise<PortfolioObject> {
  const { data, error } = await rawSupabase
    .from("contractor_portfolio_objects")
    .insert({ org_id: orgId, title: input.title.trim(), photos: input.photos })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toObject(data as Record<string, unknown>);
}

export async function updatePortfolioObject(id: string, input: PortfolioObjectInput): Promise<PortfolioObject> {
  const { data, error } = await rawSupabase
    .from("contractor_portfolio_objects")
    .update({ title: input.title.trim(), photos: input.photos })
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toObject(data as Record<string, unknown>);
}

export async function deletePortfolioObject(id: string): Promise<void> {
  const { data, error } = await rawSupabase.from("contractor_portfolio_objects").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Portfolio object was not deleted");
}

export async function reorderPortfolioObjects(orgId: string, ids: string[]): Promise<void> {
  const { error } = await rawSupabase.rpc("reorder_contractor_portfolio_objects", { p_org_id: orgId, p_ids: ids });
  if (error) throw error;
}

// The public bucket useAvatarUpload writes portfolio photos to.
const PHOTOS_BUCKET = "avatars";
const PUBLIC_PREFIX = `/storage/v1/object/public/${PHOTOS_BUCKET}/`;

/**
 * Storage paths of the photos the person uploaded themselves. A photo under
 * another admin's prefix is skipped: the bucket lets only its owner delete it.
 */
export function ownPhotoPaths(urls: string[], uid: string): string[] {
  const paths: string[] = [];
  for (const url of urls) {
    let path: string;
    try {
      const pathname = new URL(url).pathname;
      const at = pathname.indexOf(PUBLIC_PREFIX);
      if (at < 0) continue;
      path = decodeURIComponent(pathname.slice(at + PUBLIC_PREFIX.length));
    } catch {
      continue;
    }
    if (path.startsWith(`${uid}/`) && !path.includes("..")) paths.push(path);
  }
  return paths;
}

/** Best effort: a file left behind costs storage, not correctness. */
export async function removeOwnPhotos(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return;
    const paths = ownPhotoPaths(urls, uid);
    if (paths.length === 0) return;
    await supabase.storage.from(PHOTOS_BUCKET).remove(paths);
  } catch {
    // ignored on purpose, see above
  }
}
