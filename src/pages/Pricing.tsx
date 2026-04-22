import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { trackEvent } from "@/lib/analytics";
import { Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";

type BillingCycle = "monthly" | "annual";
type CreditsOption = 100 | 200 | 300 | 400 | 500;

const CREDIT_OPTIONS: CreditsOption[] = [100, 200, 300, 400, 500];

function TooltipLabel({ label, tooltip, ariaMoreInfo }: { label: string; tooltip: string; ariaMoreInfo: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label={ariaMoreInfo}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-body-sm">{tooltip}</TooltipContent>
      </Tooltip>
    </span>
  );
}

function computeDisplayPrice(unitPrice: number, credits: CreditsOption): number {
  return unitPrice * (credits / 100);
}

export default function Pricing() {
  const { t } = useTranslation();
  useEffect(() => { trackEvent("pricing_page_viewed"); }, []);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [selectedCreditsMaster, setSelectedCreditsMaster] = useState<CreditsOption>(100);
  const [selectedCreditsBusiness, setSelectedCreditsBusiness] = useState<CreditsOption>(100);

  const masterUnitPrice = billingCycle === "annual" ? 8 : 10;
  const businessUnitPrice = billingCycle === "annual" ? 25 : 30;

  const masterPrice = useMemo(
    () => computeDisplayPrice(masterUnitPrice, selectedCreditsMaster),
    [masterUnitPrice, selectedCreditsMaster],
  );
  const businessPrice = useMemo(
    () => computeDisplayPrice(businessUnitPrice, selectedCreditsBusiness),
    [businessUnitPrice, selectedCreditsBusiness],
  );

  const ariaMoreInfo = t("pricing.tooltips.moreInfo");
  const freeKbTooltip = t("pricing.tooltips.freeKb");
  const creditsTooltip = t("pricing.tooltips.credits");

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-sp-4 py-sp-2">
        <Link to="/" className="text-h3 font-bold text-foreground">{t("landing.brand.name")}</Link>
        <div className="flex items-center gap-sp-1">
          <Button variant="outline" asChild><Link to="/auth/login">{t("pricing.header.login")}</Link></Button>
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/auth/signup">{t("pricing.header.getStarted")}</Link>
          </Button>
        </div>
      </header>

      <main className="px-sp-3 py-sp-4 lg:px-sp-4 lg:py-sp-6">
        <section className="space-y-sp-4">
          <div className="max-w-3xl">
            <h1 className="text-h1 text-foreground">{t("pricing.title")}</h1>
            <p className="mt-2 text-body text-muted-foreground">
              {t("pricing.subtitle")}
            </p>
          </div>

          <div className="grid w-full auto-rows-fr grid-cols-1 gap-sp-3 md:grid-cols-2 xl:grid-cols-4">
            {/* Free */}
            <article className="glass rounded-panel p-sp-3 h-full flex flex-col">
              <h2 className="text-h3 text-foreground">{t("pricing.plans.free.name")}</h2>
              <p className="mt-2 text-body-sm text-muted-foreground">
                {t("pricing.plans.free.description")}
              </p>
              <div className="mt-3">
                <p className="text-h2 font-bold text-foreground">{t("pricing.plans.free.priceLabel")}</p>
              </div>
              <div className="mt-3 min-h-[56px]" aria-hidden="true" />
              <div className="mt-1">
                <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  <Link to="/auth/signup">{t("pricing.cta.continue")}</Link>
                </Button>
              </div>
              <div className="mt-3 min-h-[76px]" aria-hidden="true" />
              <ul className="mt-3 flex-1 space-y-2">
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.free.f1")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.free.f2")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.free.f3")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.free.f4")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <TooltipLabel label={t("pricing.plans.free.f5")} tooltip={freeKbTooltip} ariaMoreInfo={ariaMoreInfo} />
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.free.f6")}</span>
                </li>
              </ul>
            </article>

            {/* Master */}
            <article className="glass rounded-panel p-sp-3 h-full flex flex-col">
              <h2 className="text-h3 text-foreground">{t("pricing.plans.master.name")}</h2>
              <p className="mt-2 text-body-sm text-muted-foreground">
                {t("pricing.plans.master.description")}
              </p>
              <div className="mt-3">
                <p className="text-h2 font-bold text-foreground">{masterPrice}{t("pricing.perMonth")}</p>
                {billingCycle === "annual" && (
                  <p className="text-caption text-muted-foreground">{t("pricing.billedAnnually")}</p>
                )}
              </div>
              <div className="mt-3 min-h-[56px] rounded-card border border-border bg-background/50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-sm text-foreground">{t("pricing.annualBilling")}</span>
                  <Switch
                    checked={billingCycle === "annual"}
                    onCheckedChange={(checked) => setBillingCycle(checked ? "annual" : "monthly")}
                    aria-label={t("pricing.annualBillingAria")}
                  />
                </div>
                <p className="mt-1 text-caption text-accent">{t("pricing.plans.master.savePercent")}</p>
              </div>
              <div className="mt-1">
                <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  <Link to="/auth/signup">{t("pricing.cta.continue")}</Link>
                </Button>
              </div>
              <div className="mt-3 min-h-[76px] rounded-card border border-border bg-background/50 p-2">
                <div className="mb-1 text-caption text-muted-foreground">
                  <TooltipLabel label={t("pricing.aiCreditsLabel")} tooltip={creditsTooltip} ariaMoreInfo={ariaMoreInfo} />
                </div>
                <Select
                  value={String(selectedCreditsMaster)}
                  onValueChange={(value) => setSelectedCreditsMaster(Number(value) as CreditsOption)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t("pricing.selectCreditsPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CREDIT_OPTIONS.map((credits) => (
                      <SelectItem key={credits} value={String(credits)}>
                        {credits}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-3 text-caption font-medium text-muted-foreground">{t("pricing.plans.master.everythingIn")}</div>
              <ul className="mt-2 flex-1 space-y-2">
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.master.f1")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.master.f2")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <TooltipLabel label={t("pricing.plans.master.f3")} tooltip={creditsTooltip} ariaMoreInfo={ariaMoreInfo} />
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.master.f4")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.master.f5")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.master.f6")}</span>
                </li>
              </ul>
            </article>

            {/* Business */}
            <article className="glass rounded-panel p-sp-3 h-full flex flex-col">
              <h2 className="text-h3 text-foreground">{t("pricing.plans.business.name")}</h2>
              <p className="mt-2 text-body-sm text-muted-foreground">
                {t("pricing.plans.business.description")}
              </p>
              <div className="mt-3">
                <p className="text-h2 font-bold text-foreground">{businessPrice}{t("pricing.perMonth")}</p>
                {billingCycle === "annual" && (
                  <p className="text-caption text-muted-foreground">{t("pricing.billedAnnually")}</p>
                )}
              </div>
              <div className="mt-3 min-h-[56px] rounded-card border border-border bg-background/50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-sm text-foreground">{t("pricing.annualBilling")}</span>
                  <Switch
                    checked={billingCycle === "annual"}
                    onCheckedChange={(checked) => setBillingCycle(checked ? "annual" : "monthly")}
                    aria-label={t("pricing.annualBillingAria")}
                  />
                </div>
                <p className="mt-1 text-caption text-accent">{t("pricing.plans.business.savePercent")}</p>
              </div>
              <div className="mt-1">
                <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  <Link to="/auth/signup">{t("pricing.cta.continue")}</Link>
                </Button>
              </div>
              <div className="mt-3 min-h-[76px] rounded-card border border-border bg-background/50 p-2">
                <div className="mb-1 text-caption text-muted-foreground">
                  <TooltipLabel label={t("pricing.aiCreditsLabel")} tooltip={creditsTooltip} ariaMoreInfo={ariaMoreInfo} />
                </div>
                <Select
                  value={String(selectedCreditsBusiness)}
                  onValueChange={(value) => setSelectedCreditsBusiness(Number(value) as CreditsOption)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t("pricing.selectCreditsPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CREDIT_OPTIONS.map((credits) => (
                      <SelectItem key={credits} value={String(credits)}>
                        {credits}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-3 text-caption font-medium text-muted-foreground">{t("pricing.plans.business.everythingIn")}</div>
              <ul className="mt-2 flex-1 space-y-2">
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.business.f1")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.business.f2")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.business.f3")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.business.f4")}</span>
                </li>
              </ul>
            </article>

            {/* Enterprise */}
            <article className="glass rounded-panel p-sp-3 h-full flex flex-col">
              <h2 className="text-h3 text-foreground">{t("pricing.plans.enterprise.name")}</h2>
              <p className="mt-2 text-body-sm text-muted-foreground">
                {t("pricing.plans.enterprise.description")}
              </p>
              <div className="mt-3">
                <p className="text-h2 font-bold text-foreground">{t("pricing.plans.enterprise.priceLabel")}</p>
              </div>
              <div className="mt-3 min-h-[56px]" aria-hidden="true" />
              <div className="mt-1">
                <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  <Link to="/auth/signup">{t("pricing.cta.continue")}</Link>
                </Button>
              </div>
              <div className="mt-3 min-h-[76px]" aria-hidden="true" />
              <div className="mt-3 text-caption font-medium text-muted-foreground">{t("pricing.plans.enterprise.everythingIn")}</div>
              <ul className="mt-2 flex-1 space-y-2">
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.enterprise.f1")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.enterprise.f2")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.enterprise.f3")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.enterprise.f4")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.enterprise.f5")}</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t("pricing.plans.enterprise.f6")}</span>
                </li>
              </ul>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
