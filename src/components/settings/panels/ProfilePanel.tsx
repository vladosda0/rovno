import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "@/hooks/use-mock-data";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Camera } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const TIMEZONES = [
  { value: "auto", labelKey: "profile.timezoneOption.auto" },
  { value: "Europe/Moscow", label: "Europe/Moscow (UTC+3)" },
  { value: "Europe/London", label: "Europe/London (UTC+0)" },
  { value: "America/New_York", label: "America/New York (UTC-5)" },
  { value: "America/Los_Angeles", label: "America/Los Angeles (UTC-8)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (UTC+9)" },
] as const;

const LANGUAGES: { value: string; label: string; disabled?: boolean }[] = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch", disabled: true },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español", disabled: true },
];

function normalizeSelectableLanguage(locale: string | undefined): string {
  const raw = locale || "en";
  if (raw === "de" || raw === "es") return "en";
  return raw;
}

export function ProfilePanel() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const initials = user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const [name, setName] = useState(user.name);
  const [email] = useState(user.email);
  const [roleTitle, setRoleTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState(user.timezone || "auto");
  const [language, setLanguage] = useState(() => normalizeSelectableLanguage(user.locale));
  const [signature, setSignature] = useState("");
  const [bio, setBio] = useState("");

  const isDirty = name !== user.name || roleTitle || phone || signature || bio || timezone !== (user.timezone || "auto") || language !== normalizeSelectableLanguage(user.locale);

  const handleSave = () => {
    toast({ title: t("profile.savedToast"), description: t("profile.savedToastDescription") });
  };

  const handleDiscard = () => {
    setName(user.name);
    setRoleTitle("");
    setPhone("");
    setTimezone(user.timezone || "auto");
    setLanguage(normalizeSelectableLanguage(user.locale));
    setSignature("");
    setBio("");
  };

  return (
    <div className="space-y-sp-3">
      <SettingsSection title={t("profile.section.title")} description={t("profile.section.description")}>
        {/* Avatar */}
        <div className="flex flex-wrap items-center gap-sp-2">
          <div className="relative">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-h3 bg-accent text-accent-foreground">{initials}</AvatarFallback>
            </Avatar>
            <button className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-secondary border border-border flex items-center justify-center hover:bg-muted transition-colors">
              <Camera className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          <div>
            <p className="text-body-sm font-medium text-foreground">{user.name}</p>
            <p className="text-caption text-muted-foreground">{t("profile.avatar.uploadComingSoon")}</p>
          </div>
        </div>

        {/* Fields */}
        <div className="grid gap-sp-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("profile.fullName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("profile.email")}</Label>
            <Input value={email} disabled className="opacity-60" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("profile.roleTitle")}</Label>
            <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder={t("profile.roleTitlePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("profile.phone")}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("profile.phonePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("profile.timezone")}</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {"labelKey" in tz ? t(tz.labelKey) : tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("profile.language")}</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value} disabled={lang.disabled}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("profile.bio")}</Label>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t("profile.bioPlaceholder")} rows={2} />
        </div>

        <div className="space-y-1.5">
          <Label>{t("profile.signature")}</Label>
          <Textarea value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={t("profile.signaturePlaceholder")} rows={3} />
        </div>
      </SettingsSection>

      {/* Actions */}
      <div className="flex flex-wrap gap-sp-2 pt-sp-1">
        <Button className="w-full sm:w-auto" onClick={handleSave} disabled={!isDirty}>{t("profile.save")}</Button>
        {isDirty && (
          <Button variant="ghost" className="w-full sm:w-auto" onClick={handleDiscard}>{t("profile.discard")}</Button>
        )}
      </div>
    </div>
  );
}
