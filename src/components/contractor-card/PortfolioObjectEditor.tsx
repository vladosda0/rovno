import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Loader2, Plus, X } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PORTFOLIO_MAX_PHOTOS,
  PORTFOLIO_PHOTO_EDGE,
  PORTFOLIO_TITLE_MAX,
  removeOwnPhotos,
  type PortfolioObject,
} from "@/data/contractor-portfolio-source";
import { useAvatarUpload } from "@/hooks/use-avatar-upload";
import { useContractorPortfolioMutations } from "@/hooks/use-contractor-portfolio";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { KEEP_OUT_OF_DRAG } from "@/lib/portfolio-order";
import { ConfirmDialog } from "./ConfirmDialog";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

function SortablePhoto({
  url,
  index,
  onRemove,
  onCover,
}: {
  url: string;
  index: number;
  onRemove: () => void;
  onCover: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative aspect-square touch-manipulation overflow-hidden rounded-[10px] bg-secondary",
        isDragging && "z-[2] shadow-lg",
      )}
      data-testid="portfolio-editor-photo"
      {...attributes}
      {...listeners}
      aria-label={t("contractorCard.portfolio.thumb", { number: index + 2 })}
    >
      <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
      <button
        type="button"
        aria-label={t("contractorCard.portfolio.removePhoto")}
        {...KEEP_OUT_OF_DRAG}
        onClick={onRemove}
        className="absolute right-1 top-1 grid h-[26px] w-[26px] place-items-center rounded-full bg-[rgba(14,13,6,0.72)] text-white"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        {...KEEP_OUT_OF_DRAG}
        onClick={onCover}
        className="absolute bottom-1 left-1 flex h-[26px] items-center rounded-full bg-[rgba(14,13,6,0.72)] px-2 text-[11px] font-medium text-white"
      >
        {t("contractorCard.portfolio.makeCover")}
      </button>
    </div>
  );
}

/**
 * Adds or edits one portfolio object in its own window. The object is saved by
 * itself, at once: the card form's Save button does not touch it.
 */
