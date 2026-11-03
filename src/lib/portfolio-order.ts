import type { SyntheticEvent } from "react";
import { arrayMove } from "@dnd-kit/sortable";

/** The order after a drop, or null when nothing moved. */
export function movedOrder(ids: string[], activeId: string, overId: string | null): string[] | null {
  if (overId === null || activeId === overId) return null;
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0) return null;
  return arrayMove(ids, from, to);
}

const stop = (event: SyntheticEvent) => event.stopPropagation();

/** Spread on a button inside a sortable tile: none of the drag sensors start from it. */
export const KEEP_OUT_OF_DRAG = {
  onPointerDown: stop,
  onMouseDown: stop,
  onTouchStart: stop,
  onKeyDown: stop,
};
