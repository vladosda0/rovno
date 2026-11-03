import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus } from "lucide-react";
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
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PortfolioObjectEditor } from "@/components/contractor-card/PortfolioObjectEditor";
import { PORTFOLIO_MAX_OBJECTS, type PortfolioObject } from "@/data/contractor-portfolio-source";
import { useContractorPortfolio, useContractorPortfolioMutations } from "@/hooks/use-contractor-portfolio";
import { toast } from "@/hooks/use-toast";
import { KEEP_OUT_OF_DRAG, movedOrder } from "@/lib/portfolio-order";
import { cn } from "@/lib/utils";

function SortableObject({ object, onEdit }: { object: PortfolioObject; onEdit: () => void }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: object.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative flex min-w-0 cursor-grab touch-manipulation flex-col gap-[5px] rounded-xl bg-card",
        isDragging && "z-[2] rotate-[-1.5deg] scale-[1.03] shadow-lg",
      )}
      data-testid="portfolio-form-object"
      {...attributes}
      {...listeners}
      aria-roledescription={t("upload.modal.step3.visitka.portfolio.sortable")}
      aria-label={object.title}
      onClick={onEdit}
    >
      <span className="block aspect-[4/3] w-full overflow-hidden rounded-xl bg-secondary">
        {object.photos[0] ? (
          <img src={object.photos[0]} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />
        ) : null}
      </span>
      <button
        type="button"
        aria-label={t("upload.modal.step3.visitka.portfolio.editObject")}
        {...KEEP_OUT_OF_DRAG}
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
        className="absolute right-1.5 top-1.5 grid h-[30px] w-[30px] place-items-center rounded-full bg-white/90 text-[#0E0D06]"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span className="line-clamp-2 text-[13px] font-medium leading-tight [overflow-wrap:anywhere]">{object.title}</span>
      <span className="text-[12px] text-muted-foreground">{t("contractorCard.portfolio.photoCount", { count: object.photos.length })}</span>
    </div>
  );
}

/**
 * «Портфолио» under the reverse side of the card form. Objects and their order
 * are saved at once; the form's own Save button does not touch them.
 */
export function VisitkaPortfolioBlock({ orgId, canEdit }: { orgId: string | null; canEdit: boolean }) {
  const { t } = useTranslation();
  const query = useContractorPortfolio(canEdit ? orgId : null);
  const [editing, setEditing] = useState<PortfolioObject | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const heading = <h4 className="text-body-sm font-medium text-foreground">{t("contractorCard.portfolio.heading")}</h4>;

  if (!canEdit) return null;

  if (!orgId) {
    return (
      <div className="space-y-1.5 border-t border-border pt-4" data-testid="visitka-portfolio-block">
        {heading}
        <p className="text-caption text-muted-foreground">{t("upload.modal.step3.visitka.portfolio.saveFirst")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-border pt-4" data-testid="visitka-portfolio-block">
      <PortfolioBody
        orgId={orgId}
        objects={query.data ?? []}
        loading={query.isLoading}
        sensors={sensors}
        heading={heading}
        onEdit={(object) => {
          setEditing(object);
          setEditorOpen(true);
        }}
      />
      <PortfolioObjectEditor orgId={orgId} object={editing} open={editorOpen} onOpenChange={setEditorOpen} />
    </div>
  );
}

function PortfolioBody({
  orgId,
  objects,
  loading,
  sensors,
  heading,
  onEdit,
}: {
  orgId: string;
  objects: PortfolioObject[];
  loading: boolean;
  sensors: ReturnType<typeof useSensors>;
  heading: ReactNode;
  onEdit: (object: PortfolioObject | null) => void;
}) {
  const { t } = useTranslation();
  const { reorder } = useContractorPortfolioMutations(orgId);

  function onDragEnd(event: DragEndEvent) {
    const next = movedOrder(
      objects.map((object) => object.id),
      String(event.active.id),
      event.over ? String(event.over.id) : null,
    );
    if (!next) return;
    reorder.mutate(next, {
      onError: () => toast({ title: t("upload.modal.step3.visitka.portfolio.reorderFailed"), variant: "destructive" }),
    });
  }

  return (
    <>
      <div className="flex max-w-[560px] flex-wrap items-baseline justify-between gap-3">
        {heading}
        <span className="text-[12.5px] tabular-nums text-muted-foreground" data-testid="portfolio-object-count">
          {t("upload.modal.step3.visitka.portfolio.counter", { count: objects.length, max: PORTFOLIO_MAX_OBJECTS })}
        </span>
      </div>
      <p className="text-caption text-muted-foreground">{t("upload.modal.step3.visitka.portfolio.hint")}</p>
      {loading ? null : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={objects.map((object) => object.id)} strategy={rectSortingStrategy}>
            <div className="grid max-w-[560px] grid-cols-2 gap-2.5 sm:grid-cols-3">
              {objects.map((object) => (
                <SortableObject key={object.id} object={object} onEdit={() => onEdit(object)} />
              ))}
              {objects.length < PORTFOLIO_MAX_OBJECTS ? (
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onEdit(null)}
                    className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-0.5 rounded-xl border-[1.5px] border-dashed border-border p-1.5 text-center text-[13px] font-medium text-foreground"
                  >
                    <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
                    {t("contractorCard.portfolio.addObject")}
                  </button>
                </div>
              ) : null}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </>
  );
}
