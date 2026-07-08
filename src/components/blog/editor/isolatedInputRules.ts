// Stops markdown input rules from tearing apart the nodes that hold a caption
// or an FAQ pair.
//
// `isolating: true` guards SELECTIONS and block COMMANDS: setBlockType and
// wrapIn are correctly inapplicable inside a figcaption or a faqQuestion. It
// does NOT guard `tr.replaceRangeWith`, which is what `nodeInputRule` calls.
//
// So typing `---` inside a figure caption replaced the caret's range with an
// <hr>, splitting the <figure> in two and duplicating the image; typing it in an
// FAQ answer split the pair into two halves, each missing a question or an
// answer. Both halves then fail extractFaqItems' `question && answer` gate, so an
// article that visibly shows a Q/A silently emits no FAQPage. BlogEditorPage
// autosaves `editor.getJSON()` on change, so the wreckage reaches content jsonb.
//
// The two offenders are the only extensions that build a node from an INPUT rule:
//   @tiptap/extension-horizontal-rule  /^(?:---|—-|___\s|\*\*\*\s)$/
//   @tiptap/extension-image            ![alt](src)
//
// Inside a guarded node we swallow the match and re-insert it as literal text
// (an input rule counts as "handled" only if its handler leaves steps on the
// transaction). Everywhere else we return null and the real rule runs, so `---`
// still makes a divider in ordinary prose.
//
// THIS IS NOT THE WHOLE STORY. `tr.replaceWith` has three callers, and an input rule
// is only one of them. The other two are guarded in RichTextEditor's editorProps:
//   * @tiptap/extension-youtube's nodePasteRule — pasting a YouTube URL into a caption
//   * the editor's own uploadAndInsert / a block HTML paste
// See `isolatedEditorProps` below, which RichTextEditor installs. Locking one door in a
// room with three is how the first version of this file shipped.
//
// The fourth door is not a caller of `tr.replaceWith` at all: a SELECTION that starts
// outside a guarded node and ends inside it. `isolating: true` does not prevent one from
// being built — `TextSelection.between` happily spans the boundary, and that is exactly
// what a shift-click or a drag produces. Any edit on such a range (paste, typing,
// Backspace) then replaces it, deleting the whole <figure> or emptying the FAQ question,
// and the resulting doc is VALID so autosave writes it away. Widening the paste guard to
// `$to` would not help: `tr.insertText` over that range destroys the node by itself.
//
// So we make the crossing selection unrepresentable, via `createSelectionBetween`. That
// closes paste, typing and Backspace in one place, rather than one handler at a time.

import { Extension, InputRule, type Editor } from "@tiptap/core";
import { inputRegex as IMAGE_FIND } from "@tiptap/extension-image";
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";
import { Selection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/** Nodes whose content must never be structurally replaced. */
export const ISOLATED_NODE_NAMES = ["figcaption", "faqQuestion", "faqAnswer"] as const;

/** The nodes that OWN those: what a block insertion would tear in half. */
export const ISOLATED_CONTAINER_NAMES = ["figure", "faqItem"] as const;

/**
 * Verbatim from the offending extensions — a looser copy would let the rule through.
 *
 * `extension-image` exports its `inputRegex`, so we import it rather than copy it and
 * a package update cannot silently widen what it matches past our guard.
 * `extension-horizontal-rule` exports nothing, so that one is pinned by a test.
 */
const HORIZONTAL_RULE_FIND = /^(?:---|—-|___\s|\*\*\*\s)$/;

/** Exported solely so a test can pin it against the installed package's source. */
export const HORIZONTAL_RULE_FIND_FOR_TEST = HORIZONTAL_RULE_FIND;

export function isInsideIsolatedNode($pos: ResolvedPos): boolean {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ((ISOLATED_NODE_NAMES as readonly string[]).includes($pos.node(depth).type.name)) {
      return true;
    }
  }
  return false;
}

/**
 * The position just after the figure / faqItem that `$pos` sits inside, or null.
 *
 * Used to HOIST a block insertion out of a caption or an FAQ pair instead of letting
 * it split one. `isolating: true` stops selections and commands; it does nothing about
 * `tr.replaceWith`, which is what `insertContentAt` ultimately calls.
 */
export function positionAfterIsolatedContainer($pos: ResolvedPos): number | null {
  return isolatedContainerRange($pos)?.to ?? null;
}

