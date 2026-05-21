import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { BetaBar } from "@/components/BetaBar";
import { PricingBlock } from "@/components/billing/PricingBlock";

export default function Pricing() {
  const { t } = useTranslation();

  useEffect(() => {
    trackEvent("pricing_page_viewed");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <BetaBar />
      <header className="flex items-center justify-between border-b border-border px-sp-4 py-sp-2">
        <Link to="/" className="flex items-center gap-3">
          <img src="/logo.svg" alt={t("landing.brand.name")} className="h-8 w-auto" />
          <span className="text-body font-semibold text-foreground">{t("landing.brand.name")}</span>
        </Link>
        <div className="flex items-center gap-sp-1">
          <Button variant="outline" asChild>
            <Link to="/auth/login">{t("pricing.header.login")}</Link>
          </Button>
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/auth/signup">{t("pricing.header.getStarted")}</Link>
          </Button>
        </div>
      </header>

      <main className="px-sp-3 py-sp-4 lg:px-sp-4 lg:py-sp-6">
        <section className="mx-auto w-full max-w-6xl space-y-sp-4">
          <div className="max-w-3xl">
            <h1 className="text-h1 text-foreground">{t("pricing.title")}</h1>
            <p className="mt-2 text-body text-muted-foreground">{t("pricing.subtitle")}</p>
          </div>

          <PricingBlock />
        </section>
      </main>
    </div>
  );
}
