import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface PlanCard {
  name: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  popular?: boolean;
}

const plans: PlanCard[] = [
  {
    name: "Free",
    price: "0 ₽",
    period: "/month",
    features: ["1 project", "50 AI credits/day", "Basic reports", "Email support"],
    cta: "Get Started",
  },
  {
    name: "Pro",
    price: "1,490 ₽",
    period: "/month",
    features: ["5 projects", "300 AI credits/day", "Full reports", "Priority support", "Team roles"],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    name: "Business",
    price: "4,990 ₽",
    period: "/month",
    features: ["Unlimited projects", "Unlimited AI credits", "Custom templates", "API access", "Dedicated manager"],
    cta: "Contact Sales",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: ["Everything in Business", "On-premise option", "SLA guarantee", "SSO / SAML", "Custom integrations"],
    cta: "Contact Us",
  },
];

export function PricingTeaser() {
  return (
    <section className="max-w-5xl mx-auto">
      <h2 className="text-h2 text-foreground text-center mb-sp-1">Simple, transparent pricing</h2>
      <p className="text-body text-muted-foreground text-center mb-sp-4">Start free. Scale when you're ready.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-sp-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`glass rounded-card p-sp-3 flex flex-col relative ${
              plan.popular ? "ring-2 ring-accent" : ""
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-pill px-2.5 py-0.5 text-caption font-medium bg-accent text-accent-foreground">
                Most popular
              </span>
            )}
            <h3 className="text-body font-semibold text-foreground">{plan.name}</h3>
            <div className="mt-sp-1 mb-sp-2">
              <span className="text-h2 font-bold text-foreground">{plan.price}</span>
              <span className="text-body-sm text-muted-foreground">{plan.period}</span>
            </div>
            <ul className="space-y-1.5 mb-sp-3 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-body-sm text-muted-foreground">
                  <Check className="h-4 w-4 shrink-0 text-success mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <Button
              asChild
              className={plan.popular ? "bg-accent text-accent-foreground hover:bg-accent/90 w-full" : "w-full"}
              variant={plan.popular ? "default" : "outline"}
            >
              <Link to="/auth/signup">{plan.cta}</Link>
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
