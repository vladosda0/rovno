import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Step1TypeSelection } from "@/components/upload/Step1TypeSelection";
import { Step2ScopeSelection } from "@/components/upload/Step2ScopeSelection";
import { DocumentForm } from "@/components/upload/forms/DocumentForm";
import { CatalogForm } from "@/components/upload/forms/CatalogForm";
import { EstimateTemplateForm } from "@/components/upload/forms/EstimateTemplateForm";
import { VisitkaForm } from "@/components/upload/forms/VisitkaForm";
import {
  isScopeValidForType,
  type UploadResult,
  type UploadScope,
  type UploadType,
} from "@/components/upload/types";

type ModalState =
  | { step: 1; type: UploadType | null }
  | { step: 2; type: UploadType; scope: UploadScope | null; projectId?: string }
  | { step: 3; type: UploadType; scope: UploadScope; projectId?: string };

export interface MultiStepUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If set, Step 1 is auto-completed. */
  presetType?: UploadType;
  /** If set (and valid for the type), Step 2 is auto-completed. */
  presetScope?: UploadScope;
  presetProjectId?: string;
  /** Called after a successful save. */
  onComplete?: (result: UploadResult) => void;
}

function computeInitialState(
  presetType?: UploadType,
  presetScope?: UploadScope,
  presetProjectId?: string,
): ModalState {
  // Visitka skips Step 2 — it always publishes (Public) after moderation.
  if (presetType === "visitka") {
    return { step: 3, type: "visitka", scope: "public" };
  }
  if (presetType) {
    const scopeOk = presetScope && isScopeValidForType(presetType, presetScope);
    const projectOk = presetScope !== "project" || Boolean(presetProjectId);
    if (presetScope && scopeOk && projectOk) {
      return { step: 3, type: presetType, scope: presetScope, projectId: presetProjectId };
    }
    return { step: 2, type: presetType, scope: null, projectId: presetProjectId };
  }
  return { step: 1, type: null };
}

export function MultiStepUploadModal({
  open,
  onOpenChange,
  presetType,
  presetScope,
  presetProjectId,
  onComplete,
}: MultiStepUploadModalProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<ModalState>(() =>
    computeInitialState(presetType, presetScope, presetProjectId),
  );

  // Re-seed from presets each time the modal is opened so context-aware entry
  // points (Add buttons, the pinned Визитка card) land on the right step.
  useEffect(() => {
    if (open) {
      setState(computeInitialState(presetType, presetScope, presetProjectId));
    }
  }, [open, presetType, presetScope, presetProjectId]);

  function handleClose() {
    onOpenChange(false);
  }

  function handleComplete(result: UploadResult) {
    onComplete?.(result);
    handleClose();
  }

  function selectType(type: UploadType) {
    if (type === "visitka") {
      setState({ step: 3, type: "visitka", scope: "public" });
      return;
    }
    setState({ step: 2, type, scope: null, projectId: presetProjectId });
  }

  function goToStep3(scope: UploadScope, projectId?: string) {
    if (state.step !== 2) return;
    setState({ step: 3, type: state.type, scope, projectId });
  }

  function updateStep2(partial: { scope?: UploadScope | null; projectId?: string }) {
    if (state.step !== 2) return;
    setState({
      step: 2,
      type: state.type,
      scope: partial.scope !== undefined ? partial.scope : state.scope,
      projectId: partial.projectId !== undefined ? partial.projectId : state.projectId,
    });
  }

  function backToStep1() {
    setState({ step: 1, type: null });
  }

  function backToStep2() {
    if (state.step !== 3) return;
    setState({ step: 2, type: state.type, scope: state.scope, projectId: state.projectId });
  }

  const headerTitle =
    state.step === 1
      ? t("upload.modal.step1.title")
      : state.step === 2
        ? t("upload.modal.step2.title")
        : t(`upload.modal.step3.${state.type}.title`);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}>
      <DialogContent className="bg-card border border-border rounded-modal max-w-2xl shadow-xl p-0 gap-0 max-h-[88vh] flex flex-col [&>button.absolute]:hidden">
        <DialogHeader className="border-b border-border px-4 sm:px-5 py-3 sm:py-4 shrink-0">
          <DialogTitle>{headerTitle}</DialogTitle>
          <DialogDescription
            className={state.step === 1 ? undefined : "sr-only"}
          >
            {t("upload.modal.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col">
          {state.step === 1 && <Step1TypeSelection onSelect={selectType} />}

          {state.step === 2 && (
            <Step2ScopeSelection
              type={state.type}
              scope={state.scope}
              projectId={state.projectId}
              onScopeChange={(scope) => updateStep2({ scope })}
              onProjectChange={(projectId) => updateStep2({ projectId })}
              onBack={backToStep1}
              onNext={goToStep3}
            />
          )}

          {state.step === 3 && state.type === "document" && (
            <DocumentForm
              scope={state.scope}
              projectId={state.projectId}
              onBack={backToStep2}
              onClose={handleClose}
              onComplete={handleComplete}
            />
          )}
          {state.step === 3 && state.type === "catalog" && (
            <CatalogForm
              scope={state.scope}
              projectId={state.projectId}
              onBack={backToStep2}
              onClose={handleClose}
              onComplete={handleComplete}
            />
          )}
          {state.step === 3 && state.type === "estimate_template" && (
            <EstimateTemplateForm
              scope={state.scope}
              projectId={state.projectId}
              onBack={backToStep2}
              onClose={handleClose}
              onComplete={handleComplete}
            />
          )}
          {state.step === 3 && state.type === "visitka" && (
            <VisitkaForm
              onBack={backToStep1}
              onClose={handleClose}
              onComplete={handleComplete}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
