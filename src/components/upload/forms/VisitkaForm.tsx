import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FileInput } from "@/components/ui/file-input";
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
import { PHONE_PREFILL, phoneIsFilled } from "@/lib/phone";
import type { UploadResult } from "@/components/upload/types";

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
  try {
    const url = new URL(normalizeWebsite(value));
    return Boolean(url.hostname) && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export function VisitkaForm({ onBack, onClose, onComplete }: VisitkaFormProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const orgsQuery = useUserOrganizations();
  const activeOrg = useActiveOrg();
  const { uploadAvatar } = useAvatarUpload();

  const orgs = orgsQuery.data ?? [];
  const targetOrg = activeOrg ?? orgs[0] ?? null;
  const hasOrg = orgs.length > 0;

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
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(PHONE_PREFILL);
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);

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

  function buildProfileData(): ContractorProfileData {
    const contacts: ContractorProfileData["contacts"] = {};
    if (email.trim()) contacts.email = email.trim();
    if (phoneIsFilled(phone)) contacts.phone = phone.trim();
    if (telegram.trim()) contacts.telegram = telegram.trim();
    if (website.trim()) contacts.website = normalizeWebsite(website);
    const specs = specializations
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const years = Number.parseInt(experienceYears, 10);
    return {
      display_name: displayName.trim(),
      contacts,
      region: region.trim() || undefined,
      specializations: specs.length > 0 ? specs : undefined,
      experience_years: Number.isFinite(years) && years >= 0 ? years : undefined,
      description: description.trim() || undefined,
      inn: inn.trim() || undefined,
      avatar_url: avatarUrl || undefined,
    };
  }

  const hasContact = Boolean(email.trim() || phoneIsFilled(phone) || telegram.trim());
  const newOrgValid = hasOrg || (Boolean(orgName.trim()) && isValidOrgSlug(slug));
  // Contact requirement is validated on submit (inline error) rather than gating
  // the button, so the user gets a clear message instead of a silently disabled CTA.
  const canSubmit = Boolean(displayName.trim()) && newOrgValid;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!hasContact) {
      setContactError(true);
      return;
    }
    if (!hasOrg && !isValidOrgSlug(slug)) {
      setSlugError(t("upload.modal.step3.visitka.slugInvalid"));
      return;
    }
    if (website.trim() && !isPlausibleWebsite(website)) {
      setWebsiteError(t("upload.modal.step3.visitka.websiteInvalid"));
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
      const message = error instanceof Error ? error.message : "";
      // The RPC raises errcode '23505' on slug collision; PostgREST surfaces it
      // as error.code. Fall back to message matching for resilience.
      const code = (error as { code?: string } | null)?.code;
      if (code === "23505" || message.includes("Slug already exists")) {
        setSlugError(t("upload.modal.step3.visitka.slugTaken"));
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

        <div className="space-y-3">
          <h4 className="text-body-sm font-medium text-foreground">
            {t("upload.modal.step3.visitka.profileSection")}
          </h4>

          <div className="flex items-center gap-3">
            <Avatar className="h-16 w-16">
              {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
              <AvatarFallback className="bg-accent/15 text-accent">
                {displayName.trim().slice(0, 2).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-1">
              <Label className="text-body-sm font-medium">
                {t("upload.modal.step3.visitka.fields.avatar")}{" "}
                <span className="text-caption text-muted-foreground font-normal">
                  ({t("common.optional")})
                </span>
              </Label>
              <FileInput
                accept="image/*"
                disabled={submitting || avatarUploading}
                chooseLabel={
                  avatarUploading
                    ? t("upload.modal.step3.visitka.fields.avatarUploading")
                    : undefined
                }
                onChange={(event) => handleAvatarSelect(event.target.files?.[0] ?? null)}
              />
              {avatarUploading && (
                <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("upload.modal.step3.visitka.fields.avatarUploading")}
                </span>
              )}
            </div>
          </div>

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
              {t("upload.modal.step3.visitka.fields.inn")}{" "}
              <span className="text-caption text-muted-foreground font-normal">
                ({t("common.optional")})
              </span>
            </Label>
            <Input
              value={inn}
              onChange={(event) => setInn(event.target.value)}
              inputMode="numeric"
              placeholder={t("upload.modal.step3.visitka.fields.innPlaceholder")}
              disabled={submitting}
            />
            <p className="text-caption text-muted-foreground">
              {t("upload.modal.step3.visitka.fields.innHint")}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h4 className="text-body-sm font-medium text-foreground">
              {t("upload.modal.step3.visitka.contactsHeading")}
            </h4>
            <p className="text-caption text-muted-foreground mt-0.5">
              {t("upload.modal.step3.visitka.contactsHint")}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <Input
                value={telegram}
                onChange={(event) => {
                  setTelegram(event.target.value);
                  setContactError(false);
                }}
                placeholder="@username"
                disabled={submitting}
              />
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
          </div>
          {contactError && (
            <p className="text-caption text-destructive">
              {t("upload.modal.step3.visitka.contactRequired")}
            </p>
          )}
        </div>

        <p className="text-caption text-amber-600 dark:text-amber-500">
          {t("upload.modal.step3.visitka.moderationNote")}
        </p>
      </div>

      <div className="border-t border-border px-4 sm:px-5 py-3 sm:py-4 flex justify-between shrink-0">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          {t("upload.modal.back")}
        </Button>
        <Button
          type="submit"
          className="bg-accent text-accent-foreground hover:bg-accent/90"
          disabled={submitting || avatarUploading || !canSubmit}
        >
          {submitting ? t("upload.modal.saving") : t("upload.modal.step3.visitka.save")}
        </Button>
      </div>
    </form>
  );
}
