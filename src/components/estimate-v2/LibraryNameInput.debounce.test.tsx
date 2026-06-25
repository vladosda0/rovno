import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { LibraryNameInput } from "@/components/estimate-v2/LibraryNameInput";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// Simulate the debounce gap: the debounced value always lags behind the live draft.
vi.mock("@/hooks/use-debounce", () => ({ useDebounce: () => "" }));
// Search has settled to zero results and is NOT loading — so only the debounce-gap
// guard can keep the empty state from flashing on the first keystroke.
vi.mock("@/hooks/use-canonical-search", () => ({
  useCanonicalSearch: () => ({ data: [], isLoading: false }),
}));

describe("LibraryNameInput debounce gap", () => {
  it("shows the loading state (not 'no matches') while the debounce hasn't caught up", () => {
    render(
      <LibraryNameInput value="" kind="resource" startInEditMode onCommit={vi.fn()} onApplySuggestion={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "песок" } });
    // draft="песок" but debounced="" → searchPending true → loading branch, not empty.
    expect(screen.getByText("estimate.search.loading")).toBeInTheDocument();
    expect(screen.queryByText("estimate.search.empty")).not.toBeInTheDocument();
  });
});
