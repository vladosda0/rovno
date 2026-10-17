import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@tanstack/react-query";

const state = vi.hoisted(() => ({ signedOutAt: null as number | null }));

vi.mock("@/lib/observability/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/hooks/use-runtime-auth", () => ({ getSignedOutSince: () => state.signedOutAt }));

import { captureException } from "@/lib/observability/sentry";
import { queryClient } from "@/lib/query-client";

const anonDenied = { code: "42501", message: "permission denied for table profiles" };
const query = { queryKey: ["workspace", "current-user", "profile-1"] } as unknown as Query;

function failQuery() {
  queryClient.getQueryCache().config.onError?.(anonDenied as unknown as Error, query);
}

describe("query errors racing a sign-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.signedOutAt = null;
  });

  it("does not report an anon refusal that lands right after the sign-out", () => {
    state.signedOutAt = Date.now();
    failQuery();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("still reports the same refusal when nobody signed out", () => {
    failQuery();
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
