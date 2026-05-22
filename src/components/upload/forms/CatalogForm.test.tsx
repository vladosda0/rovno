import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const uploadMock = vi.fn();
vi.mock("@/components/upload/use-scoped-document-upload", () => ({
  useScopedDocumentUpload: () => uploadMock,
}));

import { CatalogForm } from "@/components/upload/forms/CatalogForm";

function renderForm(props: Partial<React.ComponentProps<typeof CatalogForm>> = {}) {
  return render(
    <CatalogForm scope="personal" onBack={() => {}} onClose={() => {}} {...props} />,
  );
}

function fillTitleAndFile(container: HTMLElement, title: string) {
  fireEvent.change(screen.getByPlaceholderText(/price list/i), { target: { value: title } });
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "catalog.xlsx")] } });
}

describe("CatalogForm", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    uploadMock.mockResolvedValue({ documentId: "doc-1" });
  });

  it("uploads with the catalog_pending_ingest type marker", async () => {
    const { container } = renderForm({ scope: "personal" });
    fillTitleAndFile(container, "Supplier prices");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "personal", type: "catalog_pending_ingest", title: "Supplier prices" }),
    );
  });

  it("for Public scope, Save is gated on the markup-consent checkbox", async () => {
    const { container } = renderForm({ scope: "public" });
    fillTitleAndFile(container, "Public catalog");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "public", type: "catalog_pending_ingest" }),
    ));
  });
});
