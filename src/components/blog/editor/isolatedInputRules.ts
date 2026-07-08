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
// See `handlePaste` / `handleDrop` there, which use the helpers below. Locking one
// door in a room with three is how the first version of this file shipped.

import { Extension, InputRule } from "@tiptap/core";
import { inputRegex as IMAGE_FIND } from "@tiptap/extension-image";
import type { ResolvedPos } from "@tiptap/pm/model";

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
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ((ISOLATED_CONTAINER_NAMES as readonly string[]).includes($pos.node(depth).type.name)) {
      return $pos.after(depth);
    }
  }
  return null;
}

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
