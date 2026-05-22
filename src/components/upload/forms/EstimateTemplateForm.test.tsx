import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";

const uploadMock = vi.fn();
vi.mock("@/components/upload/use-scoped-document-upload", () => ({
  useScopedDocumentUpload: () => uploadMock,
}));

import { EstimateTemplateForm } from "@/components/upload/forms/EstimateTemplateForm";

function renderForm(props: Partial<React.ComponentProps<typeof EstimateTemplateForm>> = {}) {
  return render(
    <TooltipProvider>
      <EstimateTemplateForm scope="personal" onBack={() => {}} onClose={() => {}} {...props} />
    </TooltipProvider>,
  );
}

describe("EstimateTemplateForm", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    uploadMock.mockResolvedValue({ documentId: "doc-1" });
  });

  it("Path A uploads the xlsx with the estimate_template_pending_ingest marker", async () => {
    const { container } = renderForm({ scope: "personal" });
    fireEvent.change(screen.getByPlaceholderText(/Turnkey house estimate/i), {
      target: { value: "My estimate" },
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "estimate.xlsx")] } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "estimate_template_pending_ingest", title: "My estimate" }),
    );
  });

  it("Path B (create from scratch) is disabled in 3.2.2", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /Create estimate from scratch/i })).toBeDisabled();
  });
});
