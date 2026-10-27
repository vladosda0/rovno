import { useQuery } from "@tanstack/react-query";
import { fetchProjectReports } from "@/data/client-report-source";

const PROJECT_REPORTS_STALE_TIME_MS = 5 * 60_000;

export function projectReportsQueryKey(projectId: string, reportId: string | null) {
  return ["project-reports", projectId, reportId] as const;
}

/** The project's published reports for a signed-in participant (rovno#237). */
export function useProjectReports(projectId: string, reportId: string | null, enabled = true) {
  return useQuery({
    queryKey: projectReportsQueryKey(projectId, reportId),
    queryFn: () => fetchProjectReports(projectId, reportId),
    enabled: enabled && Boolean(projectId),
    staleTime: PROJECT_REPORTS_STALE_TIME_MS,
    retry: 1,
    // Keep the previous answer while another report of the SAME project loads;
    // another project's reports are never shown in its place.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === projectId ? previous : undefined,
  });
}
