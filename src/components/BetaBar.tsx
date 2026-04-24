import { useTranslation } from "react-i18next";

const SUPPORT_URL = "https://tbank.ru/cf/6qGvCG7ivel";

export function BetaBar() {
  const { t } = useTranslation();
  return (
    <div className="w-full border-b border-border bg-accent/10 px-sp-3 py-1.5">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center gap-1 text-caption text-foreground sm:flex-row sm:gap-2">
        <span className="text-center text-muted-foreground">{t("landing.betaBar.text")}</span>
        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent hover:text-accent/80"
        >
          {t("landing.betaBar.cta")} →
        </a>
      </div>
    </div>
  );
}

export default BetaBar;
