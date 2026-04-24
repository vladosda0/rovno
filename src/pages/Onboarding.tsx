import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Rocket } from "lucide-react";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { completeOnboarding } from "@/lib/auth-state";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { toast } from "@/hooks/use-toast";

export default function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const runtimeAuth = useRuntimeAuth();
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const handleComplete = () => {
    void completeOnboarding(runtimeAuth.profileId);
    toast({ title: t("onboarding.setupCompleteTitle"), description: t("onboarding.setupCompleteDescription") });
    if (createdProjectId) {
      navigate(`/project/${createdProjectId}/estimate`);
    } else {
      navigate("/home");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-sp-2">
      <div className="w-full max-w-2xl space-y-sp-3">
        <div className="text-center">
          <Rocket className="mx-auto mb-sp-2 h-10 w-10 text-accent" />
          <h1 className="text-h2 text-foreground">{t("onboarding.welcomeTitle")}</h1>
          <p className="text-body text-muted-foreground mt-1">
            {t("onboarding.welcomeSubtitle")}
          </p>
        </div>
        <OnboardingStepper
          onComplete={handleComplete}
          onProjectCreated={(id) => setCreatedProjectId(id)}
        />
      </div>
    </div>
  );
}
