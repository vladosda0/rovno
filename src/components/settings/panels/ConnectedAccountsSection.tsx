import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { YandexMark } from "@/components/auth/YandexButton";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { toast } from "@/hooks/use-toast";
import { useResetOnBackFromYandex } from "@/hooks/use-reset-on-back-from-yandex";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import {
  listLoginIdentities,
  startYandexAuth,
  unlinkLoginIdentity,
  type LoginIdentity,
} from "@/lib/yandex-login";

type LoadState = { status: "loading" } | { status: "failed" } | { status: "ready"; identity: LoginIdentity | null };

/** «Подключённые аккаунты» for a signed-in person (epic external-login, slice 2). */
export function ConnectedAccountsSection() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(() => searchParams.get("yandex"));
  const { user } = useRuntimeAuth();
  useResetOnBackFromYandex(useCallback(() => setBusy(false), []));

  const refresh = useCallback(async () => {
    try {
      const identities = await listLoginIdentities();
      setState({ status: "ready", identity: identities.find((row) => row.provider === "yandex") ?? null });
    } catch {
      setState({ status: "failed" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The result of a link arrives in the URL; it is read once, so a refresh forgets it.
  useEffect(() => {
    if (!searchParams.has("yandex")) return;
    if (searchParams.get("yandex") === "linked") toast({ title: t("security.connected.linkedToast") });
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("yandex");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, t]);

  const handleLink = async () => {
    setNotice(null);
    setBusy(true);
    const started = await startYandexAuth("link", null).catch(() => false);
    if (!started) {
      setBusy(false);
      setNotice("failed");
    }
  };

  const handleUnlink = async () => {
    setNotice(null);
    setBusy(true);
    try {
      await unlinkLoginIdentity("yandex");
      await refresh();
      toast({ title: t("security.connected.unlinkedToast") });
    } catch (error) {
      toast({
        title: t("integrations.error.unlink"),
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const identity = state.status === "ready" ? state.identity : null;
  const errorText =
    notice === "taken"
      ? t("security.connected.taken")
      : notice === "has_yandex"
        ? t("security.connected.hasYandex")
        : notice === "failed"
          ? t("security.connected.linkFailed")
          : state.status === "failed"
            ? t("security.connected.loadFailed")
            : null;

  return (
    <SettingsSection title={t("security.connected.title")} description={t("security.connected.loginDescription")}>
      <div className="rounded-panel bg-muted/40 p-1.5 px-sp-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <YandexMark className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-body-sm font-medium text-foreground">{t("security.connected.yandex")}</p>
              {state.status === "loading" ? (
                <p className="text-caption text-muted-foreground">{t("common.loading")}</p>
              ) : identity ? (
                <>
                  {identity.email && <p className="break-all text-caption text-muted-foreground">{identity.email}</p>}
                  {user?.email && (
                    <p className="text-caption text-muted-foreground">
                      {t("security.connected.afterUnlink", { email: user.email })}
                    </p>
                  )}
                </>
              ) : state.status === "ready" ? (
                <p className="text-caption text-muted-foreground">{t("security.connected.notLinked")}</p>
              ) : null}
              {errorText && (
                <p role="alert" className="text-caption text-destructive">
                  {errorText}
                </p>
              )}
            </div>
          </div>
          {state.status === "ready" &&
            (identity ? (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void handleUnlink()}>
                {t("integrations.telegram.unlink")}
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void handleLink()}>
                {t("security.connected.link")}
              </Button>
            ))}
        </div>
      </div>
    </SettingsSection>
  );
}