/** The span of the figure / faqItem `$pos` sits inside, or null. Containers never nest. */
function isolatedContainerRange($pos: ResolvedPos): { from: number; to: number } | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ((ISOLATED_CONTAINER_NAMES as readonly string[]).includes($pos.node(depth).type.name)) {
      return { from: $pos.before(depth), to: $pos.after(depth) };
    }
  }
  return null;
}

/** Identity of the guarded container a position lies in; -1 for "none". */
const containerKey = ($pos: ResolvedPos) => isolatedContainerRange($pos)?.from ?? -1;

/**
 * A selection that never crosses the boundary of a figure or an FAQ pair.
 *
 * Returns null when the selection ProseMirror WOULD build already keeps both ends in the same
 * container (or both outside), which is the common case and includes selecting straight
 * across a figure into the prose beyond it. Otherwise the head is clamped back to the
 * anchor's side, so a shift-click from a paragraph into a caption selects up to the figure
 * and stops.
 *
 * Every destructive edit — paste, typing, Backspace, drag — goes through the current
 * selection, so refusing to build the crossing range fixes all of them at once. A guard on
 * any single handler cannot: `tr.insertText` over a boundary-crossing range deletes the
 * <figure> without any handler being involved.
 */
export function boundedSelectionBetween(
  doc: PMNode,
  $anchor: ResolvedPos,
  $head: ResolvedPos,
): Selection | null {
  // Judge the RESULT, not the arguments. `TextSelection.between` MOVES an endpoint whose
  // parent is not inline content: a click at doc position 0, just before a leading <figure>,
  // arrives here with both keys -1 and is then resolved forward to a position INSIDE the
  // caption. Testing the raw `$anchor`/`$head` would wave that through as "both outside".
  const natural = TextSelection.between($anchor, $head);
  if (containerKey(natural.$from) === containerKey(natural.$to)) return null;

  // Clamp using the endpoints ProseMirror actually chose. One of the two is inside a
  // container (their keys differ), so exactly one branch below is reachable.
  const $a = natural.$anchor;
  const $h = natural.$head;
  const anchorIn = isolatedContainerRange($a);
  const headIn = isolatedContainerRange($h);
  const forward = $h.pos > $a.pos;
  const clamped = anchorIn
    // Anchored inside: keep the head within this container.
    ? (forward ? anchorIn.to - 1 : anchorIn.from + 1)
    // Anchored outside: stop just short of the container the head fell into.
    : (forward ? headIn!.from : headIn!.to);

  const bounded = TextSelection.between(doc.resolve($a.pos), doc.resolve(clamped));
  if (containerKey(bounded.$from) === containerKey(bounded.$to)) return bounded;
  // The clamp was itself resolved across the boundary. Collapse rather than hand back a range
  // whose edit would delete the container.
  //
  // No known input reaches this: the exhaustive sweep below (every (anchor, head) pair over
  // eight document shapes) never triggers it, and removing this line fails no test. It stays
  // as the invariant in code — this function may not return a crossing range — because the
  // clamp above depends on `TextSelection.between`'s resolution behaviour, and that is
  // precisely what the argument-based version of this check got wrong.
  return Selection.near($a);
}

/**
 * Insert block nodes at `position` (or the caret), hoisting out of a guarded container.
 *
 * A <figure> is a block. Inserting one at a caret inside a caption or an FAQ answer makes
 * ProseMirror split the enclosing node to fit it: the figure is DUPLICATED and the caption
 * torn in half, or the FAQ pair becomes two invalid halves — and `doc.check()` passes, so
 * autosave writes the wreckage to `content` jsonb.
 *
 * A function rather than three lines inside `uploadAndInsert`, so the CALL SITE is testable:
 * deleting the hoist there left the whole suite green.
 */
export function insertBlockNodesHoisted(editor: Editor, nodes: object[], position?: number): void {
  // The drop position was captured before the uploads awaited, so the doc may have shrunk
  // underneath it. Clamp rather than throw a RangeError.
  const size = editor.state.doc.content.size;
  const at = Math.min(Math.max(position ?? editor.state.selection.from, 0), size);
  const target = positionAfterIsolatedContainer(editor.state.doc.resolve(at)) ?? at;
  editor.chain().focus().insertContentAt(target, nodes).run();
}

