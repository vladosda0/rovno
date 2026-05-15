import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StorageObjectMeta } from "@/types/entities";

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const STALE_TIME_MS = 50 * 60 * 1000;
const GC_TIME_MS = 60 * 60 * 1000;

export interface MediaSignedUrlResult {
  url: string | null;
  loading: boolean;
}

export function useMediaSignedUrl(
  storage: StorageObjectMeta | null | undefined,
): MediaSignedUrlResult {
  const bucket = storage?.bucket;
  const objectPath = storage?.objectPath;

  const query = useQuery({
    queryKey: ["storage-signed-url", bucket ?? "", objectPath ?? ""],
    queryFn: async () => {
      if (!bucket || !objectPath) return null;
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    },
    enabled: Boolean(bucket && objectPath),
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
  });

  return {
    url: query.data ?? null,
    loading: query.isLoading,
  };
}
