import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContextInspector } from "@/components/ai/ContextInspector";
import { __unsafeResetStoreForTests } from "@/data/store";
import {
  __unsafeResetEstimateV2ForTests,
  createLine,
  getEstimateV2ProjectState,
} from "@/data/estimate-v2-store";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";

function renderContextInspector(projectId: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ContextInspector projectId={projectId} />
    </QueryClientProvider>,
  );
}

describe("ContextInspector", () => {
  beforeEach(() => {
    sessionStorage.clear();
    __unsafeResetStoreForTests();
    __unsafeResetEstimateV2ForTests();
    clearDemoSession();
    enterDemoSession("project-1");
    setAuthRole("owner");
  });

  it("reports estimate-v2 summary fields instead of legacy estimate version metadata", () => {
    const state = getEstimateV2ProjectState("project-1");
    const work = state.works[0];
    if (!work) {
      throw new Error("Expected seeded estimate-v2 work scaffold");
    }
    createLine("project-1", {
      stageId: work.stageId,
      workId: work.id,
      title: "Inspector line",
      type: "material",
      qtyMilli: 1_000,
      costUnitCents: 50_000,
    });

    renderContextInspector("project-1");

    const output = screen.getByText((_, element) => element?.tagName.toLowerCase() === "pre");
    expect(output).toHaveTextContent("\"hasEstimate\":");
    expect(output).toHaveTextContent("\"lines\":");
    expect(output).not.toHaveTextContent("\"versions\":");
  });
});
