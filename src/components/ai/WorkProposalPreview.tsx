import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PresentationalWorkProposal } from "@/lib/ai-assistant-contract";
import { FileSpreadsheet } from "lucide-react";

export function WorkProposalPreview(props: {
  projectId: string;
  proposal: PresentationalWorkProposal;
}) {
  const { projectId, proposal } = props;
  const { t } = useTranslation();
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
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 flex-1 text-caption"
              onClick={() => navigate(`/project/${projectId}/estimate`)}
            >
              {t("ai.workProposal.openEstimateCta")}
            </Button>
            {/* P3: wires up to commit_ai_proposal once that RPC ships. Kept
                disabled with a Coming soon Tooltip so the Propose/Confirm
                UX pattern is visible to users today without doing any
                writes. Wrapped in a span because disabled buttons don't
                emit pointer events and Radix needs a hoverable anchor. */}
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="flex-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-8 w-full text-caption"
                      disabled
                      aria-label={t("ai.workProposal.confirmCta", {
                        defaultValue: "Confirm",
                      })}
                    >
                      {t("ai.workProposal.confirmCta", {
                        defaultValue: "Confirm",
                      })}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {t("ai.workProposal.confirmComingSoon", {
                    defaultValue: "Coming soon",
                  })}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
