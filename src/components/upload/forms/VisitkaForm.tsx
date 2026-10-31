import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { useAvatarUpload } from "@/hooks/use-avatar-upload";
import { useUserOrganizations, useActiveOrg, orgQueryKeys } from "@/hooks/use-orgs";
import {
  createOrgWithContractorProfile,
  upsertContractorProfileForOrg,
  submitContractorProfileForModeration,
  type ContractorProfileData,
} from "@/data/contractor-profile-source";
import { slugifyOrgName, isValidOrgSlug } from "@/lib/transliterate";
import { TierLockTooltip } from "@/components/billing/TierLockTooltip";
import { PHONE_PREFILL, phoneIsFilled } from "@/lib/phone";
import type { UploadResult } from "@/components/upload/types";
import { PartyStatusTag, partyTagKind } from "@/components/requisites/PartyStatusTag";
import { useContractorProfile } from "@/hooks/use-contractor-profile";
import { ContractorCard } from "@/components/contractor-card/ContractorCard";
import { type CardRegistry, useCardRegistry } from "@/components/contractor-card/use-card-registry";
import type { ContractorCardData } from "@/components/contractor-card/ContractorCardFace";
import {
  CARD_SHADES,
  cardInitials,
  cardShade,
  normalizeTelegram,
  shadeBackground,
  telegramFieldValue,
  webLink,
} from "@/lib/contractor-card";
import { cn } from "@/lib/utils";

export interface VisitkaFormProps {
  onBack: () => void;
  onClose: () => void;
  onComplete?: (result: UploadResult) => void;
}

interface SavedState {
  orgId: string;
  profileId: string;
}