export function PortfolioObjectEditor({
  orgId,
  object,
  open,
  onOpenChange,
}: {
  orgId: string;
  /** null adds a new object. */
  object: PortfolioObject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const defaultTitle = t("contractorCard.portfolio.defaultTitle");
  const { uploadAvatar } = useAvatarUpload();
  const { save, remove } = useContractorPortfolioMutations(orgId);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(0);
  const [error, setError] = useState<"title" | "photos" | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const uploadedHere = useRef<string[]>([]);
  const sessionNo = useRef(0);

  // Filled while rendering the opening, so the name is there before focus selects it.
  // A refetch of the same object later must not wipe what is being typed.
  const session = open ? object?.id ?? "new" : null;
  const [seeded, setSeeded] = useState<string | null>(null);
  if (seeded !== session) {
    setSeeded(session);
    sessionNo.current += 1;
    if (session !== null) {
      setTitle(object?.title ?? defaultTitle);
      setPhotos(object?.photos ?? []);
      setLoading(0);
      setError(null);
      uploadedHere.current = [];
    }
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const busy = save.isPending || remove.isPending;
  const dirty = object
    ? title !== object.title || photos.join("\n") !== object.photos.join("\n")
    : title !== defaultTitle || photos.length > 0;
  const free = PORTFOLIO_MAX_PHOTOS - photos.length - loading;
  const [cover, ...rest] = photos;

  async function addFiles(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, Math.max(0, free));
    if (files.length === 0) return;
    setError(null);
    const started = sessionNo.current;
    setLoading((n) => n + files.length);
    await Promise.all(
      files.map(async (file) => {
        try {
          const { url } = await uploadAvatar(file, { maxDimension: PORTFOLIO_PHOTO_EDGE });
          if (started !== sessionNo.current) {
            void removeOwnPhotos([url]);
            return;
          }
          uploadedHere.current.push(url);
          setPhotos((current) => (current.length < PORTFOLIO_MAX_PHOTOS ? [...current, url] : current));
        } catch {
          if (started === sessionNo.current) toast({ title: t("contractorCard.portfolio.uploadFailed"), variant: "destructive" });
        } finally {
          if (started === sessionNo.current) setLoading((n) => Math.max(0, n - 1));
        }
      }),
    );
  }

  function close() {
    sessionNo.current += 1;
    const saved = new Set(object?.photos ?? []);
    void removeOwnPhotos(uploadedHere.current.filter((url) => !saved.has(url)));
    uploadedHere.current = [];
    onOpenChange(false);
  }

  function requestClose() {
    if (busy) return;
    if (dirty || loading > 0) setConfirmExit(true);
    else close();
  }

  async function submit() {
    const name = title.trim();
    if (!name || (!object && name === defaultTitle)) {
      setError("title");
      titleRef.current?.focus();
      return;
    }
    if (photos.length === 0) {
      setError("photos");
      return;
    }
    if (loading > 0) return;
    try {
      await save.mutateAsync({ object, input: { title: name, photos } });
      void removeOwnPhotos(uploadedHere.current.filter((url) => !photos.includes(url)));
      uploadedHere.current = [];
      onOpenChange(false);
    } catch {
      toast({ title: t("contractorCard.portfolio.saveFailed"), variant: "destructive" });
    }
  }

  async function deleteObject() {
    if (!object) return;
    try {
      await remove.mutateAsync(object);
      sessionNo.current += 1;
      void removeOwnPhotos(uploadedHere.current.filter((url) => !object.photos.includes(url)));
      uploadedHere.current = [];
      setConfirmDelete(false);
      onOpenChange(false);
    } catch {
      toast({ title: t("contractorCard.portfolio.deleteFailed"), variant: "destructive" });
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = rest.indexOf(String(active.id));
    const to = rest.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setPhotos([cover, ...arrayMove(rest, from, to)]);
  }

  const heading = t(object ? "contractorCard.portfolio.editTitle" : "contractorCard.portfolio.newTitle");
  const saveLabel = save.isPending ? t("upload.modal.saving") : t("common.save");

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-[rgba(14,13,6,0.6)]" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            data-testid="portfolio-editor"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              const input = titleRef.current;
              if (!input) return;
              // A new object starts with its name selected; editing does not pop the phone keyboard.
              if (!object) {
                input.focus();
                input.select();
              } else {
                (event.currentTarget as HTMLElement).focus();
              }
            }}
            className="fixed inset-0 z-[71] flex flex-col overflow-hidden bg-card text-foreground outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[calc(100dvh-48px)] sm:w-[560px] sm:max-w-[calc(100vw-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-modal sm:shadow-xl"
          >
            <div className="flex items-center gap-2.5 border-b border-border px-3 py-1.5 sm:border-0 sm:pb-1 sm:pl-5 sm:pr-4 sm:pt-4">
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={requestClose}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-foreground sm:order-last"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              <DialogPrimitive.Title className="min-w-0 flex-1 text-center text-body font-bold sm:text-left">{heading}</DialogPrimitive.Title>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || loading > 0}
                className="px-1 py-1.5 text-[15px] font-semibold text-accent disabled:opacity-50 sm:hidden"
              >
                {saveLabel}
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3 sm:px-5 sm:pb-4 sm:pt-3">
              <Input
                ref={titleRef}
                value={title}
                maxLength={PORTFOLIO_TITLE_MAX}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setError(null);
                }}
                aria-label={defaultTitle}
                aria-invalid={error === "title"}
                disabled={busy}
                className="text-[16px] font-semibold selection:bg-accent selection:text-accent-foreground"
              />
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                data-testid="portfolio-file-input"
                onChange={(event) => {
                  void addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              {cover ? (
                <>
                  <div className="relative aspect-video min-h-[200px] w-full shrink-0 overflow-hidden rounded-[14px] bg-secondary max-sm:aspect-auto max-sm:flex-1">
                    <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
                    <button
                      type="button"
                      aria-label={t("contractorCard.portfolio.removePhoto")}
                      onClick={() => setPhotos(rest)}
                      className="absolute right-2 top-2 grid h-[30px] w-[30px] place-items-center rounded-full bg-[rgba(14,13,6,0.72)] text-white"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span className="absolute bottom-2 left-2 flex h-7 items-center rounded-full bg-accent px-2.5 text-[12px] font-medium text-accent-foreground">
                      {t("contractorCard.portfolio.cover")}
                    </span>
                  </div>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={rest} strategy={rectSortingStrategy}>
                      <div className="grid shrink-0 grid-cols-3 gap-2 sm:grid-cols-4">
                        {rest.map((url, i) => (
                          <SortablePhoto
                            key={url}
                            url={url}
                            index={i}
                            onRemove={() => setPhotos((current) => current.filter((item) => item !== url))}
                            onCover={() => setPhotos((current) => [url, ...current.filter((item) => item !== url)])}
                          />
                        ))}
                        {Array.from({ length: loading }, (_, i) => (
                          <div key={`loading-${i}`} className="grid aspect-square place-items-center rounded-[10px] bg-secondary p-1.5 text-center text-[12px] text-muted-foreground">
                            {t("contractorCard.portfolio.uploading")}
                          </div>
                        ))}
                        {free > 0 ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => fileRef.current?.click()}
                            className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-[10px] border-[1.5px] border-dashed border-border p-1.5 text-center text-[12.5px] text-foreground"
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            {t("contractorCard.portfolio.addPhoto")}
                          </button>
                        ) : null}
                      </div>
                    </SortableContext>
                  </DndContext>
                  <span className="text-right text-[12.5px] tabular-nums text-muted-foreground" data-testid="portfolio-photo-count">
                    {t("contractorCard.portfolio.photoCounter", { count: photos.length, max: PORTFOLIO_MAX_PHOTOS })}
                  </span>
                </>
              ) : loading > 0 ? (
                <div className="flex min-h-[220px] flex-1 items-center justify-center gap-2 rounded-2xl bg-secondary text-body-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t("contractorCard.portfolio.uploading")}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="flex min-h-[220px] w-full flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-border bg-background p-4 text-center text-body font-medium text-foreground"
                >
                  <span className="mb-1 grid h-14 w-14 place-items-center rounded-full bg-accent/10 text-accent">
                    <Plus className="h-6 w-6" aria-hidden="true" />
                  </span>
                  {t("contractorCard.portfolio.addPhoto")}
                  <span className="text-[13px] font-normal text-muted-foreground">{t("contractorCard.portfolio.addPhotoHint")}</span>
                </button>
              )}
              {error ? (
                <p className="text-caption text-destructive" role="alert">
                  {t(`contractorCard.portfolio.errors.${error}`)}
                </p>
              ) : null}
              {object ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                  className="self-start py-2 text-body-sm font-medium text-destructive sm:hidden"
                >
                  {t("contractorCard.portfolio.delete")}
                </button>
              ) : null}
            </div>
            <div className="hidden flex-wrap items-center gap-2.5 border-t border-border px-5 pb-[18px] pt-3 sm:flex">
              {object ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                  className="text-body-sm font-medium text-destructive"
                >
                  {t("contractorCard.portfolio.delete")}
                </button>
              ) : null}
              <span className="flex-1" />
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                {t("common.cancel")}
              </Button>
              <Button type="button" onClick={() => void submit()} disabled={busy || loading > 0}>
                {saveLabel}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <ConfirmDialog
        open={confirmExit}
        onOpenChange={setConfirmExit}
        title={t("contractorCard.portfolio.exitTitle")}
        confirmLabel={t("contractorCard.portfolio.exitConfirm")}
        cancelLabel={t("contractorCard.portfolio.exitStay")}
        onConfirm={() => {
          setConfirmExit(false);
          close();
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("contractorCard.portfolio.deleteTitle", { title: object?.title ?? "" })}
        description={t("contractorCard.portfolio.deleteBody")}
        confirmLabel={t("contractorCard.portfolio.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        destructive
        busy={remove.isPending}
        onConfirm={() => void deleteObject()}
      />
    </>
  );
}
