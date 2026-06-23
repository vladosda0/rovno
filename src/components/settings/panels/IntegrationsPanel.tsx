import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Send, Copy, Check, ExternalLink, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { toast } from "@/hooks/use-toast";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import {
  createLinkCode,
  listLinkedIdentities,
  unlinkIdentity,
  telegramDeepLink,
  type LinkedIdentity,
} from "@/data/messenger-links";

export function IntegrationsPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workspaceMode = useWorkspaceMode();
  // The bot-identity RPCs (create_link_code, etc.) require auth.uid(), so the
  // link flow only works with a real Supabase session. Demo / local / guest
  // visitors can reach this panel (AppLayout does not redirect them), so gate
  // the flow behind a sign-in prompt rather than firing a doomed RPC that
  // surfaces a destructive error toast.
  const hasSession = workspaceMode.kind === "supabase";
  const [loading, setLoading] = useState(true);
  const [identities, setIdentities] = useState<LinkedIdentity[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [copied, setCopied] = useState(false);

  const telegram = identities.find((i) => i.provider === "telegram") ?? null;

  const refresh = useCallback(async () => {
    if (workspaceMode.kind === "pending-supabase") {
      // Auth still resolving: keep the spinner until the real mode is known.
      return;
    }
    if (workspaceMode.kind !== "supabase") {
      // No session: skip the RPC (it would only error) and show the sign-in
      // prompt below.
      setIdentities([]);
      setLoading(false);
      return;
    }
    try {
      setIdentities(await listLinkedIdentities());
    } catch (err) {
      // Background load on mount: fall back to the not-linked state rather than
      // surfacing a toast. User-initiated actions below still report errors.
      console.warn("Failed to load linked identities:", (err as Error).message);
      setIdentities([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceMode.kind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      setCode(await createLinkCode("telegram"));
    } catch (err) {
      toast({
        title: t("integrations.error.generate"),
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable (insecure context); the code is shown for manual copy */
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      await unlinkIdentity("telegram");
      setCode(null);
      await refresh();
      toast({ title: t("integrations.telegram.unlinkedToast") });
    } catch (err) {
      toast({
        title: t("integrations.error.unlink"),
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <div className="space-y-sp-3">
      <SettingsSection
        title={t("integrations.telegram.title")}
        description={t("integrations.telegram.description")}
      >
        {loading ? (
          <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("integrations.loading")}
          </div>
        ) : !hasSession ? (
          <div className="space-y-sp-2">
            <p className="text-caption text-muted-foreground">
              {t("integrations.telegram.signInHint")}
            </p>
            <Button className="w-full sm:w-auto" onClick={() => navigate("/auth/login")}>
              <LogIn className="mr-2 h-4 w-4" />
              {t("integrations.signIn")}
            </Button>
          </div>
        ) : telegram ? (
          <div className="space-y-sp-2 rounded-panel bg-muted/40 p-sp-2">
            <div className="flex items-start gap-2">
              <Send className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-body-sm font-medium text-foreground">
                    {t("integrations.telegram.linkedTitle")}
                  </p>
                  <Badge variant="secondary" className="text-[10px]">
                    {t("integrations.telegram.connected")}
                  </Badge>
                </div>
                <p className="text-caption text-muted-foreground">
                  {telegram.username
                    ? `@${telegram.username}`
                    : telegram.displayName ?? t("integrations.telegram.linkedFallback")}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={unlinking}
              onClick={handleUnlink}
            >
              {unlinking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("integrations.telegram.unlink")}
            </Button>
          </div>
        ) : code ? (
          <div className="space-y-sp-2 rounded-panel bg-muted/40 p-sp-2">
            <p className="text-caption text-muted-foreground">
              {t("integrations.telegram.codeInstructions")}
            </p>
            <div className="flex items-center gap-2">
              <code className="rounded-md border border-border bg-background px-sp-2 py-1 font-mono text-h4 tracking-widest text-foreground">
                {code}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                aria-label={t("integrations.telegram.copy")}
              >
                {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-caption text-muted-foreground">
              {t("integrations.telegram.codeExpiry")}
            </p>
            <div className="flex flex-wrap gap-sp-2 pt-sp-1">
              <Button asChild className="w-full sm:w-auto">
                <a href={telegramDeepLink(code)} target="_blank" rel="noopener noreferrer">
                  <Send className="mr-2 h-4 w-4" />
                  {t("integrations.telegram.openBot")}
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-70" />
                </a>
              </Button>
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => void refresh()}>
                {t("integrations.telegram.iLinked")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-sp-2">
            <p className="text-caption text-muted-foreground">
              {t("integrations.telegram.notLinkedHint")}
            </p>
            <Button className="w-full sm:w-auto" disabled={generating} onClick={handleGenerate}>
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {t("integrations.telegram.connect")}
            </Button>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
