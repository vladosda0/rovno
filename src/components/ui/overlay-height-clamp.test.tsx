import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Contract tests on the three overlay base class strings: an overlay must bound
 * its own height and scroll its own overflow, and a side sheet must keep h-full
 * and take only the scroll container. Call-site counts and the staging
 * measurement live in the PR body, not here.
 *
 * The clamp and the scroller must not be separable: a call site that passes
 * `overflow-hidden` gets a bounded box with no way to reach what it cut off, which
 * is worse than the unclamped original. tailwind-merge drops an EARLIER overflow-y-*
 * when a later `overflow-*` conflicts with it, so the scroller has to be appended
 * AFTER the call site's className, not carried in the base string.
 */

const hasViewportHeightBound = (el: Element) => /max-h-\[[^\]]*dvh/.test(el.className);
// The bound is the FULL viewport, never a reduced one. A gutter (`calc(100dvh-2rem)`)
// makes an overlay whose height lands inside that band scroll where it previously fit,
// which is a change on screens where the content already fits.
const boundIsTheWholeViewport = (el: Element) =>
  /\bmax-h-\[100dvh\]/.test(el.className) && !/max-h-\[calc\(/.test(el.className);
// The scroller must be important. Measured: cn(BASE, "overflow-hidden", scroller)
// keeps both utilities, so a bare overflow-y-auto wins the y axis only by Tailwind's
// emission order, while `!overflow-y-auto` compiles to `overflow-y: auto !important`.
const scrollsItsOwnOverflow = (el: Element) => /(?:^|\s)!overflow-y-auto(?:\s|$)/.test(el.className);

describe("overlay primitives clamp their height and scroll their own overflow", () => {
  it("DialogContent is bounded by the viewport and scrolls internally", () => {
    render(
      <Dialog open>
        <DialogContent>body</DialogContent>
      </Dialog>,
    );
    const content = screen.getByRole("dialog");
    expect(hasViewportHeightBound(content)).toBe(true);
    expect(scrollsItsOwnOverflow(content)).toBe(true);
  });

  it("AlertDialogContent is bounded by the viewport and scrolls internally", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>body</AlertDialogContent>
      </AlertDialog>,
    );
    const content = screen.getByRole("alertdialog");
    expect(hasViewportHeightBound(content)).toBe(true);
    expect(scrollsItsOwnOverflow(content)).toBe(true);
  });

  it.each(["top", "bottom"] as const)(
    "a %s sheet has no height of its own, so it needs the viewport bound",
    (side) => {
      render(
        <Sheet open>
          <SheetContent side={side}>body</SheetContent>
        </Sheet>,
      );
      const content = screen.getByRole("dialog");
      expect(hasViewportHeightBound(content)).toBe(true);
      expect(scrollsItsOwnOverflow(content)).toBe(true);
    },
  );

  it.each(["left", "right"] as const)(
    "a %s sheet stays full height and only gains the scroll container",
    (side) => {
      render(
        <Sheet open>
          <SheetContent side={side}>body</SheetContent>
        </Sheet>,
      );
      const content = screen.getByRole("dialog");
      // inset-y-0 + h-full already bounds these to the viewport. A max-h on top of
      // that wins over the height and leaves a gap at the bottom of the screen.
      expect(content.className).toContain("h-full");
      expect(hasViewportHeightBound(content)).toBe(false);
      expect(scrollsItsOwnOverflow(content)).toBe(true);
    },
  );
});

describe("the viewport bound leaves no gutter", () => {
  it.each([
    ["DialogContent", <Dialog open><DialogContent>body</DialogContent></Dialog>, "dialog"],
    ["AlertDialogContent", <AlertDialog open><AlertDialogContent>body</AlertDialogContent></AlertDialog>, "alertdialog"],
    ["a top sheet", <Sheet open><SheetContent side="top">body</SheetContent></Sheet>, "dialog"],
    ["a bottom sheet", <Sheet open><SheetContent side="bottom">body</SheetContent></Sheet>, "dialog"],
  ])("%s bounds at the whole viewport, not a reduced one", (_name, tree, role) => {
    render(tree);
    expect(boundIsTheWholeViewport(screen.getByRole(role))).toBe(true);
  });
});


describe("a call site cannot take the scroll container away", () => {
  // The base clamp survives any call-site override that is not itself a max-h,
  // so a call site that kills the scroller is left with a bounded, unscrollable
  // box. ApprovalStampFormModal passes exactly this className.
  it("DialogContent keeps overflow-y-auto when the call site passes overflow-hidden", () => {
    render(
      <Dialog open>
        <DialogContent className="w-[92vw] max-w-md p-0 gap-0 overflow-hidden">body</DialogContent>
      </Dialog>,
    );
    const content = screen.getByRole("dialog");
    expect(hasViewportHeightBound(content)).toBe(true);
    expect(scrollsItsOwnOverflow(content)).toBe(true);
  });

  it("AlertDialogContent keeps overflow-y-auto when the call site passes overflow-hidden", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent className="overflow-hidden">body</AlertDialogContent>
      </AlertDialog>,
    );
    const content = screen.getByRole("alertdialog");
    expect(hasViewportHeightBound(content)).toBe(true);
    expect(scrollsItsOwnOverflow(content)).toBe(true);
  });

  it.each(["top", "bottom", "left", "right"] as const)(
    "a %s sheet keeps overflow-y-auto when the call site passes overflow-hidden",
    (side) => {
      render(
        <Sheet open>
          <SheetContent side={side} className="overflow-hidden">
            body
          </SheetContent>
        </Sheet>,
      );
      expect(scrollsItsOwnOverflow(screen.getByRole("dialog"))).toBe(true);
    },
  );
});

describe("a tooltip inside an overlay is not clipped by the overlay", () => {
  // overflow-y: auto forces overflow-x to compute to auto, and the overlay's
  // translate makes it the containing block for its position: fixed poppers, so
  // an in-overlay popper that is not portalled out is clipped on both axes.
  it("TooltipContent renders outside the dialog element", () => {
    render(
      <Dialog open>
        <DialogContent>
          <TooltipProvider>
            <Tooltip open>
              <TooltipTrigger>why</TooltipTrigger>
              <TooltipContent>because</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </DialogContent>
      </Dialog>,
    );
    const tip = screen.getAllByText("because")[0];
    expect(tip.closest('[role="dialog"]')).toBeNull();
  });
});

describe("the scroller does not depend on Tailwind's emission order", () => {
  it.each([
    ["DialogContent", <Dialog open><DialogContent className="overflow-hidden">body</DialogContent></Dialog>, "dialog"],
    ["AlertDialogContent", <AlertDialog open><AlertDialogContent className="overflow-hidden">body</AlertDialogContent></AlertDialog>, "alertdialog"],
    ["a top sheet", <Sheet open><SheetContent side="top" className="overflow-hidden">body</SheetContent></Sheet>, "dialog"],
    ["a right sheet", <Sheet open><SheetContent side="right" className="overflow-hidden">body</SheetContent></Sheet>, "dialog"],
  ])("%s wins the y axis by specificity, not by source order", (_name, tree, role) => {
    render(tree);
    const cls = screen.getByRole(role).className;
    expect(cls).toContain("overflow-hidden");
    expect(/(?:^|\s)!overflow-y-auto(?:\s|$)/.test(cls)).toBe(true);
    expect(/(?:^|\s)overflow-y-auto(?:\s|$)/.test(cls)).toBe(false);
  });
});
