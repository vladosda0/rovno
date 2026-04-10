import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { PresentationalWorkProposal } from "@/lib/ai-assistant-contract";
import { FileSpreadsheet } from "lucide-react";

export function WorkProposalPreview(props: {
  projectId: string;
  proposal: PresentationalWorkProposal;
}) {
  const { projectId, proposal } = props;
  const navigate = useNavigate();

  return (
    <div className="mt-2 rounded-lg border border-border/70 bg-muted/15 px-2.5 py-2">
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10">
          <FileSpreadsheet className="h-3.5 w-3.5 text-accent" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-caption font-semibold text-foreground leading-tight">{proposal.proposalTitle}</p>
          <p className="text-caption text-muted-foreground leading-snug whitespace-pre-wrap break-words">
            {proposal.proposalSummary}
          </p>
          {proposal.suggestedWorkItems.length > 0 ? (
            <ul className="mt-1.5 space-y-1 border-t border-border/50 pt-1.5">
              {proposal.suggestedWorkItems.map((item, idx) => (
                <li key={`${item.label}-${idx}`} className="text-caption text-foreground/95">
                  <span className="font-medium">{item.label}</span>
                  {item.note ? (
                    <span className="text-muted-foreground"> — {item.note}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2 h-8 w-full text-caption"
            onClick={() => navigate(`/project/${projectId}/estimate`)}
          >
            Open estimate to apply manually
          </Button>
        </div>
      </div>
    </div>
  );
}
