import { useNavigate } from "react-router-dom";
import { useCurrentUser } from "@/hooks/use-mock-data";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, CreditCard, Settings, Shield, SlidersHorizontal, User } from "lucide-react";

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

export default function Profile() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const initials = user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const total = user.credits_free + user.credits_paid;

  return (
    <div className="p-sp-3 max-w-3xl mx-auto">
      <h1 className="text-h3 text-foreground flex items-center gap-2 mb-sp-3">
        <User className="h-5 w-5" />
        Your profile
      </h1>

      <div className="grid gap-sp-2 sm:grid-cols-2">
        {/* Profile summary */}
        <Card className="sm:col-span-2">
          <CardContent className="p-sp-3 flex items-center gap-sp-2">
            <Avatar className="h-14 w-14 shrink-0">
              <AvatarFallback className="text-h3 bg-accent text-accent-foreground">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-body font-semibold text-foreground">{user.name}</p>
              <p className="text-body-sm text-muted-foreground">{user.email}</p>
              <Badge variant="secondary" className="mt-1 capitalize">{PLAN_LABELS[user.plan] || user.plan} plan</Badge>
            </div>
            <Button variant="outline" onClick={() => navigate("/settings?tab=profile")}>
              <Settings className="h-4 w-4 mr-1.5" />
              Edit profile
            </Button>
          </CardContent>
        </Card>

        {/* Plan + Credits */}
        <Card>
          <CardContent className="p-sp-3 space-y-2">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-accent" />
              <p className="text-body-sm font-semibold text-foreground">Plan & Credits</p>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-h3 font-bold text-foreground">{total}</span>
              <span className="text-caption text-muted-foreground">credits remaining</span>
            </div>
            <p className="text-caption text-muted-foreground">
              {user.credits_free} daily · {user.credits_paid} paid
            </p>
            <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/settings?tab=billing")}>
              <CreditCard className="h-3.5 w-3.5 mr-1.5" />
              Manage billing
            </Button>
          </CardContent>
        </Card>

        {/* Preferences shortcut */}
        <Card>
          <CardContent className="p-sp-3 space-y-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-info" />
              <p className="text-body-sm font-semibold text-foreground">Preferences</p>
            </div>
            <p className="text-caption text-muted-foreground">
              Currency, units, date format, AI automation level, and language settings.
            </p>
            <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/settings?tab=preferences")}>
              Preferences
            </Button>
          </CardContent>
        </Card>

        {/* Security shortcut */}
        <Card className="sm:col-span-2">
          <CardContent className="p-sp-3 flex items-center gap-sp-2">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body-sm font-semibold text-foreground">Security</p>
              <p className="text-caption text-muted-foreground">Active sessions, 2FA, and connected accounts.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/settings?tab=security")}>
              Security
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
