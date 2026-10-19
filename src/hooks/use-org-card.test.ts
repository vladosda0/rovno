import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { orgsQuery, mode } = vi.hoisted(() => ({
  orgsQuery: { current: { data: undefined as unknown, isSuccess: false } },
  mode: { current: { kind: "supabase", profileId: "me" } as { kind: string; profileId?: string } },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-workspace-source", () => ({ useWorkspaceMode: () => mode.current }));
vi.mock("@/hooks/use-orgs", () => ({ useUserOrganizations: () => orgsQuery.current }));

import { useOrgCardScope } from "@/hooks/use-org-card";

const org = { id: "org-1", role: "member" as const };

describe("useOrgCardScope", () => {
  beforeEach(() => {
    mode.current = { kind: "supabase", profileId: "me" };
  });

  it("waits for the organization list instead of falling back to the profile", () => {
    orgsQuery.current = { data: undefined, isSuccess: false };
    const { result } = renderHook(() => useOrgCardScope("p1", null));
    expect(result.current).toBeNull();
  });

  it("uses the organization once the list has loaded", () => {
    orgsQuery.current = { data: [{ ...org, isActiveContext: true }], isSuccess: true };
    const { result } = renderHook(() => useOrgCardScope("p1", org));
    expect(result.current).toEqual({ kind: "org", orgId: "org-1", canEdit: false });
  });

  it("uses the profile when the loaded list has no active organization", () => {
    orgsQuery.current = { data: [], isSuccess: true };
    const { result } = renderHook(() => useOrgCardScope("p1", null));
    expect(result.current).toEqual({ kind: "profile", profileId: "me", projectId: "p1" });
  });

  it("keeps the organization when a refetch of the list fails", () => {
    orgsQuery.current = { data: [{ ...org, isActiveContext: true }], isSuccess: false };
    const { result } = renderHook(() => useOrgCardScope("p1", org));
    expect(result.current).toEqual({ kind: "org", orgId: "org-1", canEdit: false });
  });

  it("keeps requisites in this browser in the demo workspace", () => {
    mode.current = { kind: "demo" };
    orgsQuery.current = { data: undefined, isSuccess: false };
    const { result } = renderHook(() => useOrgCardScope("p1", null));
    expect(result.current).toEqual({ kind: "device", key: "local:p1" });
  });
});
