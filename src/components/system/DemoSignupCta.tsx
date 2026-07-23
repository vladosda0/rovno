import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trackEvent } from "@/lib/analytics";

/**
 * Demo→signup bridge card, rendered by AppLayout at the bottom of every page
 * while a demo session is active. Complements the persistent DemoModeBanner
 * CTA: a visitor who scrolled a whole showcase screen gets the invitation
 * right where they finished reading. Centered at the home content width;
 * project pages are full-bleed, where a capped width reads as intentional.
 */
export function DemoSignupCta() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6">
      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <h3 className="text-body font-semibold text-foreground">{t("demo.homeCtaTitle")}</h3>
            <p className="mt-0.5 text-body-sm text-muted-foreground">{t("demo.homeCtaSubtitle")}</p>
          </div>
          <Button asChild className="shrink-0">
            <Link to="/auth/signup" onClick={() => trackEvent("demo_signup_cta_clicked")}>
              {t("demo.createOwn")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
