import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { trackEvent } from "@/lib/analytics";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BetaBar } from "@/components/BetaBar";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

const TBANK_SUPPORT_URL = "https://tbank.ru/cf/6qGvCG7ivel";
const ENTERPRISE_FORM_ENDPOINT = "https://formsubmit.co/ajax/vlad@rovno.ai";

export default function Pricing() {
  const { t } = useTranslation();
  useEffect(() => {
    trackEvent("pricing_page_viewed");
  }, []);

  const [enterpriseName, setEnterpriseName] = useState("");
  const [enterpriseEmail, setEnterpriseEmail] = useState("");
  const [enterpriseMessage, setEnterpriseMessage] = useState("");
  const [isSubmittingEnterprise, setIsSubmittingEnterprise] = useState(false);

  const handleEnterpriseSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingEnterprise) return;
    const name = enterpriseName.trim();
    const email = enterpriseEmail.trim();
    const message = enterpriseMessage.trim();
    if (!name || !email || !message) return;

    setIsSubmittingEnterprise(true);
    try {
      const response = await fetch(ENTERPRISE_FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name,
          email,
          message,
          _subject: "Rovno: enterprise inquiry",
        }),
      });
      if (!response.ok) throw new Error("enterprise submit failed");
      toast({ title: t("pricing.enterprise.form.success") });
      setEnterpriseName("");
      setEnterpriseEmail("");
      setEnterpriseMessage("");
    } catch {
      toast({ title: t("pricing.enterprise.form.error"), variant: "destructive" });
    } finally {
      setIsSubmittingEnterprise(false);
    }
  };

  const plans = [
    {
      key: "free",
      name: t("pricing.plans.free.name"),
      description: t("pricing.plans.free.description"),
      priceLabel: t("pricing.plans.free.priceLabel"),
      features: [
        t("pricing.plans.free.f1"),
        t("pricing.plans.free.f2"),
        t("pricing.plans.free.f3"),
        t("pricing.plans.free.f4"),
        t("pricing.plans.free.f5"),
        t("pricing.plans.free.f6"),
      ],
      active: true,
    },
    {
      key: "home",
      name: t("pricing.plans.master.name"),
      description: t("pricing.plans.master.description"),
      priceLabel: "2 600 ₽/мес",
      features: [
        t("pricing.plans.master.everythingIn"),
        t("pricing.plans.master.f1"),
        t("pricing.plans.master.f2"),
        t("pricing.plans.master.f5"),
        t("pricing.plans.master.f6"),
      ],
      active: false,
    },
    {
      key: "brigade",
      name: t("pricing.plans.business.name"),
      description: t("pricing.plans.business.description"),
      priceLabel: "5 900 ₽/мес",
      features: [
        t("pricing.plans.business.everythingIn"),
        t("pricing.plans.business.f1"),
        t("pricing.plans.business.f2"),
        t("pricing.plans.business.f3"),
        t("pricing.plans.business.f4"),
      ],
      active: false,
    },
  ];

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

          <div className="grid w-full auto-rows-fr grid-cols-1 gap-sp-3 md:grid-cols-3">
            {plans.map((plan) => {
              const isFree = plan.key === "free";
              return (
                <article
                  key={plan.key}
                  className={`rounded-panel p-sp-3 h-full flex flex-col ${
                    plan.active
                      ? "glass border border-accent/30"
                      : "glass border border-border opacity-75"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-h3 text-foreground">{plan.name}</h2>
                    {!plan.active ? (
                      <span className="inline-flex items-center rounded-pill border border-border bg-muted/60 px-2.5 py-1 text-caption text-muted-foreground">
                        {t("pricing.soonBadge")}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-body-sm text-muted-foreground">{plan.description}</p>
                  <div className="mt-3">
                    <p className="text-h2 font-bold text-foreground">{plan.priceLabel}</p>
                  </div>
                  <div className="mt-3">
                    {plan.active ? (
                      <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                        <Link to="/auth/signup">{t("pricing.cta.start")}</Link>
                      </Button>
                    ) : (
                      <Button disabled className="w-full" variant="outline">
                        {t("pricing.cta.soon")}
                      </Button>
                    )}
                  </div>

                  {isFree ? (
                    <div className="mt-3 rounded-card border border-accent/30 bg-accent/10 p-sp-2">
                      <p className="text-body-sm text-foreground">
                        {t("pricing.plans.free.betaNote")}
                      </p>
                      <a
                        href={TBANK_SUPPORT_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex text-body-sm font-medium text-accent hover:text-accent/80"
                      >
                        {t("pricing.plans.free.supportCta")}
                      </a>
                    </div>
                  ) : null}

                  <ul className="mt-3 flex-1 space-y-2">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-body-sm text-muted-foreground"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>

          <section
            id="enterprise"
            className="glass-elevated mt-sp-6 rounded-panel p-sp-4 scroll-mt-24"
          >
            <div className="grid gap-sp-4 md:grid-cols-2">
              <div>
                <h2 className="text-h2 text-foreground">{t("pricing.enterprise.title")}</h2>
                <p className="mt-2 text-body text-muted-foreground">
                  {t("pricing.enterprise.subtitle")}
                </p>
              </div>
              <form onSubmit={handleEnterpriseSubmit} className="space-y-3">
                <div>
                  <label
                    htmlFor="enterprise-name"
                    className="text-body-sm font-medium text-foreground"
                  >
                    {t("pricing.enterprise.form.name")}
                  </label>
                  <Input
                    id="enterprise-name"
                    name="name"
                    required
                    value={enterpriseName}
                    onChange={(event) => setEnterpriseName(event.target.value)}
                    placeholder={t("pricing.enterprise.form.namePlaceholder")}
                    disabled={isSubmittingEnterprise}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label
                    htmlFor="enterprise-email"
                    className="text-body-sm font-medium text-foreground"
                  >
                    {t("pricing.enterprise.form.email")}
                  </label>
                  <Input
                    id="enterprise-email"
                    name="email"
                    type="email"
                    required
                    value={enterpriseEmail}
                    onChange={(event) => setEnterpriseEmail(event.target.value)}
                    placeholder={t("pricing.enterprise.form.emailPlaceholder")}
                    disabled={isSubmittingEnterprise}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label
                    htmlFor="enterprise-message"
                    className="text-body-sm font-medium text-foreground"
                  >
                    {t("pricing.enterprise.form.message")}
                  </label>
                  <Textarea
                    id="enterprise-message"
                    name="message"
                    required
                    value={enterpriseMessage}
                    onChange={(event) => setEnterpriseMessage(event.target.value)}
                    placeholder={t("pricing.enterprise.form.messagePlaceholder")}
                    disabled={isSubmittingEnterprise}
                    className="mt-1 min-h-[120px]"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isSubmittingEnterprise}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  {isSubmittingEnterprise
                    ? t("pricing.enterprise.form.submitting")
                    : t("pricing.enterprise.form.submit")}
                </Button>
              </form>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
