import { useNavigate } from "react-router-dom";
import { Rocket } from "lucide-react";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { completeOnboarding } from "@/lib/auth-state";
import { toast } from "@/hooks/use-toast";

export default function Onboarding() {
  const navigate = useNavigate();

  const handleComplete = () => {
    completeOnboarding();
    toast({ title: "Setup complete!", description: "Your workspace is ready." });
    navigate("/home");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-sp-2">
      <div className="w-full max-w-2xl space-y-sp-3">
        <div className="text-center">
          <Rocket className="mx-auto mb-sp-2 h-10 w-10 text-accent" />
          <h1 className="text-h2 text-foreground">Welcome to СтройАгент</h1>
          <p className="text-body text-muted-foreground mt-1">
            Let's set up your workspace in two quick steps.
          </p>
        </div>
        <OnboardingStepper onComplete={handleComplete} />
      </div>
    </div>
  );
}
