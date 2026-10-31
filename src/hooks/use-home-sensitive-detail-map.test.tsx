import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { __unsafeResetStoreForTests } from "@/data/store";
import { useWorkspaceProjectsSensitiveDetailMap } from "@/hooks/use-home-sensitive-detail-map";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("useWorkspaceProjectsSensitiveDetailMap finance access", () => {
  beforeEach(() => {
    sessionStorage.clear();
    __unsafeResetStoreForTests();
    clearDemoSession();
    enterDemoSession("project-1");
  });

  it("gives an owner full row access", () => {
    setAuthRole("owner");
    const { result } = renderHook(() => useWorkspaceProjectsSensitiveDetailMap(), { wrapper });

    expect(result.current.financeAccessByProjectId.get("project-1")).toBe("full");
    expect(result.current.canViewSensitiveDetailByProjectId.get("project-1")).toBe(true);
  });

  it("does not give a viewer full row access", () => {
    setAuthRole("viewer");
    const { result } = renderHook(() => useWorkspaceProjectsSensitiveDetailMap(), { wrapper });

    expect(result.current.financeAccessByProjectId.has("project-1")).toBe(true);
    expect(result.current.financeAccessByProjectId.get("project-1")).not.toBe("full");
    expect(result.current.canViewSensitiveDetailByProjectId.get("project-1")).toBe(false);
  });
});
