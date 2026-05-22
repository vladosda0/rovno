import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { UploadScope, UploadType } from "@/components/upload/types";

vi.mock("@/components/upload/Step1TypeSelection", () => ({
  Step1TypeSelection: ({ onSelect }: { onSelect: (t: UploadType) => void }) => (
    <div>
      <button onClick={() => onSelect("document")}>pick-document</button>
      <button onClick={() => onSelect("visitka")}>pick-visitka</button>
    </div>
  ),
}));
vi.mock("@/components/upload/Step2ScopeSelection", () => ({
  Step2ScopeSelection: ({
    onNext,
    onBack,
  }: {
    onNext: (s: UploadScope) => void;
    onBack: () => void;
  }) => (
    <div>
      <span>step2-marker</span>
      <button onClick={() => onNext("personal")}>to-step3</button>
      <button onClick={onBack}>back-to-1</button>
    </div>
  ),
}));
vi.mock("@/components/upload/forms/DocumentForm", () => ({
  DocumentForm: ({ onBack }: { onBack: () => void }) => (
    <div>
      <span>document-form</span>
      <button onClick={onBack}>back-to-2</button>
    </div>
  ),
}));
vi.mock("@/components/upload/forms/CatalogForm", () => ({ CatalogForm: () => <div>catalog-form</div> }));
vi.mock("@/components/upload/forms/EstimateTemplateForm", () => ({
  EstimateTemplateForm: () => <div>estimate-form</div>,
}));
vi.mock("@/components/upload/forms/VisitkaForm", () => ({
  VisitkaForm: ({ onBack }: { onBack: () => void }) => (
    <div>
      <span>visitka-form</span>
      <button onClick={onBack}>back-from-visitka</button>
    </div>
  ),
}));

import { MultiStepUploadModal } from "@/components/upload/MultiStepUploadModal";

describe("MultiStepUploadModal", () => {
  it("walks Step1 → Step2 → Step3 and back again", () => {
    render(<MultiStepUploadModal open onOpenChange={() => {}} />);
    // Step 1
    expect(screen.getByText("pick-document")).toBeInTheDocument();
    fireEvent.click(screen.getByText("pick-document"));
    // Step 2
    expect(screen.getByText("step2-marker")).toBeInTheDocument();
    fireEvent.click(screen.getByText("to-step3"));
    // Step 3 (document)
    expect(screen.getByText("document-form")).toBeInTheDocument();
    // Back to Step 2
    fireEvent.click(screen.getByText("back-to-2"));
    expect(screen.getByText("step2-marker")).toBeInTheDocument();
    // Back to Step 1
    fireEvent.click(screen.getByText("back-to-1"));
    expect(screen.getByText("pick-document")).toBeInTheDocument();
  });

  it("with presetType=document opens directly at Step 2", () => {
    render(<MultiStepUploadModal open onOpenChange={() => {}} presetType="document" />);
    expect(screen.getByText("step2-marker")).toBeInTheDocument();
    expect(screen.queryByText("pick-document")).not.toBeInTheDocument();
  });

  it("with presetType=visitka skips Step 2 and opens the visitka form", () => {
    render(<MultiStepUploadModal open onOpenChange={() => {}} presetType="visitka" />);
    expect(screen.getByText("visitka-form")).toBeInTheDocument();
    expect(screen.queryByText("step2-marker")).not.toBeInTheDocument();
  });

  it("visitka Back returns to Step 1 (type switch)", () => {
    render(<MultiStepUploadModal open onOpenChange={() => {}} presetType="visitka" />);
    fireEvent.click(screen.getByText("back-from-visitka"));
    expect(screen.getByText("pick-document")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onOpenChange = vi.fn();
    render(<MultiStepUploadModal open onOpenChange={onOpenChange} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