/** Prepend https:// when the user typed a bare domain like "rovno.ai". */
function normalizeWebsite(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isPlausibleWebsite(value: string): boolean {
  return webLink(value) !== null;
}

const COVER_MAX_BYTES = 5 * 1024 * 1024;

type SocialField = "vk" | "max" | "youtube";
const SOCIAL_FIELDS: SocialField[] = ["vk", "max", "youtube"];

function DesignTile({
  label,
  hint,
  thumb,
  filled,
  busy,
  disabled,
  accept,
  onSelect,
  onRemove,
}: {
  label: React.ReactNode;
  hint: string;
  thumb: React.ReactNode;
  filled: boolean;
  busy: boolean;
  disabled: boolean;
  accept: string;
  onSelect: (file: File | null) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/60 p-2.5">
      {thumb}
      <div className="flex min-w-0 flex-[1_1_170px] flex-col gap-0.5">
        <span className="text-body-sm font-medium">{label}</span>
        <span className="text-caption text-muted-foreground">{hint}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled || busy}
        onChange={(event) => {
          onSelect(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
        {t(filled ? "upload.modal.step3.visitka.appearance.replace" : "upload.modal.step3.visitka.appearance.upload")}
      </Button>
      {filled ? (
        <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} onClick={onRemove}>
          {t("upload.modal.step3.visitka.appearance.remove")}
        </Button>
      ) : null}
    </div>
  );
}

function FormPreview({ card, registry }: { card: ContractorCardData; registry: CardRegistry }) {
  const { t } = useTranslation();
  const { check, details } = registry;
  return (
    <div className="flex flex-col items-center gap-2">
      <ContractorCard card={card} check={check} details={details} ariaLabel={t("upload.modal.step3.visitka.previewAria")} />
      <span className="text-center text-caption text-muted-foreground">{t("upload.modal.step3.visitka.previewHint")}</span>
    </div>
  );
}

/** Remounts on another organization: the fields of one card must never be saved into another. */
export function VisitkaForm(props: VisitkaFormProps) {
  const orgsQuery = useUserOrganizations();
  const activeOrg = useActiveOrg();
  const orgs = orgsQuery.data ?? [];
  const targetId = (activeOrg ?? orgs[0] ?? null)?.id ?? null;
  // A person without an organization gets one on save, and the saved screen must survive that.
  const startedSolo = useRef<boolean | null>(null);
  if (startedSolo.current === null && !orgsQuery.isLoading) startedSolo.current = targetId === null;
  return <VisitkaFormFields key={startedSolo.current ? "solo" : targetId ?? "pending"} {...props} />;
}

function VisitkaFormFields({ onBack, onClose, onComplete }: VisitkaFormProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const orgsQuery = useUserOrganizations();
  const activeOrg = useActiveOrg();
  const { uploadAvatar } = useAvatarUpload();

  const orgs = orgsQuery.data ?? [];
  const targetOrg = activeOrg ?? orgs[0] ?? null;
  const hasOrg = orgs.length > 0;
  const profileQuery = useContractorProfile(hasOrg ? targetOrg?.id : null);
  const existingProfile = hasOrg ? profileQuery.data ?? null : null;

  const [orgName, setOrgName] = useState("");
  const [orgNameEdited, setOrgNameEdited] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [displayNameEdited, setDisplayNameEdited] = useState(false);
  const [region, setRegion] = useState("");
  const [specializations, setSpecializations] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [description, setDescription] = useState("");
  const [inn, setInn] = useState("");
  // rovno#243: the INN is checked against the registry once typed; the result
  // is shown, not saved, and never blocks saving the card.
  const registry = useCardRegistry(inn, true);
  const innCheck = registry.check;
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(PHONE_PREFILL);
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState(PHONE_PREFILL);
  const [social, setSocial] = useState<Record<SocialField, string>>({ vk: "", max: "", youtube: "" });
  const [socialError, setSocialError] = useState<SocialField | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUrl, setCoverUrl] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [shade, setShade] = useState<string>(CARD_SHADES[0].key);
  const [showRequisites, setShowRequisites] = useState(true);

  const [contactError, setContactError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<SavedState | null>(null);

  // When the user already has an org, the business-card name should default to
  // the org name (they should be the same), unless the user has edited it.
  useEffect(() => {
    if (hasOrg && targetOrg && !displayNameEdited) {
      setDisplayName(targetOrg.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOrg, targetOrg?.id, displayNameEdited]);

  // Fill the form from the saved card once; a later refetch must not wipe typing.
  const seededProfileId = useRef<string | null>(null);
  // Cached data may be older than the card: wait for the read this open started.
  const firstReadDone = useRef(false);
  const firstReadFailed = useRef(false);
  if (hasOrg && !profileQuery.isFetching && !firstReadDone.current) {
    firstReadDone.current = true;
    firstReadFailed.current = profileQuery.isError;
  }
  useEffect(() => {
    if (!existingProfile || !firstReadDone.current || firstReadFailed.current || seededProfileId.current === existingProfile.id) return;
    seededProfileId.current = existingProfile.id;
    const { contacts, appearance } = existingProfile;
    setDisplayName(existingProfile.display_name);
    setDisplayNameEdited(true);
    setRegion(existingProfile.region ?? "");
    setSpecializations((existingProfile.specializations ?? []).join(", "));
    setExperienceYears(existingProfile.experience_years != null ? String(existingProfile.experience_years) : "");
    setDescription(existingProfile.description ?? "");
    setInn(existingProfile.inn ?? "");
    setEmail(contacts.email ?? "");
    setPhone(contacts.phone ?? PHONE_PREFILL);
    setTelegram(telegramFieldValue(contacts.telegram));
    setWebsite(contacts.website ?? "");
    setWhatsapp(contacts.whatsapp ?? PHONE_PREFILL);
    setSocial({ vk: contacts.vk ?? "", max: contacts.max ?? "", youtube: contacts.youtube ?? "" });
    setAvatarUrl(existingProfile.avatar_url ?? "");
    setCoverUrl(appearance?.cover_url ?? "");
    setShade(cardShade(appearance?.shade).key);
    setShowRequisites(appearance?.show_requisites !== false);
  }, [existingProfile, profileQuery.isFetching]);

  async function handleCoverSelect(file: File | null) {
    if (!file) return;
    if (file.size > COVER_MAX_BYTES) {
      toast({ title: t("upload.modal.step3.visitka.appearance.coverTooBig"), variant: "destructive" });
      return;
    }
    setCoverUploading(true);
    try {
      const { url } = await uploadAvatar(file);
      setCoverUrl(url);
    } catch (error) {
      toast({
        title: t("upload.modal.step3.visitka.fields.avatarUploadFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setCoverUploading(false);
    }
  }

  async function handleAvatarSelect(file: File | null) {
    if (!file) return;
    setAvatarUploading(true);
    try {
      const { url } = await uploadAvatar(file);
      setAvatarUrl(url);
    } catch (error) {
      toast({
        title: t("upload.modal.step3.visitka.fields.avatarUploadFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setAvatarUploading(false);
    }
  }

  // Linked autofill: display name → org name → slug, each until manually edited.
  function handleDisplayNameChange(value: string) {
    setDisplayName(value);
    setDisplayNameEdited(true);
    if (!hasOrg && !orgNameEdited) {
      setOrgName(value);
      if (!slugEdited) setSlug(slugifyOrgName(value));
    }
  }

  function handleOrgNameChange(value: string) {
    setOrgName(value);
    setOrgNameEdited(true);
    if (!slugEdited) setSlug(slugifyOrgName(value));
  }

  function handleSlugChange(value: string) {
    setSlug(value);
    setSlugEdited(true);
    setSlugError(null);
  }

  function buildContacts(): ContractorProfileData["contacts"] {
    const contacts: ContractorProfileData["contacts"] = {};
    if (email.trim()) contacts.email = email.trim();
    if (phoneIsFilled(phone)) contacts.phone = phone.trim();
    if (telegram.trim()) contacts.telegram = normalizeTelegram(telegram);
    if (website.trim()) contacts.website = normalizeWebsite(website);
    if (phoneIsFilled(whatsapp)) contacts.whatsapp = whatsapp.trim();
    for (const field of SOCIAL_FIELDS) {
      if (social[field].trim()) contacts[field] = normalizeWebsite(social[field]);
    }
    return contacts;
  }

  function buildAppearance(): NonNullable<ContractorProfileData["appearance"]> {
    return { shade, show_requisites: showRequisites, ...(coverUrl ? { cover_url: coverUrl } : {}) };
  }

  const specList = [
    ...new Set(
      specializations
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  const years = Number.parseInt(experienceYears, 10);
  const yearsValue = Number.isFinite(years) && years >= 0 ? years : undefined;

  // The form always holds the whole card, so an emptied field is sent empty and
  // the server clears it; a missing key would keep the old value.
  function buildProfileData(): ContractorProfileData {
    return {
      display_name: displayName.trim(),
      contacts: buildContacts(),
      region: region.trim(),
      specializations: specList,
      experience_years: yearsValue ?? null,
      description: description.trim(),
      inn: inn.trim(),
      avatar_url: avatarUrl,
      appearance: buildAppearance(),
    };
  }

  const previewCard: ContractorCardData = {
    display_name: displayName.trim() || orgName.trim() || t("upload.modal.step3.visitka.fields.displayNamePlaceholder"),
    contacts: buildContacts(),
    region: region.trim(),
    specializations: specList,
    experience_years: yearsValue,
    avatar_url: avatarUrl,
    description: description.trim(),
    inn: inn.trim(),
    appearance: buildAppearance(),
  };

  const hasContact = Boolean(email.trim() || phoneIsFilled(phone) || telegram.trim());
  const newOrgValid = hasOrg || (Boolean(orgName.trim()) && isValidOrgSlug(slug));
  // Contact requirement is validated on submit (inline error) rather than gating
  // the button, so the user gets a clear message instead of a silently disabled CTA.
  const canSubmit = Boolean(displayName.trim()) && newOrgValid;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // The form is longer than its window and Save stays in the footer, so each
    // inline error also says itself in a toast.
    const refuse = (message: string) => toast({ title: message, variant: "destructive" });
    if (!hasContact) {
      setContactError(true);
      refuse(t("upload.modal.step3.visitka.contactRequired"));
      return;
    }
    if (!hasOrg && !isValidOrgSlug(slug)) {
      setSlugError(t("upload.modal.step3.visitka.slugInvalid"));
      refuse(t("upload.modal.step3.visitka.slugInvalid"));
      return;
    }
    if (website.trim() && !isPlausibleWebsite(website)) {
      setWebsiteError(t("upload.modal.step3.visitka.websiteInvalid"));
      refuse(t("upload.modal.step3.visitka.websiteInvalid"));
      return;
    }
    const badSocial = SOCIAL_FIELDS.find((field) => social[field].trim() && !isPlausibleWebsite(social[field]));
    if (badSocial) {
      setSocialError(badSocial);
      refuse(t("upload.modal.step3.visitka.websiteInvalid"));
      return;
    }
    setSubmitting(true);
    try {
      const profileData = buildProfileData();
      const result = hasOrg && targetOrg
        ? await upsertContractorProfileForOrg(targetOrg.id, profileData)
        : await createOrgWithContractorProfile(orgName.trim(), slug, profileData);
      await queryClient.invalidateQueries({ queryKey: orgQueryKeys.all() });
      setSaved({ orgId: result.org_id, profileId: result.profile_id });
      toast({ title: t("upload.modal.successMessages.visitka_draft") });
    } catch (error) {
      const message = (error as { message?: string } | null)?.message ?? "";
      // The RPC raises errcode '23505' on slug collision; PostgREST surfaces it
      // as error.code. Fall back to message matching for resilience.
      const code = (error as { code?: string } | null)?.code;
      if (code === "23505" || message.includes("Slug already exists")) {
        setSlugError(t("upload.modal.step3.visitka.slugTaken"));
        toast({ title: t("upload.modal.step3.visitka.slugTaken"), variant: "destructive" });
      } else if (message.includes("business_card_requires_brigade")) {
        toast({ title: t("upload.modal.step3.visitka.requiresBrigade"), variant: "destructive" });
      } else {
        toast({
          title: t("upload.modal.errors.saveFailed"),
          description: message || undefined,
          variant: "destructive",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitForModeration() {
    if (!saved) return;
    setSubmitting(true);
    try {
      await submitContractorProfileForModeration(saved.orgId);
      await queryClient.invalidateQueries({ queryKey: orgQueryKeys.all() });
      toast({ title: t("upload.modal.successMessages.visitka_submitted") });
      onComplete?.({ type: "visitka", scope: "public", orgId: saved.orgId, profileId: saved.profileId });
      onClose();
    } catch (error) {
      toast({
        title: t("upload.modal.errors.saveFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleFinish() {
    if (saved) {
      onComplete?.({ type: "visitka", scope: "public", orgId: saved.orgId, profileId: saved.profileId });
    }
    onClose();
  }

  // ---- Success screen (after draft saved) ----------------------------------
  if (saved) {
    return (
      <div className="flex flex-col min-h-0 flex-1">
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-6 flex flex-col items-center text-center gap-3">
          <div className="rounded-full bg-emerald-500/15 p-3 text-emerald-600 dark:text-emerald-500">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </div>
          <h3 className="text-body font-semibold text-foreground">
            {t("upload.modal.step3.visitka.successHeading")}
          </h3>
          <p className="max-w-prose text-body-sm text-muted-foreground">
            {t("upload.modal.successMessages.visitka_draft")}
          </p>
        </div>
        <div className="border-t border-border px-4 sm:px-5 py-3 sm:py-4 flex justify-end gap-2 shrink-0">
          <Button type="button" variant="outline" onClick={handleFinish} disabled={submitting}>
            {t("upload.modal.step3.visitka.close")}
          </Button>
          <Button
            type="button"
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={handleSubmitForModeration}
            disabled={submitting}
          >
            {submitting
              ? t("upload.modal.saving")
              : t("upload.modal.step3.visitka.submitForModeration")}
          </Button>
        </div>
      </div>
    );
  }

  // ---- Loading: the form must hold the saved card before it can overwrite it --
  const profileLoading = hasOrg && (profileQuery.isLoading || !firstReadDone.current);
  if (orgsQuery.isLoading || profileLoading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 py-12 text-body-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("common.loading")}
      </div>
    );
  }

  const profileFailed = hasOrg && firstReadFailed.current;
  const saveDisabled = submitting || avatarUploading || coverUploading || !canSubmit || profileFailed;

  // ---- Form ----------------------------------------------------------------
  return (
    // noValidate: we validate ourselves so error messages are in Russian rather
    // than the browser's native (English-locale) "Please enter a URL" popups.
    <form onSubmit={handleSubmit} noValidate className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
        {!hasOrg && (
          <div className="rounded-panel border border-accent/30 bg-accent/5 p-3 space-y-3">
            <div>
              <h4 className="text-body-sm font-medium text-foreground">
                {t("upload.modal.step3.visitka.orgSection.heading")}
              </h4>
              <p className="text-caption text-muted-foreground mt-0.5">
                {t("upload.modal.step3.visitka.orgSection.body")}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-body-sm font-medium">
                {t("upload.modal.step3.visitka.orgName")}
              </Label>
              <Input
                value={orgName}
                onChange={(event) => handleOrgNameChange(event.target.value)}
                placeholder={t("upload.modal.step3.visitka.orgNamePlaceholder")}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-body-sm font-medium">
                {t("upload.modal.step3.visitka.slug")}
              </Label>
              <Input
                value={slug}
                onChange={(event) => handleSlugChange(event.target.value)}
                placeholder="my-team"
                disabled={submitting}
                aria-invalid={Boolean(slugError)}
              />
              <p className="text-caption text-muted-foreground">
                {t("upload.modal.step3.visitka.slugPreview", { slug: slug || "…" })}
              </p>
              {slugError && <p className="text-caption text-destructive">{slugError}</p>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-3">
            <h4 className="text-body-sm font-medium text-foreground">
              {t("upload.modal.step3.visitka.appearance.heading")}
            </h4>
            <DesignTile
              label={
                <>
                  {t("upload.modal.step3.visitka.fields.avatar")}{" "}
                  <span className="text-caption text-muted-foreground font-normal">({t("common.optional")})</span>
                </>
              }
              hint={t("upload.modal.step3.visitka.appearance.logoHint")}
              thumb={
                <div
                  className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[10px] text-body font-bold"
                  style={{ backgroundColor: cardShade(shade).from, color: cardShade(shade).fg }}
                >
                  {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : cardInitials(previewCard.display_name)}
                </div>
              }
              filled={Boolean(avatarUrl)}
              busy={avatarUploading}
              disabled={submitting}
              accept="image/*"
              onSelect={handleAvatarSelect}
              onRemove={() => setAvatarUrl("")}
            />
            <DesignTile
              label={t("upload.modal.step3.visitka.appearance.cover")}
              hint={t("upload.modal.step3.visitka.appearance.coverHint")}
              thumb={
                <div
                  className="h-14 w-24 shrink-0 overflow-hidden rounded-[10px]"
                  style={coverUrl ? undefined : { background: shadeBackground(cardShade(shade)) }}
                >
                  {coverUrl ? <img src={coverUrl} alt="" className="h-full w-full object-cover" /> : null}
                </div>
              }
              filled={Boolean(coverUrl)}
              busy={coverUploading}
              disabled={submitting}
              accept="image/jpeg,image/png"
              onSelect={handleCoverSelect}
              onRemove={() => setCoverUrl("")}
            />
            <div className="space-y-1.5">
              <Label className="text-body-sm font-medium">{t("upload.modal.step3.visitka.appearance.shade")}</Label>
              <div className="flex flex-wrap items-center gap-2.5">
                {CARD_SHADES.map((item) => {
                  const pressed = !coverUrl && shade === item.key;
                  const label = t(`upload.modal.step3.visitka.appearance.shades.${item.key}`);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={pressed}
                      disabled={submitting}
                      onClick={() => {
                        setShade(item.key);
                        setCoverUrl("");
                      }}
                      className={cn(
                        "h-[34px] w-[34px] rounded-full border-[3px] border-card outline outline-1 outline-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        pressed && "outline-2 outline-accent",
                      )}
                      style={{ background: `radial-gradient(circle at 70% 25%, ${item.to}, ${item.from} 70%)` }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          <FormPreview card={previewCard} registry={registry} />
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <h4 className="text-body-sm font-medium text-foreground">{t("upload.modal.step3.visitka.frontSide")}</h4>

          <div className="space-y-1">
            <Label className="text-body-sm font-medium">
              {t("upload.modal.step3.visitka.fields.displayName")}
            </Label>
            <Input
              value={displayName}
              onChange={(event) => handleDisplayNameChange(event.target.value)}
              placeholder={t("upload.modal.step3.visitka.fields.displayNamePlaceholder")}
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-body-sm font-medium">
                {t("upload.modal.step3.visitka.fields.region")}{" "}
                <span className="text-caption text-muted-foreground font-normal">
                  ({t("common.optional")})
                </span>
              </Label>
              <Input
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                placeholder={t("upload.modal.step3.visitka.fields.regionPlaceholder")}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-body-sm font-medium">
                {t("upload.modal.step3.visitka.fields.experienceYears")}{" "}
                <span className="text-caption text-muted-foreground font-normal">
                  ({t("common.optional")})
                </span>
              </Label>
              <Input
                type="number"
                min={0}
                value={experienceYears}
                onChange={(event) => setExperienceYears(event.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-body-sm font-medium">
              {t("upload.modal.step3.visitka.fields.specializations")}{" "}
              <span className="text-caption text-muted-foreground font-normal">
                ({t("common.optional")})
              </span>
            </Label>
            <Input
              value={specializations}
              onChange={(event) => setSpecializations(event.target.value)}
              placeholder={t("upload.modal.step3.visitka.fields.specializationsPlaceholder")}
              disabled={submitting}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-body-sm font-medium">
              {t("upload.modal.step3.visitka.fields.inn")}{" "}
              <span className="text-caption text-muted-foreground font-normal">
                ({t("common.optional")})
              </span>
            </Label>
            <Input
              value={inn}
              onChange={(event) => setInn(event.target.value)}
              onBlur={() => registry.checks.check(inn)}
              inputMode="numeric"
              placeholder={t("upload.modal.step3.visitka.fields.innPlaceholder")}
              disabled={submitting}
            />
            {partyTagKind(innCheck, inn) ? (
              <PartyStatusTag check={innCheck} inn={inn} advice="own" showName />
            ) : (
              <p className="text-caption text-muted-foreground">
                {t("upload.modal.step3.visitka.fields.innHint")}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div>
            <h4 className="text-body-sm font-medium text-foreground">{t("upload.modal.step3.visitka.backSide")}</h4>
            <p className="text-caption text-muted-foreground mt-0.5">
              {t("upload.modal.step3.visitka.contactsHint")}
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-body-sm font-medium">
              {t("upload.modal.step3.visitka.fields.description")}{" "}
              <span className="text-caption text-muted-foreground font-normal">
                ({t("common.optional")})
              </span>
            </Label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={1000}
              rows={3}
              placeholder={t("upload.modal.step3.visitka.fields.descriptionPlaceholder")}
              disabled={submitting}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-body-sm font-medium">
              {t("upload.modal.step3.visitka.fields.email")}
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setContactError(false);
              }}
              placeholder="mail@example.com"
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-body-sm font-medium">
              {t("upload.modal.step3.visitka.fields.phone")}
            </Label>
            <Input
              type="tel"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                setContactError(false);
              }}
              placeholder="+7 900 000-00-00"
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-body-sm font-medium">
              {t("upload.modal.step3.visitka.fields.telegram")}
            </Label>
            <div className="relative">
              {telegram.includes("/") ? null : (
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body-sm text-muted-foreground">@</span>
              )}
              <Input
                value={telegram}
                onChange={(event) => {
                  setTelegram(telegramFieldValue(event.target.value));
                  setContactError(false);
                }}
                className={telegram.includes("/") ? undefined : "pl-7"}
                placeholder="username"
                disabled={submitting}
              />
            </div>
            <p className="text-caption text-muted-foreground">
              {t("upload.modal.step3.visitka.fields.telegramHint")}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-body-sm font-medium">
              {t("upload.modal.step3.visitka.fields.website")}{" "}
              <span className="text-caption text-muted-foreground font-normal">
                ({t("common.optional")})
              </span>
            </Label>
            <Input
              type="text"
              inputMode="url"
              value={website}
              onChange={(event) => {
                setWebsite(event.target.value);
                setWebsiteError(null);
              }}
              placeholder={t("upload.modal.step3.visitka.fields.websitePlaceholder")}
              aria-invalid={Boolean(websiteError)}
              disabled={submitting}
            />
            {websiteError && <p className="text-caption text-destructive">{websiteError}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-body-sm font-medium">{t("upload.modal.step3.visitka.fields.whatsapp")}</Label>
            <Input
              type="tel"
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
              placeholder="+7 900 000-00-00"
              disabled={submitting}
            />
          </div>
          {SOCIAL_FIELDS.map((field) => (
            <div key={field} className="space-y-1">
              <Label className="text-body-sm font-medium">{t(`upload.modal.step3.visitka.fields.${field}`)}</Label>
              <Input
                type="text"
                inputMode="url"
                value={social[field]}
                onChange={(event) => {
                  setSocial((current) => ({ ...current, [field]: event.target.value }));
                  setSocialError(null);
                }}
                placeholder={t(`upload.modal.step3.visitka.fields.${field}Placeholder`)}
                aria-invalid={socialError === field}
                disabled={submitting}
              />
              {socialError === field && (
                <p className="text-caption text-destructive">{t("upload.modal.step3.visitka.websiteInvalid")}</p>
              )}
            </div>
          ))}
          <label className="flex cursor-pointer items-start gap-2.5">
            <Switch
              checked={showRequisites}
              onCheckedChange={setShowRequisites}
              disabled={submitting}
              aria-label={t("upload.modal.step3.visitka.fields.showRequisites")}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-body-sm font-medium">{t("upload.modal.step3.visitka.fields.showRequisites")}</span>
              <span className="text-caption text-muted-foreground">{t("upload.modal.step3.visitka.fields.showRequisitesHint")}</span>
            </span>
          </label>
          {contactError && (
            <p className="text-caption text-destructive">
              {t("upload.modal.step3.visitka.contactRequired")}
            </p>
          )}
        </div>

        <p className="text-caption text-amber-600 dark:text-amber-500">
          {t("upload.modal.step3.visitka.moderationNote")}
        </p>
        {profileFailed && (
          <p className="text-caption text-destructive" role="alert">
            {t("upload.modal.step3.visitka.loadFailed")}
          </p>
        )}
      </div>

      <div className="border-t border-border px-4 sm:px-5 py-3 sm:py-4 flex justify-between shrink-0">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          {t("upload.modal.back")}
        </Button>
        {hasOrg ? (
          <Button
            type="submit"
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={saveDisabled}
          >
            {submitting ? t("upload.modal.saving") : t("upload.modal.step3.visitka.save")}
          </Button>
        ) : (
          // Creating a new org + business card is Brigade-only. With an org the
          // rule follows the org owner's plan, which only the backend can see.
          <TierLockTooltip requiredPlan="brigade" feature="create_business_card">
            <Button
              type="submit"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={saveDisabled}
            >
              {submitting ? t("upload.modal.saving") : t("upload.modal.step3.visitka.save")}
            </Button>
          </TierLockTooltip>
        )}
      </div>
    </form>
  );
}
