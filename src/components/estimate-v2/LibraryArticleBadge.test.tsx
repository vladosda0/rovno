import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { LibraryArticleBadge } from "@/components/estimate-v2/LibraryArticleBadge";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("LibraryArticleBadge", () => {
  it("opens the resource modal on click", () => {
    const onOpen = vi.fn();
    render(
      <TooltipProvider>
        <LibraryArticleBadge onOpen={onOpen} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "estimate.library.indicatorTooltip" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("renders a non-interactive mark when no handler is given", () => {
    render(
      <TooltipProvider>
        <LibraryArticleBadge />
      </TooltipProvider>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
