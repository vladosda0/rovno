import { useMutation } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  ParsePriceListFailureCode,
  ParsePriceListSuccess,
} from "@/types/user-catalog";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_UPLOAD_EXTENSIONS = /\.(xlsx|xls|csv)$/i;

/** Typed failure so the form can pick a localized message by code. */
export class ParsePriceListError extends Error {
  readonly code: ParsePriceListFailureCode | string;

  constructor(code: ParsePriceListFailureCode | string, message?: string) {
    super(message ?? code);
    this.name = "ParsePriceListError";
    this.code = code;
  }
}

function extractFailureCode(body: unknown): { code: string; message?: string } | null {
  if (body && typeof body === "object" && "code" in body) {
    const code = (body as { code?: unknown }).code;
    const message = (body as { message?: unknown }).message;
    if (typeof code === "string") {
      return { code, message: typeof message === "string" ? message : undefined };
    }
  }
  return null;
}

/**
 * Synchronous parse of a price-list file via the parse-price-list edge
 * function. Client pre-checks (size/extension) fail fast without a network
 * round-trip; the server enforces the same limits authoritatively.
 */
export function useParsePriceList() {
  return useMutation({
    mutationFn: async (file: File): Promise<ParsePriceListSuccess> => {
      if (file.size === 0) {
        throw new ParsePriceListError("EMPTY_FILE");
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new ParsePriceListError("TOO_LARGE");
      }
      if (!ACCEPTED_UPLOAD_EXTENSIONS.test(file.name)) {
        throw new ParsePriceListError("UNSUPPORTED_FORMAT");
      }

      const formData = new FormData();
      formData.append("file", file, file.name);

      const { data, error } = await supabase.functions.invoke("parse-price-list", {
        body: formData,
      });

      if (error) {
        // FunctionsHttpError carries the raw Response in error.context — the
        // 4xx body is our typed { ok:false, code } failure payload.
        if (typeof error === "object" && error !== null && "context" in error) {
          const ctx = (error as { context?: unknown }).context;
          if (typeof Response !== "undefined" && ctx instanceof Response) {
            const raw = await ctx.clone().text().catch(() => "");
            try {
              const failure = extractFailureCode(JSON.parse(raw));
              if (failure) throw new ParsePriceListError(failure.code, failure.message);
            } catch (parseError) {
              if (parseError instanceof ParsePriceListError) throw parseError;
            }
          }
        }
        throw new ParsePriceListError("PARSE_FAILED", error.message);
      }

      const failure = extractFailureCode(data);
      if (failure && (data as { ok?: unknown }).ok === false) {
        throw new ParsePriceListError(failure.code, failure.message);
      }

      return data as ParsePriceListSuccess;
    },
  });
}
