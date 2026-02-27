import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { getProfileAutomationLevelMode, setProfileAutomationLevelMode } from "@/lib/auth-state";
import { toast } from "@/hooks/use-toast";

const CURRENCIES = [
  { value: "RUB", label: "₽ Russian Ruble (RUB)" },
  { value: "USD", label: "$ US Dollar (USD)" },
  { value: "EUR", label: "€ Euro (EUR)" },
  { value: "GBP", label: "£ British Pound (GBP)" },
];

const DATE_FORMATS = [
  { value: "dd.MM.yyyy", label: "DD.MM.YYYY" },
  { value: "MM/dd/yyyy", label: "MM/DD/YYYY" },
  { value: "yyyy-MM-dd", label: "YYYY-MM-DD" },
];

const AI_LANGUAGES = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "auto", label: "Same as interface" },
];

const AUTOMATION_LEVELS = [
  { value: "manual", label: "Low", description: "AI only answers questions. No auto-actions." },
  { value: "assisted", label: "Balanced", description: "AI suggests changes, you confirm before apply." },
  { value: "full", label: "High", description: "AI applies changes automatically when confident." },
];

export function PreferencesPanel() {
  const [currency, setCurrency] = useState("RUB");
  const [units, setUnits] = useState("metric");
  const [dateFormat, setDateFormat] = useState("dd.MM.yyyy");
  const [weekStart, setWeekStart] = useState("monday");
  const [aiLanguage, setAiLanguage] = useState("auto");
  const [automationLevel, setAutomationLevel] = useState(
    getProfileAutomationLevelMode() || "assisted"
  );

  const handleSave = () => {
    setProfileAutomationLevelMode(automationLevel);
    toast({ title: "Preferences saved" });
  };

  return (
    <div className="space-y-sp-3">
      <SettingsSection title="Regional" description="Currency, units, and date display preferences.">
        <div className="grid gap-sp-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Units</Label>
            <Select value={units} onValueChange={setUnits}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="metric">Metric (m, m², kg)</SelectItem>
                <SelectItem value="imperial">Imperial (ft, sq ft, lb)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date format</Label>
            <Select value={dateFormat} onValueChange={setDateFormat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Week starts on</Label>
            <Select value={weekStart} onValueChange={setWeekStart}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monday">Monday</SelectItem>
                <SelectItem value="sunday">Sunday</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="AI Preferences" description="Control how the AI assistant behaves.">
        <div className="grid gap-sp-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>AI output language</Label>
            <Select value={aiLanguage} onValueChange={setAiLanguage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AI_LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Automation level</Label>
            <Select value={automationLevel} onValueChange={setAutomationLevel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUTOMATION_LEVELS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    <div>
                      <span className="font-medium">{l.label}</span>
                      <span className="text-muted-foreground ml-1.5 text-xs">— {l.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsSection>

      <Button onClick={handleSave}>Save preferences</Button>
    </div>
  );
}
