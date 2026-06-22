import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { LibraryNameInput } from "@/components/estimate-v2/LibraryNameInput";
import { useCanonicalSearch, type CanonicalSuggestion } from "@/hooks/use-canonical-search";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/use-debounce", () => ({ useDebounce: <T,>(value: T) => value }));
vi.mock("@/hooks/use-canonical-search", () => ({ useCanonicalSearch: vi.fn() }));

const mockSearch = useCanonicalSearch as unknown as Mock;

const resourceSuggestion: CanonicalSuggestion = {
  id: "a1",
  kind: "resource",
  name: "Песок речной",
  badgeType: "material",
  source: "rovno_seed",
  isPersonal: false,
  templateId: null,
  workStageName: null,
  subcategory: "Сыпучие и грунты",
  unit: "м³",
  rovnoSku: "RS-SAND-001",
};

function setSuggestions(data: CanonicalSuggestion[], isLoading = false) {
  mockSearch.mockReturnValue({ data, isLoading });
}

describe("LibraryNameInput", () => {
  beforeEach(() => {
    mockSearch.mockReset();
    setSuggestions([]);
  });

  it("shows suggestions while typing and applies a resource pick (not a plain rename)", () => {
    setSuggestions([resourceSuggestion]);
    const onCommit = vi.fn();
    const onApplySuggestion = vi.fn();
    render(
      <LibraryNameInput
        value=""
        kind="resource"
        startInEditMode
        onCommit={onCommit}
        onApplySuggestion={onApplySuggestion}
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "песок" } });
    fireEvent.click(screen.getByText("Песок речной"));
    expect(onApplySuggestion).toHaveBeenCalledWith(expect.objectContaining({ id: "a1", name: "Песок речной" }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits the suggestion name when no apply handler is given (stage/work rename)", () => {
    setSuggestions([{ ...resourceSuggestion, kind: "stage", badgeType: "stage", name: "Фундамент" }]);
    const onCommit = vi.fn();
    render(<LibraryNameInput value="" kind="stage" startInEditMode onCommit={onCommit} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "фунд" } });
    fireEvent.click(screen.getByText("Фундамент"));
    expect(onCommit).toHaveBeenCalledWith("Фундамент");
  });

  it("shows the empty-state hint when there are no matches", () => {
    setSuggestions([]);
    render(<LibraryNameInput value="" kind="work" startInEditMode onCommit={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "zzz" } });
    expect(screen.getByText("estimate.search.empty")).toBeInTheDocument();
  });

  it("does not open the dropdown for an empty query", () => {
    setSuggestions([resourceSuggestion]);
    render(<LibraryNameInput value="" kind="resource" startInEditMode onCommit={vi.fn()} onApplySuggestion={vi.fn()} />);
    expect(screen.queryByText("Песок речной")).not.toBeInTheDocument();
  });
});
