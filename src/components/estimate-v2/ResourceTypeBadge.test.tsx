import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResourceTypeBadge } from "@/components/estimate-v2/ResourceTypeBadge";
import type { ResourceLineType } from "@/types/estimate-v2";

describe("ResourceTypeBadge", () => {
  it("falls back to the other meta for unknown/legacy resource types without throwing", () => {
    const renderUnknown = () =>
      render(<ResourceTypeBadge type={"equipment" as ResourceLineType} />);

    expect(renderUnknown).not.toThrow();

    const { container } = renderUnknown();
    const badge = container.querySelector(".bg-muted");
    expect(badge).not.toBeNull();
  });
});
