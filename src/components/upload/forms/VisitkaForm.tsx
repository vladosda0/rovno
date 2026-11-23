import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Lock, Search, Sparkles, Upload, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  type ContractorProfileData,
} from "@/data/contractor-profile-source";
import { slugifyOrgName, isValidOrgSlug } from "@/lib/transliterate";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { planMeets, useTierQuota } from "@/hooks/useTierQuota";
import { trackEvent } from "@/lib/analytics";
import { PHONE_PREFILL, phoneIsFilled } from "@/lib/phone";
import type { UploadResult } from "@/components/upload/types";
import { PartyStatusTag, partyTagKind } from "@/components/requisites/PartyStatusTag";
import { useContractorProfile } from "@/hooks/use-contractor-profile";
import { VisitkaPortfolioBlock } from "./VisitkaPortfolioBlock";
import { ContractorCard } from "@/components/contractor-card/ContractorCard";
import { type CardRegistry, useCardRegistry } from "@/components/contractor-card/use-card-registry";
import type { ContractorCardData } from "@/components/contractor-card/ContractorCardFace";
import {
  CARD_COVER_KEYS,
  CARD_SHADE_CHOICES,
  NEW_CARD_SHADE,
  cardInitials,
  cardShade,
  coverMatches,
  coverPresetSrc,
  isCardCoverKey,
  normalizeTelegram,
  orderCovers,
  shadeBackground,
  telegramFieldValue,
  webLink,
  type CardCoverKey,
} from "@/lib/contractor-card";
import { cropImageFile, fitsAspect, readImageSize, type CropArea } from "@/lib/image-file";
import { cn } from "@/lib/utils";
import { ImageCropDialog } from "./ImageCropDialog";

export interface VisitkaFormProps {
  onBack: () => void;
  onClose: () => void;
  onComplete?: (result: UploadResult) => void;
}

interface SavedState {
  orgId: string;
  profileId: string;
}

type SaveIntent = "draft" | "submit";

function isBrigadeRefusal(error: unknown): boolean {
  const message = (error as { message?: string } | null)?.message ?? "";
  return message.includes("business_card_requires_brigade");
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
  removable,
  removeLabel,
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
  removable: boolean;
  removeLabel: string;
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
      <div className="group relative shrink-0">
        {thumb}
        {removable ? (
          <button
            type="button"
            aria-label={removeLabel}
            title={removeLabel}
            disabled={disabled || busy}
            onClick={onRemove}
            className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border-2 border-card bg-foreground text-background transition-opacity focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : null}
      </div>
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
    </div>
  );
}

const APPEARANCE = "upload.modal.step3.visitka.appearance";
const COVERS_PER_PAGE = 8;

