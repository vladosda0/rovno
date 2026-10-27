import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ProjectReports } from "@/data/client-report-source";

const pending: Record<string, (value: ProjectReports | null) => void> = {};
vi.mock("@/data/client-report-source", () => ({
  fetchProjectReports: (projectId: string, reportId?: string | null) =>
    new Promise<ProjectReports | null>((resolve) => { pending[`${projectId}:${reportId ?? ""}`] = resolve; }),
}));

import { useProjectReports } from "@/hooks/use-project-reports";

const list = (id: string) => ({ shared: null, reports: [{ id, period_start: "a", period_end: "b", published_at: "c" }] });

describe("useProjectReports", () => {
  it("does not show one project's reports while another project's load", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ projectId, reportId }: { projectId: string; reportId: string | null }) => useProjectReports(projectId, reportId),
      { wrapper, initialProps: { projectId: "A", reportId: null } },
    );
    await waitFor(() => expect(pending["A:"]).toBeDefined());
    pending["A:"](list("from-A"));
    await waitFor(() => expect(result.current.data?.reports[0].id).toBe("from-A"));

    // Another report of the same project: the previous answer stays on screen.
    rerender({ projectId: "A", reportId: "r2" });
    expect(result.current.data?.reports[0].id).toBe("from-A");
    expect(result.current.isPlaceholderData).toBe(true);

    rerender({ projectId: "B", reportId: null });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });
});
