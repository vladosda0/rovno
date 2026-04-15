import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { domainRetrievedToLabel, GroundingCallout } from "@/components/ai/GroundingCallout";

describe("domainRetrievedToLabel", () => {
  it("uses metadata-only wording for documents and media", () => {
    expect(domainRetrievedToLabel("documents_metadata")).toContain("metadata only");
    expect(domainRetrievedToLabel("media_metadata")).toContain("metadata only");
  });
});

describe("GroundingCallout", () => {
  it("shows general-guidance title when inference kind is not_grounded…", () => {
    render(
      <GroundingCallout
        grounding="ungrounded"
        inferenceGroundingKind="not_grounded_on_project_sources_but_general_guidance_available"
        groundingNote="Try asking about a specific trade."
      />,
    );
    expect(screen.getByText(/General guidance \(limited project evidence\)/i)).toBeInTheDocument();
  });

  it("does not surface arbitrary freshnessHint string keys (allowlist)", () => {
    const { container } = render(
      <GroundingCallout
        grounding="partial"
        freshnessHint={{ owner_email: "x@y.com", message: "Dashboard may be stale" }}
      />,
    );
    expect(container.textContent).not.toContain("owner_email");
    expect(container.textContent).not.toContain("x@y.com");
    expect(screen.getByText(/message: Dashboard may be stale/i)).toBeInTheDocument();
  });

  it("lists domainsRetrieved with honest labels", () => {
    render(
      <GroundingCallout
        grounding="project_context_grounded"
        groundingDetails={{
          serverSnapshotUsed: true,
          domainsRetrieved: ["estimate", "documents_metadata"],
          evidenceTruncated: true,
        }}
      />,
    );
    expect(screen.getByText(/Evidence domains/i)).toBeInTheDocument();
    expect(screen.getByText(/^Estimate$/)).toBeInTheDocument();
    expect(screen.getByText(/Documents \(metadata only/)).toBeInTheDocument();
    expect(screen.getByText(/truncated/i)).toBeInTheDocument();
  });
});
