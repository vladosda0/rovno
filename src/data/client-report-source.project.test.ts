import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { fetchProjectReports } from "@/data/client-report-source";

function httpError(status: number) {
  return Object.assign(new Error(`status ${status}`), { context: new Response(null, { status }) });
}

const LIST = [{ id: "r1", period_start: "a", period_end: "b", published_at: "c" }];

describe("fetchProjectReports", () => {
  beforeEach(() => invoke.mockReset());

  it("asks get-project-report with the project and, when given, the report", async () => {
    invoke.mockResolvedValue({ data: { report: null, photos: [], reports: [], pdfAllowed: false }, error: null });
    await fetchProjectReports("p1");
    await fetchProjectReports("p1", "r1");
    expect(invoke).toHaveBeenNthCalledWith(1, "get-project-report", { body: { project_id: "p1" } });
    expect(invoke).toHaveBeenNthCalledWith(2, "get-project-report", { body: { project_id: "p1", report_id: "r1" } });
  });

  it("404 and 400 mean «no such report here»", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: httpError(404) });
    expect(await fetchProjectReports("p1", "r9")).toBeNull();
    invoke.mockResolvedValueOnce({ data: null, error: httpError(400) });
    expect(await fetchProjectReports("p1", "bad")).toBeNull();
  });

  it("401 and 500 are thrown, so the screen offers a retry", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: httpError(401) });
    await expect(fetchProjectReports("p1")).rejects.toThrow();
    invoke.mockResolvedValueOnce({ data: null, error: httpError(500) });
    await expect(fetchProjectReports("p1")).rejects.toThrow();
  });

  it("a project with no reports: no open report, an empty list", async () => {
    invoke.mockResolvedValue({ data: { report: null, photos: [], reports: [], pdfAllowed: true }, error: null });
    expect(await fetchProjectReports("p1")).toEqual({ shared: null, reports: [] });
  });

  it("a report: the list is returned alongside it, the body normalized", async () => {
    invoke.mockResolvedValue({
      data: {
        report: { id: "r1", period_start: "a", period_end: "b", published_at: "c", note: "", body: { project_title: "Ленина 42" } },
        photos: [],
        reports: LIST,
        pdfAllowed: true,
        expiresAt: "2099-01-01T00:00:00Z",
      },
      error: null,
    });
    const result = await fetchProjectReports("p1");
    expect(result?.reports).toEqual(LIST);
    expect(result?.shared?.report.body.done).toEqual([]);
    expect(result?.shared?.pdfAllowed).toBe(true);
  });

  it("an answer that is neither a report nor an empty project is not found", async () => {
    invoke.mockResolvedValue({ data: { report: [] }, error: null });
    expect(await fetchProjectReports("p1")).toBeNull();
  });
});