/** Ready-made covers (rovno#295): search, eight at a time, the chosen one outlined. */
function CoverPresets({
  selected,
  disabled,
  onSelect,
}: {
  selected: CardCoverKey | null;
  disabled: boolean;
  onSelect: (key: CardCoverKey) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(COVERS_PER_PAGE);
  const covers = CARD_COVER_KEYS.map((key) => ({
    key,
    name: t(`${APPEARANCE}.covers.${key}.name`),
    tags: t(`${APPEARANCE}.covers.${key}.tags`)
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  }));
  const searching = query.trim().length > 0;
  const found = covers.filter((cover) => coverMatches(query, cover.name, cover.tags));
  const shown = searching ? found : orderCovers(found, selected, visible).slice(0, visible);
  const picked = selected ? covers.find((cover) => cover.key === selected) : undefined;
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-body-sm font-medium">{t(`${APPEARANCE}.presets`)}</Label>
      <div className="flex h-[38px] items-center gap-2 rounded-[10px] border border-input bg-background px-2.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          placeholder={t(`${APPEARANCE}.presetsSearch`)}
          aria-label={t(`${APPEARANCE}.presetsSearchAria`)}
          disabled={disabled}
          className="h-full min-w-0 flex-1 bg-transparent text-body-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        {searching ? (
          <button
            type="button"
            aria-label={t(`${APPEARANCE}.presetsClear`)}
            onClick={() => {
              setQuery("");
              setVisible(COVERS_PER_PAGE);
            }}
            className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-secondary text-foreground"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {found.length > 0 ? (
        <>
          <div className="grid grid-cols-4 gap-2" data-testid="cover-grid">
            {shown.map((cover) => {
              const pressed = selected === cover.key;
              return (
                <button
                  key={cover.key}
                  type="button"
                  aria-label={cover.name}
                  title={cover.name}
                  aria-pressed={pressed}
                  disabled={disabled}
                  onClick={() => onSelect(cover.key)}
                  className={cn(
                    "relative aspect-video overflow-hidden rounded-[10px] bg-muted outline outline-1 -outline-offset-1 outline-black/10 transition-transform duration-150 ease-out hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                    pressed && "outline-[2.5px] outline-offset-2 outline-accent",
                  )}
                >
                  <img
                    src={coverPresetSrc(cover.key, "small")}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {pressed ? (
                    <span className="absolute right-[5px] top-[5px] grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-foreground">
                      <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="flex min-h-[30px] flex-wrap items-center justify-between gap-2.5">
            {picked ? (
              <span className="text-caption text-muted-foreground" data-testid="cover-picked">
                {t(`${APPEARANCE}.presetsPicked`)} <b className="font-medium text-foreground">{picked.name}</b>
              </span>
            ) : (
              <span />
            )}
            {!searching && visible < found.length ? (
              <button
                type="button"
                onClick={() => setVisible((count) => count + COVERS_PER_PAGE)}
                className="py-1 text-body-sm font-medium text-accent"
              >
                {t(`${APPEARANCE}.presetsMore`)}
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-xl border-[1.5px] border-dashed border-border p-3.5">
          <span className="text-body-sm [overflow-wrap:anywhere]">{t(`${APPEARANCE}.presetsEmpty`, { query: query.trim() })}</span>
          <div className="flex flex-wrap items-center gap-2">
            <div
              aria-disabled="true"
              className="min-w-0 flex-[1_1_180px] truncate rounded-[10px] border border-input bg-background px-3 py-2 text-body-sm opacity-65"
            >
              {query.trim()}
            </div>
            <Button type="button" variant="outline" size="sm" disabled>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t(`${APPEARANCE}.generate`)}
            </Button>
            <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-1 text-[11px] font-semibold uppercase leading-none tracking-wide text-accent">
              {t(`${APPEARANCE}.soon`)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function FormPreview({ card, registry, orgId }: { card: ContractorCardData; registry: CardRegistry; orgId: string | null }) {
  const { t } = useTranslation();
  const { check, details } = registry;
  return (
    <div className="flex flex-col items-center gap-2">
      <ContractorCard
        card={card}
        check={check}
        details={details}
        ariaLabel={t("upload.modal.step3.visitka.previewAria")}
        portfolio={orgId ? { orgId, canEdit: false } : undefined}
      />
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
  // A person without an organization gets one on save, and the dialogs after it must survive that.
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
  const navigate = useNavigate();
  const { data: quota } = useTierQuota();

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
  const [coverPreset, setCoverPreset] = useState<CardCoverKey | null>(null);
  const [cropping, setCropping] = useState<{ kind: "logo" | "cover"; file: File } | null>(null);
  // Kept after close, so the closing dialog keeps its title and shape.
  const [cropKind, setCropKind] = useState<"logo" | "cover">("cover");
  const [shade, setShade] = useState<string>(NEW_CARD_SHADE);
  const [showRequisites, setShowRequisites] = useState(true);

  const [contactError, setContactError] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<SaveIntent | null>(null);
  const submitting = pendingIntent !== null;
  const [revokeOpen, setRevokeOpen] = useState(false);
  // What the revoke confirmation resumes: the draft button, or a send that ends as a draft.
  const [revokeIntent, setRevokeIntent] = useState<SaveIntent>("draft");
  // A draft saved instead of sending: the window offers Brigade, then closes.
  const [upgradeFor, setUpgradeFor] = useState<SavedState | null>(null);
  const goPricing = useRef(false);
  // Sending needs the owner's Brigade plan (rovno#327). The front sees it for a
  // person without an organization (their own plan) and for a visitka-only
  // organization (limited); otherwise the server decides and the refusal is
  // handled like the lock.
  const sendLocked = hasOrg
    ? Boolean(targetOrg?.limited)
    : Boolean(quota && !planMeets(quota.plan_code, "brigade"));

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
    setCoverPreset(!appearance?.cover_url && isCardCoverKey(appearance?.cover_preset) ? appearance.cover_preset : null);
    setShade(cardShade(appearance?.shade).key);
    setShowRequisites(appearance?.show_requisites !== false);
  }, [existingProfile, profileQuery.isFetching]);

  async function uploadCover(file: File) {
    if (file.size > COVER_MAX_BYTES) {
      toast({ title: t("upload.modal.step3.visitka.appearance.coverTooBig"), variant: "destructive" });
      return;
    }
    setCoverUploading(true);
    try {
      const { url } = await uploadAvatar(file);
      setCoverUrl(url);
      setCoverPreset(null);
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

  async function handleCoverSelect(file: File | null) {
    if (!file) return;
    if (file.size > COVER_MAX_BYTES) {
      toast({ title: t("upload.modal.step3.visitka.appearance.coverTooBig"), variant: "destructive" });
      return;
    }
    setCoverUploading(true);
    const size = await readImageSize(file);
    setCoverUploading(false);
    if (size && !fitsAspect(size, 16 / 9)) {
      openCrop("cover", file);
      return;
    }
    await uploadCover(file);
  }

  async function handleAvatarSelect(file: File | null) {
    if (!file) return;
    setAvatarUploading(true);
    const size = await readImageSize(file);
    setAvatarUploading(false);
    if (size && !fitsAspect(size, 1)) {
      openCrop("logo", file);
      return;
    }
    await uploadLogo(file);
  }

  function openCrop(kind: "logo" | "cover", file: File) {
    setCropKind(kind);
    setCropping({ kind, file });
  }

  async function handleCropDone(file: File, area: CropArea) {
    const kind = cropping?.kind;
    setCropping(null);
    if (!kind) return;
    const setBusy = kind === "cover" ? setCoverUploading : setAvatarUploading;
    setBusy(true);
    let cut: File;
    try {
      cut = await cropImageFile(file, area, kind === "cover" ? 1600 : 800);
    } catch {
      toast({ title: t("upload.modal.step3.visitka.appearance.cropFailed"), variant: "destructive" });
      return;
    } finally {
      setBusy(false);
    }
    await (kind === "cover" ? uploadCover(cut) : uploadLogo(cut));
  }

  function handlePresetSelect(key: CardCoverKey) {
    setCoverPreset(key);
    setCoverUrl("");
  }

  async function uploadLogo(file: File) {
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
    return {
      shade,
      show_requisites: showRequisites,
      ...(coverUrl ? { cover_url: coverUrl } : coverPreset ? { cover_preset: coverPreset } : {}),
    };
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

  function persist(status: NonNullable<ContractorProfileData["status"]>) {
    const profileData = { ...buildProfileData(), status };
    return hasOrg && targetOrg
      ? upsertContractorProfileForOrg(targetOrg.id, profileData)
      : createOrgWithContractorProfile(orgName.trim(), slug, profileData);
  }

  function finish(result: SavedState) {
    onComplete?.({ type: "visitka", scope: "public", orgId: result.orgId, profileId: result.profileId });
    onClose();
  }

  function askRevoke(intent: SaveIntent) {
    setRevokeIntent(intent);
    setRevokeOpen(true);
  }

  async function save(intent: SaveIntent, confirmed = false) {
    // The form is longer than its window and the buttons stay in the footer, so
    // each inline error also says itself in a toast.
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
    // A locked send saves a draft and offers Brigade (mockup frame 4).
    // A card already on moderation stays there on send: the server keeps pending to pending.
    const keepsPending = existingProfile?.status === "pending_moderation";
    const status = intent === "submit" && (!sendLocked || keepsPending) ? "pending_moderation" : "draft";
    // A send that would take a published card to draft asks first, like the draft button.
    const published = existingProfile?.status === "published";
    if (published && !confirmed && intent === "submit" && status === "draft") {
      askRevoke("submit");
      return;
    }
    setPendingIntent(intent);
    try {
      let raw: { org_id: string; profile_id: string };
      let offerBrigade = intent === "submit" && status === "draft";
      try {
        raw = await persist(status);
      } catch (error) {
        if (status !== "pending_moderation" || !isBrigadeRefusal(error)) throw error;
        if (published && !confirmed) {
          askRevoke("submit");
          return;
        }
        // The owner's plan, which only the server sees, refused the send: keep the work as a draft.
        raw = await persist("draft");
        offerBrigade = true;
      }
      const result = { orgId: raw.org_id, profileId: raw.profile_id };
      if (offerBrigade) {
        // Not awaited: the refetch also reads the new organization's card, the window must not wait for it.
        setUpgradeFor(result);
        void queryClient.invalidateQueries({ queryKey: orgQueryKeys.all() });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: orgQueryKeys.all() });
      toast({
        title: t(status === "pending_moderation"
          ? "upload.modal.successMessages.visitka_submitted"
          : "upload.modal.successMessages.visitka_draft"),
      });
      finish(result);
    } catch (error) {
      const message = (error as { message?: string } | null)?.message ?? "";
      // The RPC raises errcode '23505' on slug collision; PostgREST surfaces it
      // as error.code. Fall back to message matching for resilience.
      const code = (error as { code?: string } | null)?.code;
      if (code === "23505" || message.includes("Slug already exists")) {
        setSlugError(t("upload.modal.step3.visitka.slugTaken"));
        toast({ title: t("upload.modal.step3.visitka.slugTaken"), variant: "destructive" });
      } else {
        toast({
          title: t("upload.modal.errors.saveFailed"),
          description: message || undefined,
          variant: "destructive",
        });
      }
    } finally {
      setPendingIntent(null);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Enter in a field is the main action: send for moderation (Vlad, 2026-11-18).
    void save("submit");
  }

  function handleDraftClick() {
    // Going back to draft recalls a card already on moderation or published: ask first (mockup frame 3).
    if (existingProfile?.status === "pending_moderation" || existingProfile?.status === "published") {
      askRevoke("draft");
      return;
    }
    void save("draft");
  }

  // The dialog's own close (either button, Escape) finishes the window once.
  function handleUpgradeClose() {
    const result = upgradeFor;
    setUpgradeFor(null);
    if (goPricing.current) {
      // The host's onComplete moves to the card's leaf, which would undo the move to pricing.
      goPricing.current = false;
      navigate("/#pricing");
      onClose();
      return;
    }
    if (result) finish(result);
  }

  function handleUpgradeCta() {
    trackEvent("tier_lock_cta_clicked", {
      required_plan: "brigade",
      plan: quota?.plan_code ?? null,
      feature: "submit_business_card",
    });
    goPricing.current = true;
  }

  const upgradeDialog = (
    <AlertDialog open={upgradeFor !== null} onOpenChange={(open) => { if (!open) handleUpgradeClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("upload.modal.step3.visitka.upgrade.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("upload.modal.step3.visitka.upgrade.body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("upload.modal.step3.visitka.upgrade.close")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleUpgradeCta}>{t("upload.modal.step3.visitka.upgrade.cta")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // ---- Loading: the form must hold the saved card before it can overwrite it --
  const profileLoading = hasOrg && (profileQuery.isLoading || !firstReadDone.current);
  if (orgsQuery.isLoading || profileLoading) {
    // A solo save brings the new organization and a fresh card read; the window keeps its place.
    return (
      <>
        <div className="flex flex-1 items-center justify-center gap-2 py-12 text-body-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t("common.loading")}
        </div>
        {upgradeDialog}
      </>
    );
  }

  const profileFailed = hasOrg && firstReadFailed.current;
  const saveDisabled = submitting || avatarUploading || coverUploading || cropping !== null || !canSubmit || profileFailed;
  const thumbCover = coverUrl || (coverPreset ? coverPresetSrc(coverPreset, "small") : "");

  // ---- Form ----------------------------------------------------------------
  return (
    <>
    {/* noValidate: we validate ourselves so error messages are in Russian rather
        than the browser's native (English-locale) "Please enter a URL" popups. */}
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
              label={t("upload.modal.step3.visitka.fields.avatar")}
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
              removable={Boolean(avatarUrl)}
              removeLabel={t(`${APPEARANCE}.removeLogo`)}
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
                  style={thumbCover ? undefined : { background: shadeBackground(cardShade(shade)) }}
                >
                  {thumbCover ? <img src={thumbCover} alt="" className="h-full w-full object-cover" /> : null}
                </div>
              }
              filled={Boolean(coverUrl)}
              removable={Boolean(coverUrl || coverPreset)}
              removeLabel={t(`${APPEARANCE}.removeCover`)}
              busy={coverUploading}
              disabled={submitting}
              accept="image/jpeg,image/png"
              onSelect={handleCoverSelect}
              onRemove={() => {
                setCoverUrl("");
                setCoverPreset(null);
              }}
            />
            <CoverPresets selected={coverPreset} disabled={submitting || coverUploading} onSelect={handlePresetSelect} />
            <div className="space-y-1.5">
              <Label className="text-body-sm font-medium">{t("upload.modal.step3.visitka.appearance.shade")}</Label>
              <div className="flex flex-wrap items-center gap-2.5">
                {CARD_SHADE_CHOICES.map((item) => {
                  const pressed = !coverUrl && !coverPreset && shade === item.key;
                  const label = t(`upload.modal.step3.visitka.appearance.shades.${item.key}`);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={pressed}
                      disabled={submitting || coverUploading}
                      onClick={() => {
                        setShade(item.key);
                        setCoverUrl("");
                        setCoverPreset(null);
                      }}
                      className={cn(
                        "h-[34px] w-[34px] rounded-full border-[3px] border-card outline outline-1 outline-border focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                        pressed && "outline-2 outline-accent",
                      )}
                      style={{ background: `radial-gradient(circle at 70% 25%, ${item.to}, ${item.from} 70%)` }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          <FormPreview card={previewCard} registry={registry} orgId={existingProfile?.org_id ?? null} />
        </div>
        <ImageCropDialog
          file={cropping?.file ?? null}
          aspect={cropKind === "logo" ? 1 : 16 / 9}
          title={t(`${APPEARANCE}.${cropKind === "logo" ? "cropLogo" : "cropCover"}`)}
          onCancel={() => setCropping(null)}
          onDone={handleCropDone}
        />

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

        <VisitkaPortfolioBlock
          orgId={existingProfile ? existingProfile.org_id : null}
          canEdit={!hasOrg || targetOrg?.role === "owner" || targetOrg?.role === "admin"}
        />

        <p className="text-caption text-amber-600 dark:text-amber-500">
          {t("upload.modal.step3.visitka.moderationNote")}
        </p>
        {profileFailed && (
          <p className="text-caption text-destructive" role="alert">
            {t("upload.modal.step3.visitka.loadFailed")}
          </p>
        )}
      </div>

      <div className="border-t border-border px-4 sm:px-5 py-3 sm:py-4 flex flex-wrap gap-2 shrink-0">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          {t("upload.modal.back")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1 sm:flex-none sm:ml-auto"
          onClick={handleDraftClick}
          disabled={saveDisabled}
        >
          {pendingIntent === "draft" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {pendingIntent === "draft" ? t("upload.modal.saving") : t("upload.modal.step3.visitka.save")}
        </Button>
        <Button
          type="submit"
          className="basis-full sm:basis-auto bg-accent text-accent-foreground hover:bg-accent/90"
          disabled={saveDisabled}
        >
          {pendingIntent === "submit" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            sendLocked && <Lock className="h-4 w-4" aria-hidden="true" />
          )}
          {pendingIntent === "submit" ? t("upload.modal.saving") : t("upload.modal.step3.visitka.submitForModeration")}
        </Button>
      </div>

      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent aria-describedby={undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("upload.modal.step3.visitka.revokeConfirm.title")}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("upload.modal.step3.visitka.revokeConfirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRevokeOpen(false);
                void save(revokeIntent, true);
              }}
            >
              {t("upload.modal.step3.visitka.revokeConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </form>
    {upgradeDialog}
    </>
  );
}
