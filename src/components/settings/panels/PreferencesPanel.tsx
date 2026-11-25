import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { toast } from "@/hooks/use-toast";
import {
  useUpdateWorkspaceProfilePreferences,
  useWorkspaceProfilePreferencesState,
} from "@/hooks/use-workspace-source";
import type {
  ProfileAiOutputLanguage,
  ProfileAutomationLevel,
  ProfileCurrency,
  ProfileDateFormat,
  ProfileUnits,
  ProfileWeekStart,
} from "@/data/workspace-source";
import { MVP_SHOW_AI_AUTOMATION_MODE_UI } from "@/lib/mvp-ai-automation-ui";
import {
  KB_COUNTRIES,
  type KbCountry,
  kbRegionAfterCountryChange,
  kbRegionsFor,
  normalizeKbCountry,
} from "@/data/kb-regions";
import { cn } from "@/lib/utils";
import { type AppLanguage, getActiveLanguage, setAppLanguage } from "@/i18n";

const INTERFACE_LANGUAGES: Array<{ value: AppLanguage; labelKey: string }> = [
  { value: "ru", labelKey: "preferences.language.ru" },
  { value: "en", labelKey: "preferences.language.en" },
];

const CURRENCIES = [
  { value: "RUB", labelKey: "preferences.currency.rub" },
  { value: "USD", labelKey: "preferences.currency.usd" },
  { value: "EUR", labelKey: "preferences.currency.eur" },
  { value: "GBP", labelKey: "preferences.currency.gbp" },
];

const DATE_FORMATS = [
  { value: "dd.MM.yyyy", label: "DD.MM.YYYY" },
  { value: "MM/dd/yyyy", label: "MM/DD/YYYY" },
  { value: "yyyy-MM-dd", label: "YYYY-MM-DD" },
];

const AI_LANGUAGES: Array<{ value: string; label?: string; labelKey?: string }> = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "auto", labelKey: "preferences.aiLanguage.auto" },
];

const AUTOMATION_LEVELS = [
  { value: "manual", labelKey: "preferences.automation.low", descKey: "preferences.automation.lowDesc" },
  { value: "assisted", labelKey: "preferences.automation.balanced", descKey: "preferences.automation.balancedDesc" },
  { value: "full", labelKey: "preferences.automation.high", descKey: "preferences.automation.highDesc" },
];

