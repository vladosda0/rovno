import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface CheckoutBlockedProps {
  planName: string;
  periodEndsLabel: string | null;
  manageHref: string;
}

// Shown by Checkout when the user already has an active subscription, so a second
// purchase (which would double-charge — audit M2) is prevented.
export function CheckoutBlocked({ planName, periodEndsLabel, manageHref }: CheckoutBlockedProps) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-sp-3 py-sp-6 text-center">
      <h1 className="text-h2 text-foreground">{t("billing.checkout.alreadySubscribed.title")}</h1>
      <p className="mt-sp-2 text-body text-muted-foreground">
        {periodEndsLabel
          ? t("billing.checkout.alreadySubscribed.description", { plan: planName, date: periodEndsLabel })
          : t("billing.checkout.alreadySubscribed.descriptionNoDate", { plan: planName })}
      </p>
      <div className="mt-sp-4 flex w-full flex-col gap-sp-2">
        <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Link to={manageHref}>{t("billing.checkout.alreadySubscribed.cta")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/#pricing">{t("billing.checkout.back")}</Link>
        </Button>
      </div>
    </div>
  );
}
