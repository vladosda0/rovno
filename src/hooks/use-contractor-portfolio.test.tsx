import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const reorderMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/data/contractor-portfolio-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/contractor-portfolio-source")>()),
  fetchPortfolioObjects: (...args: unknown[]) => fetchMock(...args),
  reorderPortfolioObjects: (...args: unknown[]) => reorderMock(...args),
}));

import { contractorPortfolioQueryKey, useContractorPortfolioMutations } from "@/hooks/use-contractor-portfolio";

const objects = ["a", "b", "c"].map((id, position) => ({ id, org_id: "o1", title: id, photos: ["https://x/1.jpg"], position }));

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  queryClient.setQueryData(contractorPortfolioQueryKey("o1"), objects);
  fetchMock.mockImplementation(() => new Promise(() => {}));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useContractorPortfolioMutations("o1"), { wrapper });
  const ids = () => (queryClient.getQueryData(contractorPortfolioQueryKey("o1")) as typeof objects).map((o) => o.id);
  return { result, ids };
}

describe("useContractorPortfolioMutations.reorder", () => {
  it("shows the new order at once and sends it whole", async () => {
    let resolve!: () => void;
    reorderMock.mockReset().mockImplementation(() => new Promise<void>((r) => (resolve = r)));
    const { result, ids } = setup();
    act(() => result.current.reorder.mutate(["c", "a", "b"]));
    await waitFor(() => expect(ids()).toEqual(["c", "a", "b"]));
    expect(reorderMock).toHaveBeenCalledWith("o1", ["c", "a", "b"]);
    resolve();
  });

  it("rolls the order back when the server refuses", async () => {
    reorderMock.mockReset().mockRejectedValue(new Error("denied"));
    const { result, ids } = setup();
    act(() => result.current.reorder.mutate(["c", "a", "b"]));
    await waitFor(() => expect(result.current.reorder.isError).toBe(true));
    expect(ids()).toEqual(["a", "b", "c"]);
  });
});