/** Region of the chosen country, with search: Russia alone has 89 (rovno-db#230). */
function KbRegionField({
  country,
  value,
  onChange,
}: {
  country: KbCountry;
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const none = t("preferences.kbRegion.none");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={`${t("preferences.kbRegion")}: ${value ?? none}`}
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <span className={cn("line-clamp-1 text-left", !value && "text-muted-foreground")}>{value ?? none}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={t("preferences.kbRegion.search")} />
          <CommandList>
            <CommandEmpty>{t("preferences.kbRegion.empty")}</CommandEmpty>
            <CommandGroup>
              <CommandItem value={none} onSelect={() => { onChange(null); setOpen(false); }}>
                <Check className={cn("mr-2 h-4 w-4", value === null ? "opacity-100" : "opacity-0")} aria-hidden />
                <span className="text-muted-foreground">{none}</span>
              </CommandItem>
              {kbRegionsFor(country).map((region) => (
                <CommandItem key={region} value={region} onSelect={() => { onChange(region); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === region ? "opacity-100" : "opacity-0")} aria-hidden />
                  {region}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function PreferencesPanel() {
  const { t } = useTranslation();
  const {
    preferences,
    isError: preferencesLoadFailed,
    isRefetching: preferencesRefetching,
    refetch: refetchPreferences,
  } = useWorkspaceProfilePreferencesState();
  const updatePreferences = useUpdateWorkspaceProfilePreferences();
  const [interfaceLanguage, setInterfaceLanguage] = useState<AppLanguage>(() => getActiveLanguage());
  const [currency, setCurrency] = useState("RUB");
  const [units, setUnits] = useState("metric");
  const [dateFormat, setDateFormat] = useState("dd.MM.yyyy");
  const [weekStart, setWeekStart] = useState("monday");
  const [aiLanguage, setAiLanguage] = useState("auto");
  const [automationLevel, setAutomationLevel] = useState("manual");
  const [kbCountry, setKbCountry] = useState<KbCountry>("RU");
  const [kbRegion, setKbRegion] = useState<string | null>(null);

  const handleKbCountryChange = (next: string) => {
    const country = normalizeKbCountry(next);
    setKbRegion((region) => kbRegionAfterCountryChange(kbCountry, country, region));
    setKbCountry(country);
  };

  const handleInterfaceLanguageChange = (next: string) => {
    const lang: AppLanguage = next === "en" ? "en" : "ru";
    setInterfaceLanguage(lang);
    setAppLanguage(lang);
    toast({ title: t("preferences.languageChangedToast") });
  };

  useEffect(() => {
    if (!preferences) return;
    setCurrency(preferences.currency);
    setUnits(preferences.units);
    setDateFormat(preferences.dateFormat);
    setWeekStart(preferences.weekStart);
    setAiLanguage(preferences.aiOutputLanguage);
    setAutomationLevel(preferences.automationLevel);
    setKbCountry(normalizeKbCountry(preferences.kbCountry));
    setKbRegion(preferences.kbRegion ?? null);
  }, [preferences]);

  const handleSave = async () => {
    try {
      await updatePreferences.mutateAsync({
        currency: currency as ProfileCurrency,
        units: units as ProfileUnits,
        dateFormat: dateFormat as ProfileDateFormat,
        weekStart: weekStart as ProfileWeekStart,
        aiOutputLanguage: aiLanguage as ProfileAiOutputLanguage,
        automationLevel: (MVP_SHOW_AI_AUTOMATION_MODE_UI ? automationLevel : "manual") as ProfileAutomationLevel,
        kbCountry,
        kbRegion,
      });
      toast({ title: t("preferences.savedToast") });
    } catch {
      toast({
        title: t("preferences.saveFailedToast"),
        description: t("preferences.saveFailedDescription"),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-sp-3">
      <SettingsSection title={t("preferences.interface.title")} description={t("preferences.interface.description")}>
        <div className="grid gap-sp-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("preferences.interfaceLanguage")}</Label>
            <Select value={interfaceLanguage} onValueChange={handleInterfaceLanguageChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTERFACE_LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{t(l.labelKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t("preferences.regional.title")} description={t("preferences.regional.description")}>
        <div className="grid gap-sp-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("preferences.kbCountry")}</Label>
            <Select value={kbCountry} onValueChange={handleKbCountryChange}>
              <SelectTrigger aria-label={t("preferences.kbCountry")}><SelectValue /></SelectTrigger>
              <SelectContent>
                {KB_COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>{t(`preferences.kbCountry.name.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("preferences.kbRegion")}</Label>
            <KbRegionField country={kbCountry} value={kbRegion} onChange={setKbRegion} />
          </div>
          <p className="text-caption text-muted-foreground sm:col-span-2">{t("preferences.kbLocation.hint")}</p>
          <div className="space-y-1.5">
            <Label>{t("preferences.currency")}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{t(c.labelKey)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("preferences.units")}</Label>
            <Select value={units} onValueChange={setUnits}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="metric">{t("preferences.units.metric")}</SelectItem>
                <SelectItem value="imperial">{t("preferences.units.imperial")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("preferences.dateFormat")}</Label>
            <Select value={dateFormat} onValueChange={setDateFormat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("preferences.weekStart")}</Label>
            <Select value={weekStart} onValueChange={setWeekStart}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monday">{t("preferences.weekStart.monday")}</SelectItem>
                <SelectItem value="sunday">{t("preferences.weekStart.sunday")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t("preferences.ai.title")} description={t("preferences.ai.description")}>
        <div className="grid gap-sp-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("preferences.aiLanguage")}</Label>
            <Select value={aiLanguage} onValueChange={setAiLanguage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AI_LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.labelKey ? t(l.labelKey) : l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {MVP_SHOW_AI_AUTOMATION_MODE_UI ? (
          <div className="space-y-1.5">
            <Label>{t("preferences.automation")}</Label>
            <Select value={automationLevel} onValueChange={setAutomationLevel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUTOMATION_LEVELS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    <div>
                      <span className="font-medium">{t(l.labelKey)}</span>
                      <span className="text-muted-foreground ml-1.5 text-xs">— {t(l.descKey)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          ) : null}
        </div>
      </SettingsSection>

      {preferencesLoadFailed && !preferences ? (
        <div className="flex flex-wrap items-center gap-sp-2 pt-sp-1">
          <p role="alert" className="text-body-sm text-foreground">
            {t("preferences.loadFailed")}
          </p>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={preferencesRefetching}
            onClick={refetchPreferences}
          >
            {t("common.retry")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-sp-2 pt-sp-1">
          <Button
            className="w-full sm:w-auto"
            disabled={!preferences || updatePreferences.isPending}
            onClick={() => void handleSave()}
          >
            {updatePreferences.isPending ? t("preferences.saving") : t("preferences.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
