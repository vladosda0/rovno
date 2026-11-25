import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { VkMark, YandexMark } from "@/components/auth/ProviderMarks";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { toast } from "@/hooks/use-toast";
import { useResetOnBackFromYandex } from "@/hooks/use-reset-on-back-from-yandex";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import {
  listLoginIdentities,
  startExternalAuth,
  unlinkLoginIdentity,
  type LoginIdentity,
  type LoginProvider,
} from "@/lib/external-login";

type LoadState = { status: "loading" } | { status: "failed" } | { status: "ready"; identities: LoginIdentity[] };

interface ProviderCopy {
  name: string;
  taken: string;
  hasOwn: string;
  hasOwnNotice: string;
  linkFailed: string;
  linkedToast: string;
  unlinkedToast: string;
}

// Yandex always first, as on the sign-in screen (mockup external-login-s3, frame 7).
const PROVIDERS: LoginProvider[] = ["yandex", "vk"];

const COPY: Record<LoginProvider, ProviderCopy> = {
  yandex: {
    name: "security.connected.yandex",
    taken: "security.connected.taken",
    hasOwn: "security.connected.hasYandex",
    hasOwnNotice: "has_yandex",
    linkFailed: "security.connected.linkFailed",
    linkedToast: "security.connected.linkedToast",
    unlinkedToast: "security.connected.unlinkedToast",
  },
  vk: {
    name: "security.connected.vk",
    taken: "security.connected.vkTaken",
    hasOwn: "security.connected.hasVk",
    hasOwnNotice: "has_vk",
    linkFailed: "security.connected.vkLinkFailed",
    linkedToast: "security.connected.vkLinkedToast",
    unlinkedToast: "security.connected.vkUnlinkedToast",
  },
};

const MARK: Record<LoginProvider, ReactNode> = {
  yandex: <YandexMark className="mt-0.5 h-5 w-5 shrink-0" />,
  vk: <VkMark className="mt-0.5" />,
};

/** «Подключённые аккаунты» for a signed-in person (epic external-login, slices 2-3). */
export function ConnectedAccountsSection() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busy, setBusy] = useState<LoginProvider | null>(null);
  // The result of a link arrives in the URL, one parameter per provider.
  const [notices, setNotices] = useState<Partial<Record<LoginProvider, string>>>(() => ({
    yandex: searchParams.get("yandex") ?? undefined,
    vk: searchParams.get("vk") ?? undefined,
  }));
  const { user } = useRuntimeAuth();
  useResetOnBackFromYandex(useCallback(() => setBusy(null), []));

  const refresh = useCallback(async () => {
    try {
      setState({ status: "ready", identities: await listLoginIdentities() });
    } catch {
      setState({ status: "failed" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Read once, so a refresh forgets it.
  useEffect(() => {
    const present = PROVIDERS.filter((provider) => searchParams.has(provider));
    if (present.length === 0) return;
    for (const provider of present) {
      if (searchParams.get(provider) === "linked") toast({ title: t(COPY[provider].linkedToast) });
    }
    const nextParams = new URLSearchParams(searchParams);
    for (const provider of present) nextParams.delete(provider);
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, t]);

  const handleLink = async (provider: LoginProvider) => {
    setNotices({});
    setBusy(provider);
    const started = await startExternalAuth(provider, "link", null).catch(() => false);
    if (!started) {
      setBusy(null);
      setNotices({ [provider]: "failed" });
    }
  };

  const handleUnlink = async (provider: LoginProvider) => {
    setNotices({});
    setBusy(provider);
    try {
      await unlinkLoginIdentity(provider);
      await refresh();
      toast({ title: t(COPY[provider].unlinkedToast) });
    } catch {
      toast({ title: t("integrations.error.unlink"), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const errorFor = (provider: LoginProvider): string | null => {
    const copy = COPY[provider];
    const notice = notices[provider];
    if (notice === "taken") return t(copy.taken);
    if (notice === copy.hasOwnNotice) return t(copy.hasOwn);
    if (notice === "failed") return t(copy.linkFailed);
    if (state.status === "failed" && provider === "yandex") return t("security.connected.loadFailed");
    return null;
  };

  return (
    <SettingsSection title={t("security.connected.title")} description={t("security.connected.loginDescription")}>
      <div className="space-y-2">
        {PROVIDERS.map((provider) => {
          const identity = state.status === "ready" ? state.identities.find((row) => row.provider === provider) ?? null : null;
          const errorText = errorFor(provider);
          const name = t(COPY[provider].name);
          // VK may pass no email; then its name tells the person which VK account it is.
          const subline = identity ? identity.email ?? identity.displayName : null;
          return (
            <div key={provider} role="group" aria-label={name} className="rounded-panel bg-muted/40 p-1.5 px-sp-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  {MARK[provider]}
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-body-sm font-medium text-foreground">{name}</p>
                    {state.status === "loading" ? (
                      <p className="text-caption text-muted-foreground">{t("common.loading")}</p>
                    ) : identity ? (
                      <>
                        {subline && <p className="break-all text-caption text-muted-foreground">{subline}</p>}
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
                    <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void handleUnlink(provider)}>
                      {t("integrations.telegram.unlink")}
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void handleLink(provider)}>
                      {t("security.connected.link")}
                    </Button>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
}
