import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "@/hooks/use-mock-data";
import {
  useWorkspaceMode,
  useWorkspaceProfileContactInfoState,
  useUpdateWorkspaceProfileContactInfo,
  useUpdateWorkspaceProfileIdentity,
} from "@/hooks/use-workspace-source";
import { useAvatarUpload } from "@/hooks/use-avatar-upload";
import { SignInPrompt } from "@/components/settings/SignInPrompt";
import { PHONE_PREFILL, phoneValueForSave } from "@/lib/phone";
import {
  AUTO_TIMEZONE,
  isUnsetProfileTimezone,
  readBrowserTimezone,
  readTimezoneFromBrowser,
  rememberTimezoneFromBrowser,
  timezoneSelectValue,
  timezoneToStore,
  UTC_OPTION,
} from "@/lib/profile-timezone";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { GenderChoice, type GenderChoiceValue } from "@/components/settings/GenderChoice";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const TIMEZONES = [
  { value: AUTO_TIMEZONE, labelKey: "profile.timezoneOption.auto" },
  { value: UTC_OPTION, label: "UTC (UTC+0)" },
  { value: "Europe/Moscow", label: "Europe/Moscow (UTC+3)" },
  { value: "Europe/London", label: "Europe/London (UTC+0)" },
  { value: "America/New_York", label: "America/New York (UTC-5)" },
  { value: "America/Los_Angeles", label: "America/Los Angeles (UTC-8)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (UTC+9)" },
] as const;

