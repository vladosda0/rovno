import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useResetOnBackFromYandex } from "@/hooks/use-reset-on-back-from-yandex";
import { startYandexAuth } from "@/lib/yandex-login";

// Yandex's own round mark (login-with-yandex-8-2.svg from the Yandex ID docs).
export function YandexMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" fill="none" aria-hidden="true" className={className}>
      <rect width="44" height="44" rx="22" fill="#FC3F1D" />
      <path
        d="M25.2438 12.3208H23.0173C19.2005 12.3208 17.292 14.2292 17.292 17.0919C17.292 20.2726 18.5643 21.863 21.427 23.7714L23.6535 25.3618L17.292 35.222H12.2029L18.2463 26.316C14.7475 23.7714 12.839 21.5449 12.839 17.41C12.839 12.3208 16.3378 8.82202 23.0173 8.82202H29.6969V35.222H25.2438V12.3208Z"
        fill="white"
      />
    </svg>
  );
}

interface YandexButtonProps {
  next: string | null;
  onStart?: () => void;
}

/**
 * Same look, corners and height as the outline button next to it (Vlad's decision
 * 2026-11-02, mockup external-login-s2 frame 2). The Yandex guide asks for its own
 * outline; the difference is named in the epic and undone here.
 */
export function YandexButton({ next, onStart }: YandexButtonProps) {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);
  useResetOnBackFromYandex(useCallback(() => setStarting(false), []));

  const handleClick = async () => {
    onStart?.();
    setStarting(true);
    const started = await startYandexAuth("login", next).catch(() => false);
    if (!started) {
      setStarting(false);
      toast({ title: t("auth.yandex.failed"), variant: "destructive" });
    }
  };

  return (
    <Button type="button" variant="outline" className="w-full" disabled={starting} onClick={() => void handleClick()}>
      <YandexMark />
      {t("auth.yandex.button")}
    </Button>
  );
}
