import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { LibraryNameInput } from "@/components/estimate-v2/LibraryNameInput";
import { useCanonicalSearch, type CanonicalSuggestion } from "@/hooks/use-canonical-search";
import { usePersonalResourceSuggestions } from "@/hooks/use-personal-resource-suggestions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/use-debounce", () => ({ useDebounce: <T,>(value: T) => value }));
vi.mock("@/hooks/use-canonical-search", () => ({ useCanonicalSearch: vi.fn() }));
vi.mock("@/hooks/use-personal-resource-suggestions", () => ({
  usePersonalResourceSuggestions: vi.fn(() => []),
}));

const mockSearch = useCanonicalSearch as unknown as Mock;
const mockPersonal = usePersonalResourceSuggestions as unknown as Mock;

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
    mockPersonal.mockReset();
    mockPersonal.mockReturnValue([]);
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

  it("merges personal suggestions above canonical and applies them with the price payload", () => {
    setSuggestions([resourceSuggestion]);
    mockPersonal.mockReturnValue([
      {
        ...resourceSuggestion,
        id: "uc-item-1",
        name: "Песок речной (мой прайс)",
        source: "user_catalog",
        isPersonal: true,
        priceCents: 85000,
        matchedArticleId: null,
      },
    ]);
    const onApplySuggestion = vi.fn();
    render(
      <LibraryNameInput
        value=""
        kind="resource"
        startInEditMode
        personalEnabled
        onCommit={vi.fn()}
        onApplySuggestion={onApplySuggestion}
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "песок" } });
    const options = screen.getAllByRole("option");
    // Personal first (spec R-8), canonical after.
    expect(options[0]).toHaveTextContent("Песок речной (мой прайс)");
    expect(options[1]).toHaveTextContent("Песок речной");
    fireEvent.click(options[0]);
    expect(onApplySuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ id: "uc-item-1", isPersonal: true, priceCents: 85000 }),
    );
  });

  it("does not open the dropdown or enable the search RPC when searchEnabled is false (demo/local)", () => {
    setSuggestions([resourceSuggestion]);
    render(
      <LibraryNameInput
        value=""
        kind="resource"
        startInEditMode
        searchEnabled={false}
        onCommit={vi.fn()}
        onApplySuggestion={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "песок" } });
    // Gated off: no suggestions, no empty hint, and useCanonicalSearch is disabled so the
    // search_canonical_library RPC never fires in a session-less workspace.
    expect(screen.queryByText("Песок речной")).not.toBeInTheDocument();
    expect(screen.queryByText("estimate.search.empty")).not.toBeInTheDocument();
    expect(mockSearch).toHaveBeenLastCalledWith("песок", "resource", false);
  });
});
