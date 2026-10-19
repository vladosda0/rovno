import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { UserGender } from "@/types/entities";

export type GenderChoiceValue = UserGender | null;

const OPTIONS: readonly { value: GenderChoiceValue; labelKey: string }[] = [
  { value: "male", labelKey: "profile.gender.male" },
  { value: "female", labelKey: "profile.gender.female" },
  { value: null, labelKey: "profile.gender.unset" },
];

interface GenderChoiceProps {
  value: GenderChoiceValue;
  onChange: (value: GenderChoiceValue) => void;
  disabled?: boolean;
}

/** The three buttons of the «Пол» field, shared by onboarding and Настройки > Профиль. */
export function GenderChoice({ value, onChange, disabled }: GenderChoiceProps) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("profile.gender.label")} className="flex flex-wrap gap-2">
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value ?? "unset"}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-10 flex-1 whitespace-nowrap rounded-md border px-3 text-sm transition-colors disabled:opacity-60",
              selected
                ? "border-accent bg-accent/10 font-medium text-foreground ring-1 ring-accent"
                : "border-input bg-background text-muted-foreground hover:bg-accent/5",
            )}
          >
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