/** `text/plain`, or the `text/uri-list` a dragged link/image carries instead. */
function clipboardText(data: DataTransfer | null | undefined): string {
  return data?.getData("text/plain") || data?.getData("text/uri-list") || "";
}

/**
 * Insert `text` as plain text, collapsing newlines.
 *
 * A caption and an FAQ question are `inline*`, so a literal `\n` would render as nothing;
 * an FAQ answer would keep it inside one paragraph. A space is the honest reading of both.
 * Not trimmed: `tr.insertText("", from, to)` over a non-empty range deletes it, which is
 * exactly what a native paste of empty text does.
 */
export function insertPlainText(view: EditorView, text: string, at?: number): void {
  const size = view.state.doc.content.size;
  const clean = text.replace(/\s*\r?\n+\s*/g, " ");
  const { selection } = view.state;
  const from = at === undefined ? selection.from : Math.min(Math.max(at, 0), size);
  const to = at === undefined ? selection.to : from;
  if (!clean && from === to) return;
  view.dispatch(view.state.tr.insertText(clean, from, to).scrollIntoView());
}

/**
 * Inside a caption or an FAQ pair, paste TEXT and nothing else. Returns false elsewhere,
 * so `someProp` falls through to the next handler (extension-link's, ProseMirror's own).
 *
 * A pasted <hr>, <img> or block slice makes ProseMirror split the enclosing node to fit it,
 * and a pasted YouTube URL does the same through extension-youtube's nodePasteRule. Both
 * leave a doc that passes `doc.check()`, so autosave persists it.
 *
 * WHERE this runs is the point: prosemirror-view's `doPaste` consults `handlePaste` before
 * it dispatches the `uiEvent: "paste"` transaction, and every paste rule keys off that meta.
 * Handling it here means no paste rule ever runs, rather than racing one that already has.
 */
export function handleIsolatedPaste(view: EditorView, event: ClipboardEvent): boolean {
  const { $from, $to } = view.state.selection;
  if (containerKey($from) === -1 && containerKey($to) === -1) return false;

  event.preventDefault();
  // `createSelectionBetween` should make this unreachable; refuse rather than corrupt if a
  // boundary-crossing selection ever arrives from a path that does not consult it.
  if (containerKey($from) !== containerKey($to)) return true;

  insertPlainText(view, clipboardText(event.clipboardData));
  return true;
}

/** Same rule for a non-file drop: the drop path reaches the identical paste-rule machinery. */
export function handleIsolatedDrop(view: EditorView, event: DragEvent, pos: number | undefined): boolean {
  if (pos === undefined) return false;
  if (!isInsideIsolatedNode(view.state.doc.resolve(pos))) return false;
  event.preventDefault();
  insertPlainText(view, clipboardText(event.dataTransfer), pos);
  return true;
}

/**
 * The editorProps RichTextEditor installs. Exported as one object so a test can drive the
 * REAL call sites: three earlier tests characterised the bug rather than the fix, and
 * deleting every guard left the whole suite green.
 */
export const isolatedEditorProps = {
  createSelectionBetween: (view: EditorView, $anchor: ResolvedPos, $head: ResolvedPos) =>
    boundedSelectionBetween(view.state.doc, $anchor, $head),
  handlePaste: (view: EditorView, event: ClipboardEvent) => handleIsolatedPaste(view, event),
};

function guard(find: RegExp): InputRule {
  return new InputRule({
    find,
    handler: ({ state, range, match }) => {
      if (!isInsideIsolatedNode(state.doc.resolve(range.from))) {
        return null; // not our business — let the real rule build its node
      }
      // TipTap counts a rule as "handled" only if its handler leaves a STEP on the
      // shared transaction (`state` here is a chainable state whose `tr` is that
      // transaction). Re-insert exactly what was typed, so the author sees `---`
      // rather than losing the characters to a rule that then does nothing.
      state.tr.insertText(match[0], range.from, range.to);
      return undefined;
    },
  });
}

/**
 * Registered with a priority above the extensions it shadows, because TipTap
 * tries input rules in extension-priority order and the FIRST rule that leaves a
 * step on the transaction wins.
 */
export const IsolatedInputRules = Extension.create({
  name: "isolatedInputRules",
  priority: 1000,
  addInputRules() {
    return [guard(HORIZONTAL_RULE_FIND), guard(IMAGE_FIND)];
  },
});
