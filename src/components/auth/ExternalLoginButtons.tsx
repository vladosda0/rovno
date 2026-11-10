import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { VkMark, YandexMark } from "@/components/auth/ProviderMarks";
import { toast } from "@/hooks/use-toast";
import { useResetOnBackFromYandex } from "@/hooks/use-reset-on-back-from-yandex";
import { startExternalAuth, type LoginProvider } from "@/lib/external-login";

interface ExternalLoginButtonsProps {
  next: string | null;
  onStart?: () => void;
}

/**
 * «Яндекс ID» and «VK ID» in one row under «или» (mockup external-login-s3, frames 2-3,
 * direction «Пара»). Same look, corners and height as «Войти по коду из письма» (Vlad's
 * decision 2026-11-02). Yandex's guide asks to caption a short button block «Войти с
 * помощью»; the caption is left out by Vlad's word of 2026-11-06, the full name stays in
 * each button's accessible label.
 */
export function ExternalLoginButtons({ next, onStart }: ExternalLoginButtonsProps) {
  const { t } = useTranslation();
  const [starting, setStarting] = useState<LoginProvider | null>(null);
  useResetOnBackFromYandex(useCallback(() => setStarting(null), []));

  const handleClick = async (provider: LoginProvider) => {
    onStart?.();
    setStarting(provider);
    const started = await startExternalAuth(provider, "login", next).catch(() => false);
    if (!started) {
      setStarting(null);
      toast({ title: t(provider === "vk" ? "auth.vk.failed" : "auth.yandex.failed"), variant: "destructive" });
    }
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        aria-label={t("auth.yandex.buttonLabel")}
        disabled={starting !== null}
        onClick={() => void handleClick("yandex")}
      >
        <YandexMark />
        {t("auth.yandex.button")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="group w-full"
        aria-label={t("auth.vk.buttonLabel")}
        disabled={starting !== null}
        onClick={() => void handleClick("vk")}
      >
        <VkMark swapOnHover />
        {t("auth.vk.button")}
      </Button>
    </div>
  );
}
