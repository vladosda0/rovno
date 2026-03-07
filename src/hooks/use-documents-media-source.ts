import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import * as store from "@/data/store";
import { getDocumentsMediaSource } from "@/data/documents-media-source";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import type { Document, Media } from "@/types/entities";

const DOCUMENTS_MEDIA_QUERY_STALE_TIME_MS = 60_000;
const EMPTY_PROJECT_DOCUMENTS: Document[] = [];
const EMPTY_PROJECT_MEDIA: Media[] = [];

export const documentsMediaQueryKeys = {
  projectDocuments: (profileId: string, projectId: string) =>
    ["documents-media", "project-documents", profileId, projectId] as const,
  projectMedia: (profileId: string, projectId: string) =>
    ["documents-media", "project-media", profileId, projectId] as const,
};

function useStoreValue<T>(getter: () => T, enabled: boolean, fallback: T): T {
  const [value, setValue] = useState<T>(() => enabled ? getter() : fallback);

  useEffect(() => {
    if (!enabled) {
      setValue(fallback);
      return;
    }

    setValue(getter());
    const update = () => setValue(getter());
    return store.subscribe(update);
  }, [enabled, fallback, getter]);

  return enabled ? value : fallback;
}

export function useProjectDocuments(projectId: string): Document[] {
  const mode = useWorkspaceMode();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const getDocuments = useCallback(() => store.getDocuments(projectId), [projectId]);
  const browserDocuments = useStoreValue(
    getDocuments,
    mode.kind === "demo" || mode.kind === "local",
    EMPTY_PROJECT_DOCUMENTS,
  );
  const documentsQuery = useQuery({
    queryKey: supabaseMode
      ? documentsMediaQueryKeys.projectDocuments(supabaseMode.profileId, projectId)
      : documentsMediaQueryKeys.projectDocuments("browser", projectId),
    queryFn: async () => {
      const source = await getDocumentsMediaSource(supabaseMode ?? undefined);
      return source.getProjectDocuments(projectId);
    },
    enabled: Boolean(supabaseMode && projectId),
    staleTime: DOCUMENTS_MEDIA_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return browserDocuments;
  }

  return documentsQuery.data ?? EMPTY_PROJECT_DOCUMENTS;
}

export function useProjectMedia(projectId: string): Media[] {
  const mode = useWorkspaceMode();
  const supabaseMode = mode.kind === "supabase" ? mode : null;
  const getMedia = useCallback(() => store.getMedia(projectId), [projectId]);
  const browserMedia = useStoreValue(
    getMedia,
    mode.kind === "demo" || mode.kind === "local",
    EMPTY_PROJECT_MEDIA,
  );
  const mediaQuery = useQuery({
    queryKey: supabaseMode
      ? documentsMediaQueryKeys.projectMedia(supabaseMode.profileId, projectId)
      : documentsMediaQueryKeys.projectMedia("browser", projectId),
    queryFn: async () => {
      const source = await getDocumentsMediaSource(supabaseMode ?? undefined);
      return source.getProjectMedia(projectId);
    },
    enabled: Boolean(supabaseMode && projectId),
    staleTime: DOCUMENTS_MEDIA_QUERY_STALE_TIME_MS,
  });

  if (mode.kind === "demo" || mode.kind === "local") {
    return browserMedia;
  }

  return mediaQuery.data ?? EMPTY_PROJECT_MEDIA;
}
