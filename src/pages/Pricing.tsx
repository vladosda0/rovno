import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

type BillingCycle = "monthly" | "annual";
type CreditsOption = 100 | 200 | 300 | 400 | 500;

const CREDIT_OPTIONS: CreditsOption[] = [100, 200, 300, 400, 500];

const FREE_KB_TOOLTIP =
  "A consolidated library of building codes, regulations, legal acts, engineering standards, manufacturer specifications, and proven industry best practices for construction, renovation, and landscaping.";

const CREDITS_TOOLTIP =
  "Credits are used for AI actions across the product. Choose a monthly bundle based on your workload. Daily credits are added on top.";

function TooltipLabel({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="More info"
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

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-sp-4 py-sp-2">
        <Link to="/" className="text-h3 font-bold text-foreground">СтройАгент</Link>
        <div className="flex items-center gap-sp-1">
          <Button variant="outline" asChild><Link to="/auth/login">Login</Link></Button>
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/auth/signup">Get Started</Link>
          </Button>
        </div>
      </header>

      <main className="px-sp-3 py-sp-4 lg:px-sp-4 lg:py-sp-6">
        <section className="space-y-sp-4">
          <div className="max-w-3xl">
            <h1 className="text-h1 text-foreground">Pricing</h1>
            <p className="mt-2 text-body text-muted-foreground">
              Pick the plan that matches your team size and AI workload.
            </p>
          </div>

          <div className="grid w-full auto-rows-fr grid-cols-1 gap-sp-3 md:grid-cols-2 xl:grid-cols-4">
            {/* Free */}
            <article className="glass rounded-panel p-sp-3 h-full flex flex-col">
              <h2 className="text-h3 text-foreground">Free</h2>
              <p className="mt-2 text-body-sm text-muted-foreground">
                Explore core features and leverage our comprehensive industry knowledge base.
              </p>
              <div className="mt-3">
                <p className="text-h2 font-bold text-foreground">Free</p>
              </div>
              <div className="mt-3 min-h-[56px]" aria-hidden="true" />
              <div className="mt-1">
                <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  <Link to="/auth/signup">Continue</Link>
                </Button>
              </div>
              <div className="mt-3 min-h-[76px]" aria-hidden="true" />
              <ul className="mt-3 flex-1 space-y-2">
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>1 active project</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>5 AI credits / day</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Core dashboard features</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Limited media storage</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <TooltipLabel label="Comprehensive construction knowledge base" tooltip={FREE_KB_TOOLTIP} />
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Community support</span>
                </li>
              </ul>
            </article>

            {/* Master */}
            <article className="glass rounded-panel p-sp-3 h-full flex flex-col">
              <h2 className="text-h3 text-foreground">Master</h2>
              <p className="mt-2 text-body-sm text-muted-foreground">
                Built for independent professionals and freelancers who need more capacity and flexibility.
              </p>
              <div className="mt-3">
                <p className="text-h2 font-bold text-foreground">{masterPrice}/month</p>
                {billingCycle === "annual" && (
                  <p className="text-caption text-muted-foreground">billed annually</p>
                )}
              </div>
              <div className="mt-3 min-h-[56px] rounded-card border border-border bg-background/50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-sm text-foreground">Annual billing</span>
                  <Switch
                    checked={billingCycle === "annual"}
                    onCheckedChange={(checked) => setBillingCycle(checked ? "annual" : "monthly")}
                    aria-label="Toggle annual billing"
                  />
                </div>
                <p className="mt-1 text-caption text-accent">Save 20%</p>
              </div>
              <div className="mt-1">
                <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  <Link to="/auth/signup">Continue</Link>
                </Button>
              </div>
              <div className="mt-3 min-h-[76px] rounded-card border border-border bg-background/50 p-2">
                <div className="mb-1 text-caption text-muted-foreground">
                  <TooltipLabel label="AI credits / month" tooltip={CREDITS_TOOLTIP} />
                </div>
                <Select
                  value={String(selectedCreditsMaster)}
                  onValueChange={(value) => setSelectedCreditsMaster(Number(value) as CreditsOption)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select credits" />
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
              <div className="mt-3 text-caption font-medium text-muted-foreground">Everything in Free, plus:</div>
              <ul className="mt-2 flex-1 space-y-2">
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Up to 5 active projects</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Collaborate with up to 3 participants</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <TooltipLabel label="AI credits / month" tooltip={CREDITS_TOOLTIP} />
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>+5 daily AI credits (up to 150/month extra)</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Increased storage</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Email support</span>
                </li>
              </ul>
            </article>

            {/* Business */}
            <article className="glass rounded-panel p-sp-3 h-full flex flex-col">
              <h2 className="text-h3 text-foreground">Business</h2>
              <p className="mt-2 text-body-sm text-muted-foreground">
                Designed for growing teams and contractors managing multiple projects with deeper planning control.
              </p>
              <div className="mt-3">
                <p className="text-h2 font-bold text-foreground">{businessPrice}/month</p>
                {billingCycle === "annual" && (
                  <p className="text-caption text-muted-foreground">billed annually</p>
                )}
              </div>
              <div className="mt-3 min-h-[56px] rounded-card border border-border bg-background/50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-sm text-foreground">Annual billing</span>
                  <Switch
                    checked={billingCycle === "annual"}
                    onCheckedChange={(checked) => setBillingCycle(checked ? "annual" : "monthly")}
                    aria-label="Toggle annual billing"
                  />
                </div>
                <p className="mt-1 text-caption text-accent">Save 17%</p>
              </div>
              <div className="mt-1">
                <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  <Link to="/auth/signup">Continue</Link>
                </Button>
              </div>
              <div className="mt-3 min-h-[76px] rounded-card border border-border bg-background/50 p-2">
                <div className="mb-1 text-caption text-muted-foreground">
                  <TooltipLabel label="AI credits / month" tooltip={CREDITS_TOOLTIP} />
                </div>
                <Select
                  value={String(selectedCreditsBusiness)}
                  onValueChange={(value) => setSelectedCreditsBusiness(Number(value) as CreditsOption)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select credits" />
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
              <div className="mt-3 text-caption font-medium text-muted-foreground">Everything in Master, plus:</div>
              <ul className="mt-2 flex-1 space-y-2">
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Up to 25 active projects</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Team management with structured permissions</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Advanced Mode for granular planning and deeper project breakdown</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Priority support</span>
                </li>
              </ul>
            </article>

            {/* Enterprise */}
            <article className="glass rounded-panel p-sp-3 h-full flex flex-col">
              <h2 className="text-h3 text-foreground">Enterprise</h2>
              <p className="mt-2 text-body-sm text-muted-foreground">
                Tailored for large developers requiring scalable infrastructure and dedicated support.
              </p>
              <div className="mt-3">
                <p className="text-h2 font-bold text-foreground">Custom</p>
              </div>
              <div className="mt-3 min-h-[56px]" aria-hidden="true" />
              <div className="mt-1">
                <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  <Link to="/auth/signup">Continue</Link>
                </Button>
              </div>
              <div className="mt-3 min-h-[76px]" aria-hidden="true" />
              <div className="mt-3 text-caption font-medium text-muted-foreground">Everything in Business, plus:</div>
              <ul className="mt-2 flex-1 space-y-2">
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Custom project &amp; user limits</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Flexible AI credit allocation across teams</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Dedicated support manager</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>SLA options</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Enhanced security configuration</span>
                </li>
                <li className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Custom integrations &amp; onboarding support</span>
                </li>
              </ul>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
