import { EmptyState } from "@/components/EmptyState";
import { CreditCard } from "lucide-react";

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <EmptyState
        icon={CreditCard}
        title="Pricing"
        description="Pricing plans will be available soon."
      />
    </div>
  );
}
