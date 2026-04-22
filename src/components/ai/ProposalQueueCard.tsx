import { Check, ChevronLeft, ChevronRight, PencilLine, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PreviewCard } from "@/components/ai/PreviewCard";
import type { AIProposal } from "@/types/ai";

export type ProposalDecision = "unresolved" | "confirmed" | "declined";

export interface ProposalQueueItemState {
  id: string;
  proposal: AIProposal;
  decision: ProposalDecision;
  suggestEditMode: boolean;
  suggestEditText: string;
  directEditMode: boolean;
  draftSummary: string;
  draftChangeLabels: string[];
}

interface ProposalQueueCardProps {
  item: ProposalQueueItemState;
  index: number;
  total: number;
  canGoBack: boolean;
  canGoNext: boolean;
  allowDirectEdit: boolean;
  isBusy?: boolean;
  onConfirm: () => void;
  onDecline: () => void;
  onOpenSuggestEdits: () => void;
  onSuggestEditTextChange: (value: string) => void;
  onSubmitEdits: () => void;
  onCancelSuggestEdits: () => void;
  onToggleDirectEdit: () => void;
  onDraftSummaryChange: (value: string) => void;
  onDraftChangeLabelChange: (changeIdx: number, value: string) => void;
  onSaveDirectEdits: () => void;
  onBack: () => void;
  onNext: () => void;
}

const decisionStyle: Record<ProposalDecision, string> = {
  unresolved: "bg-muted text-muted-foreground",
  confirmed: "bg-success/20 text-success",
  declined: "bg-destructive/20 text-destructive",
};

const decisionLabelKey: Record<ProposalDecision, string> = {
  unresolved: "ai.proposal.queue.status.pending",
  confirmed: "ai.proposal.queue.status.confirmed",
  declined: "ai.proposal.queue.status.declined",
};

export function ProposalQueueCard({
  item,
  index,
  total,
  canGoBack,
  canGoNext,
  allowDirectEdit,
  isBusy,
  onConfirm,
  onDecline,
  onOpenSuggestEdits,
  onSuggestEditTextChange,
  onSubmitEdits,
  onCancelSuggestEdits,
  onToggleDirectEdit,
  onDraftSummaryChange,
  onDraftChangeLabelChange,
  onSaveDirectEdits,
  onBack,
  onNext,
}: ProposalQueueCardProps) {
  const { t } = useTranslation();
  const showDirectEdit = allowDirectEdit && item.directEditMode;

  return (
    <div className="glass rounded-card p-3 space-y-2.5 w-full min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-sm font-semibold text-foreground">
          {t("ai.proposal.queue.header", { index: index + 1, total })}
        </span>
        <span className={`text-[10px] font-medium rounded-pill px-2 py-0.5 ${decisionStyle[item.decision]}`}>
          {t(decisionLabelKey[item.decision])}
        </span>
      </div>

      {showDirectEdit ? (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{t("ai.proposal.queue.labels.summary")}</label>
            <Input
              value={item.draftSummary}
              onChange={(e) => onDraftSummaryChange(e.target.value)}
              className="h-8 bg-sidebar-accent/40 border-sidebar-border"
              disabled={isBusy}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{t("ai.proposal.queue.labels.actions")}</label>
            <div className="space-y-1.5">
              {item.draftChangeLabels.map((label, changeIdx) => (
                <Input
                  key={`${item.id}-draft-${changeIdx}`}
                  value={label}
                  onChange={(e) => onDraftChangeLabelChange(changeIdx, e.target.value)}
                  className="h-8 bg-sidebar-accent/40 border-sidebar-border"
                  disabled={isBusy}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 px-3 text-xs bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={onSaveDirectEdits}
              disabled={isBusy}
            >
              {t("ai.proposal.queue.buttons.saveDirect")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-3 text-xs"
              onClick={onToggleDirectEdit}
              disabled={isBusy}
            >
              {t("ai.proposal.queue.buttons.back")}
            </Button>
          </div>
        </div>
      ) : (
        <PreviewCard summary={item.proposal.summary} changes={item.proposal.changes} />
      )}

      {item.suggestEditMode && !showDirectEdit ? (
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{t("ai.proposal.queue.labels.suggestEdits")}</label>
          <Textarea
            value={item.suggestEditText}
            onChange={(e) => onSuggestEditTextChange(e.target.value)}
            placeholder={t("ai.proposal.queue.placeholder.suggestEdits")}
            className="min-h-[78px] resize-none bg-sidebar-accent/40 border-sidebar-border"
            disabled={isBusy}
          />
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 px-3 text-xs bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={onSubmitEdits}
              disabled={isBusy || !item.suggestEditText.trim()}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              {t("ai.proposal.queue.buttons.submitEdits")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-3 text-xs"
              onClick={onCancelSuggestEdits}
              disabled={isBusy}
            >
              {t("ai.proposal.queue.buttons.back")}
            </Button>
          </div>
        </div>
      ) : !showDirectEdit ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            size="sm"
            className="h-7 px-3 text-xs bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={onConfirm}
            disabled={isBusy}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            {t("ai.proposal.queue.buttons.confirm")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-3 text-xs"
            onClick={onDecline}
            disabled={isBusy}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            {t("ai.proposal.queue.buttons.decline")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs"
            onClick={onOpenSuggestEdits}
            disabled={isBusy}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            {t("ai.proposal.queue.buttons.suggestEdits")}
          </Button>
          {allowDirectEdit && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs"
              onClick={onToggleDirectEdit}
              disabled={isBusy}
            >
              <PencilLine className="h-3.5 w-3.5 mr-1" />
              {t("ai.proposal.queue.buttons.directEdit")}
            </Button>
          )}
        </div>
      ) : null}

      <div className="pt-1 flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onBack}
          disabled={!canGoBack || isBusy}
        >
          <ChevronLeft className="h-3.5 w-3.5 mr-1" />
          {t("ai.proposal.queue.buttons.back")}
        </Button>
        <p className="text-[10px] text-muted-foreground text-center flex-1">
          {t("ai.proposal.queue.navHint")}
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onNext}
          disabled={!canGoNext || isBusy}
        >
          {t("ai.proposal.queue.buttons.next")}
          <ChevronRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
