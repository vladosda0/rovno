import { useNavigate } from "react-router-dom";
import { useCurrentUser } from "@/hooks/use-mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { AlertTriangle, Coins, CreditCard, Sparkles } from "lucide-react";

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

export function BillingPanel() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const total = user.credits_free + user.credits_paid;
  const isEmpty = total <= 0;
  const maxCredits = 300;
  const pct = Math.min((total / maxCredits) * 100, 100);

  return (
    <div className="space-y-sp-3">
      <SettingsSection title="Billing & Credits" description="Manage your plan and AI credits.">
        {/* Plan card */}
        <Card>
          <CardContent className="p-1.5 px-sp-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="h-9 w-9 rounded-panel bg-accent/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-accent" />
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <p className="text-body font-semibold text-foreground">
                  {PLAN_LABELS[user.plan] || user.plan} plan
                </p>
                <Badge variant="secondary" className="text-[10px] capitalize">{user.plan}</Badge>
              </div>
              <p className="text-caption text-muted-foreground">Your current subscription tier</p>
            </div>
            <Button variant="outline" size="sm" className="w-full sm:w-auto sm:shrink-0" onClick={() => navigate("/pricing")}>Compare plans</Button>
          </CardContent>
        </Card>

        {/* Credits */}
        <div className="space-y-sp-2">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-accent" />
            <p className="text-body-sm font-semibold text-foreground">Credits remaining</p>
          </div>

          <div className="grid gap-sp-2 sm:grid-cols-2">
            <Card className="bg-muted/30">
              <CardContent className="p-1.5 px-sp-2 space-y-0.5">
                <p className="text-caption text-muted-foreground">Free (daily)</p>
                <p className="text-h3 font-bold text-foreground">{user.credits_free}</p>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="p-1.5 px-sp-2 space-y-0.5">
                <p className="text-caption text-muted-foreground">Paid</p>
                <p className="text-h3 font-bold text-foreground">{user.credits_paid}</p>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-panel bg-muted/40 p-1.5 px-sp-2 space-y-1.5">
            <div className="flex justify-between text-caption text-muted-foreground">
              <span>Total: {total}</span>
              <span>{maxCredits} max</span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>

          {isEmpty && (
            <Card className="border-warning/30 bg-warning/5">
              <CardContent className="p-1.5 px-sp-2 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                <div>
                  <p className="text-body-sm font-medium text-foreground">No credits remaining</p>
                  <p className="text-caption text-muted-foreground">Upgrade your plan to continue using AI features.</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-sp-2 pt-sp-1">
            <Button className="w-full sm:w-auto" onClick={() => navigate("/pricing")}>
              <CreditCard className="h-4 w-4 mr-1.5" />
              Purchase credits
            </Button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
