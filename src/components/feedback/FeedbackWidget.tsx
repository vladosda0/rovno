import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { trackEvent } from "@/lib/analytics";
import { captureException } from "@/lib/observability/sentry";

/** Mirrors the server-side limit in the submit-feedback edge function. */
export const FEEDBACK_MESSAGE_MAX_LENGTH = 4000;

/**
 * Zero-friction in-app feedback (observability v1, R-8): a fixed button in
 * the bottom-right corner of every authenticated page → dialog with a single
 * textarea → `submit-feedback` edge function (which stores the message and
 * emails Vlad). Renders nothing for guests / demo sessions.
 *
 * Mobile: sits at bottom-20 to clear the documents-hub FAB, which occupies
 * bottom-4 right-4 on screens < md (DocumentsHubTab).
 */
export function FeedbackWidget() {
  const { t } = useTranslation();
  const runtimeAuth = useRuntimeAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  if (runtimeAuth.status !== "authenticated") return null;

  const trimmed = message.trim();
  const canSubmit = trimmed.length > 0 && !sending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("submit-feedback", {
        body: {
          message: trimmed.slice(0, FEEDBACK_MESSAGE_MAX_LENGTH),
          page_url: window.location.href,
        },
      });
      if (error) throw error;
      trackEvent("feedback_submitted");
      toast({
        title: t("feedback.successTitle"),
        description: t("feedback.successDescription"),
      });
      setMessage("");
      setOpen(false);
    } catch (error) {
      // Fail-open UX: the dialog stays open and the text is preserved so the
      // user can retry; the failure itself is worth an error report.
      captureException(error, { tags: { source: "feedback-widget" } });
      toast({
        title: t("feedback.errorTitle"),
        description: t("feedback.errorDescription"),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label={t("feedback.button")}
        className="fixed bottom-20 right-4 z-30 h-11 w-11 rounded-full border border-border p-0 shadow-lg md:bottom-4 md:w-auto md:px-4"
      >
        <MessageSquareText aria-hidden />
        <span className="hidden md:inline">{t("feedback.button")}</span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!sending) setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("feedback.title")}</DialogTitle>
            <DialogDescription>{t("feedback.description")}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t("feedback.placeholder")}
            maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
            rows={5}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              {sending ? t("feedback.sending") : t("feedback.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