// The interface language lives in Настройки > Предпочтения and NOWHERE else
// (rovno #186). This panel used to carry a second selector that wrote
// profiles.locale while Предпочтения wrote localStorage, so the two disagreed and
// saving any unrelated field here silently overwrote a language chosen there.
//
// This panel no longer sends `locale` at all. That is safe because
// updateProfileIdentity is a genuine partial update (`if (patch.locale !==
// undefined)` in the Supabase source; the browser source applies only `gender`
// and ignores the rest), so omitting the field leaves the column untouched rather than
// nulling it. workspace-source.identity.test.ts pins that invariant, because it
// is now the only thing standing between a Профиль save and a reset locale.
//
// NOTE on profiles.locale itself: after this change nothing writes it and
// nothing reads it. A pre-merge review established there is no reader anywhere,
// not in any component, edge function or SQL function (AI answer language comes
// from profile_settings.ai_output_language). An earlier revision of this change
// added a write from Предпочтения justified as feeding "AI and notification
// language"; that justification was simply false, and the write brought a race,
// a rarely-firing trigger and Sentry noise with it, so it was dropped. Reading
// the column at boot is option A on #186 and needs a backfill first: today's
// rows say 'en' only by accident of the old column default.
export function ProfilePanel() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { contactInfo } = useWorkspaceProfileContactInfoState();
  const updateIdentity = useUpdateWorkspaceProfileIdentity();
  const updateContactInfo = useUpdateWorkspaceProfileContactInfo();
  const { uploadAvatar } = useAvatarUpload();
  const fileRef = useRef<HTMLInputElement>(null);

  const workspaceMode = useWorkspaceMode();
  // Identity / contact-info writes succeed against the in-memory store in demo /
  // local mode and against Supabase in supabase mode. In guest / pending-supabase
  // there's a Supabase backend but no session, so mutateAsync throws ("Profile is
  // not available yet.") and Save / avatar upload surface a destructive toast.
  const canEditProfile =
    workspaceMode.kind === "demo" ||
    workspaceMode.kind === "local" ||
    workspaceMode.kind === "supabase";
  // Only the stable logged-out state gets the sign-in prompt; pending-supabase is
  // a sub-second auth-resolving flash, so we keep the form quiet there and just
  // block the doomed actions.
  const needsSignIn = workspaceMode.kind === "guest";

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [roleTitle, setRoleTitle] = useState("");
  const [phone, setPhone] = useState(PHONE_PREFILL);
  // The database holds a real zone even when the auto option is the one chosen; that the zone
  // came from this browser is remembered on the device, and the select shows it as auto again.
  const [timezoneFromBrowser, setTimezoneFromBrowser] = useState(() => readTimezoneFromBrowser(user.id));
  const storedTimezone = timezoneSelectValue(user.timezone, timezoneFromBrowser);
  const [timezone, setTimezone] = useState(storedTimezone);
  // Picking in the select is what makes a zone the person's own: the default `UTC` shows as
  // the UTC option too, and saving some other field must not turn it into a chosen one.
  const [timezoneTouched, setTimezoneTouched] = useState(false);
  const pickTimezone = (value: string) => {
    setTimezone(value);
    setTimezoneTouched(true);
  };
  const storedGender: GenderChoiceValue = user.gender ?? null;
  // Undefined until the person picks: the field then shows what the profile carries, so a
  // value that arrives after the form opened is neither hidden nor overwritten by a save.
  const [genderPick, setGenderPick] = useState<GenderChoiceValue | undefined>(undefined);
  const gender = genderPick === undefined ? storedGender : genderPick;
  const [signature, setSignature] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(user.avatar ?? "");
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Seed identity fields once the current user resolves (async in supabase mode).
  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
    const fromBrowser = readTimezoneFromBrowser(user.id);
    setTimezoneFromBrowser(fromBrowser);
    setTimezone(timezoneSelectValue(user.timezone, fromBrowser));
    setTimezoneTouched(false);
    setAvatarUrl(user.avatar ?? "");
    setGenderPick(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // The app writes the browser's zone into a profile that never had one, possibly while this
  // form is open. A selection still on the unset value follows it; anything picked here stays.
  useEffect(() => {
    const fromBrowser = readTimezoneFromBrowser(user.id);
    if (fromBrowser !== true || timezoneFromBrowser !== null) return;
    setTimezoneFromBrowser(true);
    setTimezone((selected) => (isUnsetProfileTimezone(selected) ? AUTO_TIMEZONE : selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.timezone]);

  // Seed contact-info fields once per active user. Keyed on user.id so a
  // background refetch can't clobber in-progress edits, but switching the active
  // profile (Settings stays mounted) re-seeds for the new user.
  const contactSeededForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!contactInfo || contactSeededForRef.current === user.id) return;
    contactSeededForRef.current = user.id;
    setRoleTitle(contactInfo.roleTitle ?? "");
    setPhone(contactInfo.phone ?? PHONE_PREFILL);
    setBio(contactInfo.bio ?? "");
    setSignature(contactInfo.signatureBlock ?? "");
  }, [contactInfo, user.id]);

  // `<SelectValue />` has no placeholder, so a zone the list does not carry
  // renders as an empty trigger (rovno #54). Carry BOTH the persisted zone and
  // the selected one: either can be off the list, and either can change without
  // the other.
  const extraZones = [storedTimezone, timezone].filter(
    (value, i, all) => all.indexOf(value) === i && !TIMEZONES.some((tz) => tz.value === value),
  );
  const timezoneOptions: readonly ({ value: string; label: string } | { value: string; labelKey: string })[] =
    [...TIMEZONES, ...extraZones.map((value) => ({ value, label: value }))];

  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const saving = updateIdentity.isPending || updateContactInfo.isPending;

  const followsBrowser = timezone === AUTO_TIMEZONE;
  const timezoneToSave = followsBrowser ? readBrowserTimezone() : timezoneToStore(timezone);
  const timezoneDirty =
    timezoneTouched && timezoneToSave !== null && (timezone !== storedTimezone || timezoneToSave !== user.timezone);

  const isDirty =
    name !== user.name ||
    (avatarUrl ?? "") !== (user.avatar ?? "") ||
    timezoneDirty ||
    gender !== storedGender ||
    roleTitle !== (contactInfo?.roleTitle ?? "") ||
    (phoneValueForSave(phone) ?? "") !== (contactInfo?.phone ?? "") ||
    bio !== (contactInfo?.bio ?? "") ||
    signature !== (contactInfo?.signatureBlock ?? "");

  async function handleAvatarSelect(file: File | null) {
    if (!file) return;
    setAvatarUploading(true);
    try {
      const { url } = await uploadAvatar(file);
      setAvatarUrl(url);
    } catch (error) {
      toast({
        title: t("profile.avatar.uploadFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setAvatarUploading(false);
    }
  }

  const handleSave = async () => {
    try {
      await Promise.all([
        // No `locale` here on purpose. This is a partial update, so omitting the
        // field leaves the column alone; Настройки > Предпочтения owns it.
        updateIdentity.mutateAsync({
          fullName: name.trim() || null,
          avatarUrl: avatarUrl || null,
          // Left out unless the person picked a zone: the column then keeps its value.
          ...(timezoneDirty && timezoneToSave ? { timezone: timezoneToSave } : {}),
          // Left out unless it changed, like the zone.
          ...(gender !== storedGender ? { gender } : {}),
        }),
        updateContactInfo.mutateAsync({
          roleTitle: roleTitle.trim() || null,
          phone: phoneValueForSave(phone),
          bio: bio.trim() || null,
          signatureBlock: signature.trim() || null,
        }),
      ]);
      if (timezoneDirty && workspaceMode.kind === "supabase") {
        rememberTimezoneFromBrowser(user.id, followsBrowser);
        setTimezoneFromBrowser(followsBrowser);
      }
      setTimezoneTouched(false);
      setGenderPick(undefined);
      toast({ title: t("profile.savedToast"), description: t("profile.savedToastDescription") });
    } catch (error) {
      toast({
        title: t("profile.saveFailedToast"),
        description: error instanceof Error ? error.message : t("profile.saveFailedDescription"),
        variant: "destructive",
      });
    }
  };

  const handleDiscard = () => {
    setName(user.name);
    setTimezone(storedTimezone);
    setTimezoneTouched(false);
    setAvatarUrl(user.avatar ?? "");
    setGenderPick(undefined);
    setRoleTitle(contactInfo?.roleTitle ?? "");
    setPhone(contactInfo?.phone ?? PHONE_PREFILL);
    setBio(contactInfo?.bio ?? "");
    setSignature(contactInfo?.signatureBlock ?? "");
  };

  return (
    <div className="space-y-sp-3">
      <SettingsSection title={t("profile.section.title")} description={t("profile.section.description")}>
        {/* Avatar */}
        <div className="flex flex-wrap items-center gap-sp-2">
          <div className="relative">
            <Avatar className="h-16 w-16">
              {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
              <AvatarFallback className="text-h3 bg-accent text-accent-foreground">{initials}</AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarUploading || !canEditProfile}
              aria-label={t("profile.avatar.upload")}
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-secondary border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-60"
            >
              {avatarUploading ? (
                <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleAvatarSelect(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <p className="text-body-sm font-medium text-foreground">{name}</p>
            <p className="text-caption text-muted-foreground">
              {avatarUploading ? t("profile.avatar.uploading") : t("profile.avatar.upload")}
            </p>
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
            <Select value={timezone} onValueChange={pickTimezone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {timezoneOptions.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {"labelKey" in tz ? t(tz.labelKey) : tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("profile.gender.label")}</Label>
            <GenderChoice value={gender} onChange={setGenderPick} disabled={saving} />
          </div>
        </div>
        <p className="text-caption text-muted-foreground">{t("profile.gender.hint")}</p>

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
      {needsSignIn ? (
        <div className="pt-sp-1">
          <SignInPrompt hint={t("profile.signInHint")} ctaLabel={t("profile.signIn")} />
        </div>
      ) : (
        <div className="flex flex-wrap gap-sp-2 pt-sp-1">
          <Button
            className="w-full sm:w-auto"
            onClick={handleSave}
            disabled={!isDirty || saving || avatarUploading || !canEditProfile}
          >
            {saving ? t("profile.saving") : t("profile.save")}
          </Button>
          {isDirty && (
            <Button variant="ghost" className="w-full sm:w-auto" onClick={handleDiscard} disabled={saving}>
              {t("profile.discard")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
