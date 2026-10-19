import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const captureException = vi.fn();
vi.mock("@/lib/observability/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { queryClient } from "@/lib/query-client";
import { useAddCard } from "@/hooks/useAddCard";

function refusal(status: number, body: Record<string, unknown>) {
  return {
    data: null,
    error: new FunctionsHttpError(new Response(JSON.stringify(body), { status })),
  };
}

async function startBinding(): Promise<Error> {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useAddCard(), { wrapper });
  return result.current.mutateAsync().then(
    () => {
      throw new Error("expected the mutation to reject");
    },
    (error: Error) => error,
  );
}

describe("useAddCard refusals", () => {
  beforeEach(() => {
    invoke.mockReset();
    captureException.mockReset();
  });

  it("keeps the attempt limit out of the error tracker and shows the server text", async () => {
    invoke.mockResolvedValue(
      refusal(429, {
        error: "Too many card binding attempts",
        code: "attempt_limit",
        message: "Слишком много попыток привязки карты",
      }),
    );

    const error = await startBinding();

    expect(error.message).toBe("Слишком много попыток привязки карты");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("still reports a refusal with any other code", async () => {
    invoke.mockResolvedValue(refusal(502, { error: "Bank refused", code: "bank_error" }));

    const error = await startBinding();

    expect(error.message).toBe("Bank refused");
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("still reports the bank refusal tbank-add-card returns", async () => {
    invoke.mockResolvedValue(
      refusal(502, {
        error: "T-Bank rejected the card binding",
        error_code: "9999",
        message: "Bank refused",
      }),
    );

    await startBinding();

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("still reports a 429 that carries no code", async () => {
    invoke.mockResolvedValue(refusal(429, { error: "Too many requests" }));

    await startBinding();

    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
