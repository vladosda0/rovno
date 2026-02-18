import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, Bot, Wrench, Eye } from "lucide-react";

const automationLevels = [
  {
    id: "full",
    icon: Zap,
    title: "Full Automation",
    desc: "AI manages tasks, estimates, procurement, and docs. You approve.",
    badge: "Recommended",
  },
  {
    id: "assisted",
    icon: Bot,
    title: "AI Assisted",
    desc: "AI suggests changes, you review and apply manually.",
    badge: null,
  },
  {
    id: "manual",
    icon: Wrench,
    title: "Manual",
    desc: "You control everything. AI is available on request.",
    badge: null,
  },
  {
    id: "observer",
    icon: Eye,
    title: "Observer Only",
    desc: "AI provides insights and analytics. No changes proposed.",
    badge: null,
  },
];

interface OnboardingStepperProps {
  onComplete: () => void;
}

export function OnboardingStepper({ onComplete }: OnboardingStepperProps) {
  const [step, setStep] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState("full");
  const [language, setLanguage] = useState("ru");
  const [units, setUnits] = useState("metric");

  return (
    <div className="w-full max-w-2xl mx-auto space-y-sp-4">
      {/* Progress */}
      <div className="flex items-center gap-2 justify-center">
        {[0, 1].map((i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i <= step ? "w-12 bg-accent" : "w-8 bg-muted"
            }`}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="glass-elevated rounded-panel p-sp-4 space-y-sp-3">
          <div className="text-center">
            <h2 className="text-h3 text-foreground">Choose automation level</h2>
            <p className="text-body-sm text-muted-foreground mt-1">
              How much should AI manage in your projects?
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-sp-2">
            {automationLevels.map((level) => {
              const isSelected = selectedLevel === level.id;
              return (
                <button
                  key={level.id}
                  onClick={() => setSelectedLevel(level.id)}
                  className={`glass rounded-card p-sp-3 text-left transition-all relative ${
                    isSelected ? "ring-2 ring-accent" : "hover:bg-accent/5"
                  }`}
                >
                  {level.badge && (
                    <span className="absolute -top-2 right-3 inline-flex items-center rounded-pill px-2 py-0.5 text-caption font-medium bg-accent text-accent-foreground">
                      {level.badge}
                    </span>
                  )}
                  <level.icon className={`h-5 w-5 mb-sp-1 ${isSelected ? "text-accent" : "text-muted-foreground"}`} />
                  <h3 className="text-body-sm font-semibold text-foreground">{level.title}</h3>
                  <p className="text-caption text-muted-foreground mt-0.5">{level.desc}</p>
                </button>
              );
            })}
          </div>
          <Button
            onClick={() => setStep(1)}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Continue
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="glass-elevated rounded-panel p-sp-4 space-y-sp-3">
          <div className="text-center">
            <h2 className="text-h3 text-foreground">Preferences</h2>
            <p className="text-body-sm text-muted-foreground mt-1">Set your language and measurement units.</p>
          </div>
          <div className="space-y-sp-2">
            <div className="space-y-1.5">
              <label className="text-body-sm font-medium text-foreground">Language</label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ru">Русский</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-body-sm font-medium text-foreground">Measurement units</label>
              <Select value={units} onValueChange={setUnits}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="metric">Metric (m, m², kg)</SelectItem>
                  <SelectItem value="imperial">Imperial (ft, ft², lb)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-sp-2">
            <Button variant="outline" onClick={() => setStep(0)} className="flex-1">
              Back
            </Button>
            <Button
              onClick={onComplete}
              className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Complete Setup
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
