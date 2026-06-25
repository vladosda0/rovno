import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const uploadMock = vi.fn();
vi.mock("@/components/upload/use-scoped-document-upload", () => ({
  useScopedDocumentUpload: () => uploadMock,
}));

import { DocumentForm } from "@/components/upload/forms/DocumentForm";

function renderForm(props: Partial<React.ComponentProps<typeof DocumentForm>> = {}) {
  return render(
    <DocumentForm
      scope="personal"
      onBack={() => {}}
      onClose={() => {}}
      {...props}
    />,
  );
}

function selectFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("DocumentForm", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    uploadMock.mockResolvedValue({ documentId: "doc-1" });
  });

  it("disables Save until a file is attached", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("uploads with the knowledge_base type and the active scope, then closes", async () => {
    const onClose = vi.fn();
    const onComplete = vi.fn();
    const { container } = renderForm({ scope: "project", projectId: "p1", onClose, onComplete });
    selectFile(container, new File(["x"], "act.pdf", { type: "application/pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "project", type: "knowledge_base", title: "act.pdf" }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ type: "document", scope: "project", documentId: "doc-1" }),
    );
  });
});
