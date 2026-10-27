/**
 * rovno#237: the block is the viewer's only (any viewer regime), and only with
 * a real backend: demo mode has no published reports to read.
 */
export function showsViewerReports(modeKind: string, membershipRole: string | null | undefined): boolean {
  return modeKind === "supabase" && membershipRole === "viewer";
}

export function reportPath(projectId: string, reportId?: string): string {
  const base = `/project/${projectId}/reports`;
  return reportId ? `${base}?report=${encodeURIComponent(reportId)}` : base;
}
