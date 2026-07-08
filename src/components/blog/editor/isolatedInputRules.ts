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
// The two offenders are the only extensions that build a node from an input rule:
//   @tiptap/extension-horizontal-rule  /^(?:---|—-|___\s|\*\*\*\s)$/
//   @tiptap/extension-image            ![alt](src)
//
// Inside a guarded node we swallow the match and re-insert it as literal text
// (an input rule counts as "handled" only if its handler leaves steps on the
// transaction). Everywhere else we return null and the real rule runs, so `---`
// still makes a divider in ordinary prose.

import { Extension, InputRule } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";

/** Nodes whose content must never be structurally replaced by an input rule. */
export const ISOLATED_NODE_NAMES = ["figcaption", "faqQuestion", "faqAnswer"] as const;

/** Verbatim from the offending extensions — a looser copy would let the rule through. */
const HORIZONTAL_RULE_FIND = /^(?:---|—-|___\s|\*\*\*\s)$/;
const IMAGE_FIND = /(?:^|\s)(!\[(.+|:?)\]\((\S+)(?:(?:\s+)["'](\S+)["'])?\))$/;

function isInsideIsolatedNode($pos: ResolvedPos): boolean {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ((ISOLATED_NODE_NAMES as readonly string[]).includes($pos.node(depth).type.name)) {
      return true;
    }
  }
  return false;
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
