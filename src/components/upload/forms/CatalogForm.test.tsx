import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import type { ParsePriceListSuccess } from "@/types/user-catalog";
import { loadCatalogDraft } from "@/lib/user-catalog/draft-storage";

const parseMock = vi.fn();
vi.mock("@/hooks/use-parse-price-list", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-parse-price-list")>();
  return {
    ...actual,
    useParsePriceList: () => ({ isPending: false, mutateAsync: parseMock }),
  };
});

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

let workspaceKind: "supabase" | "local" = "supabase";
vi.mock("@/hooks/use-workspace-source", () => ({
  useWorkspaceMode: () =>
    workspaceKind === "supabase"
      ? { kind: "supabase", profileId: "profile-1" }
      : { kind: "local" },
}));

import { CatalogForm } from "@/components/upload/forms/CatalogForm";
import { ParsePriceListError } from "@/hooks/use-parse-price-list";

const PARSE_SUCCESS: ParsePriceListSuccess = {
  ok: true,
  fileName: "прайс.xlsx",
  totalDataRows: 1,
  truncated: false,
  rows: [
    {
      index: 0,
      sourceRowNumber: 2,
      name: "Песок речной",
      unit: "m³",
      unitIsCanonical: true,
      priceCents: 85000,
      priceRaw: "850",
      resourceType: "material",
      typeAutoFilled: false,
      supplierSku: "",
      issues: [],
      severity: "ok",
    },
  ],
};

function renderForm(props: Partial<React.ComponentProps<typeof CatalogForm>> = {}) {
  return render(<CatalogForm onBack={() => {}} onClose={() => {}} {...props} />);
}

function pickFile(container: HTMLElement, name = "прайс.xlsx") {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], name)] } });
}

describe("CatalogForm (User Catalog Upload v1)", () => {
  beforeEach(() => {
    parseMock.mockReset();
    navigateMock.mockReset();
    workspaceKind = "supabase";
    localStorage.clear();
  });

  it("links the static Excel template", () => {
    renderForm();
    const link = screen.getByRole("link", { name: /download excel template/i });
    expect(link).toHaveAttribute("href", "/templates/rovno-price-list-template.xlsx");
    expect(link).toHaveAttribute("download");
  });

  it("parses the picked file, stores a draft and navigates to the review page", async () => {
    parseMock.mockResolvedValue(PARSE_SUCCESS);
    const onClose = vi.fn();
    const { container } = renderForm({ onClose });

    pickFile(container);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1));
    const target = navigateMock.mock.calls[0][0] as string;
    expect(target).toMatch(/^\/home\/catalogs\/upload-review\/[0-9a-f-]{36}$/);

    const uploadId = target.split("/").pop() as string;
    const draft = loadCatalogDraft(uploadId);
    expect(draft).not.toBeNull();
    expect(draft?.rows).toHaveLength(1);
    expect(draft?.rows[0].name).toBe("Песок речной");
    expect(draft?.rows[0].priceInput).toBe("850");
    expect(draft?.catalogName).toBe("прайс");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the template hint on BAD_HEADERS failures", async () => {
    parseMock.mockRejectedValue(new ParsePriceListError("BAD_HEADERS"));
    const { container } = renderForm();

    pickFile(container, "другое.xlsx");

    await waitFor(() =>
      expect(screen.getByText(/headers must match/i)).toBeInTheDocument(),
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("asks the guest to sign in instead of offering the file picker", () => {
    workspaceKind = "local";
    const { container } = renderForm();
    expect(screen.getByText(/sign in to upload/i)).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });
});
