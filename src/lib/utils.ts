import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The design system adds custom spacing tokens (sp-1/sp-2/sp-3 → --space-*).
// Teach tailwind-merge about them so utilities like `p-sp-2` are recognized as
// padding and properly override conflicting classes. Without this, merging a
// shadcn default such as CardContent's `p-6 pt-0` with `p-sp-2` leaves the stray
// `pt-0` in place and the top padding silently collapses to 0.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: ["sp-1", "sp-2", "sp-3"],
    },
    classGroups: {
      // The design system defines custom font sizes (text-h1/h2/h3, text-body,
      // text-body-sm, text-caption) in tailwind.config. Without registering them,
      // tailwind-merge misclassifies e.g. `text-caption` as a text COLOR and drops
      // it when merged with a real color such as `text-muted-foreground`, silently
      // collapsing the element to the 16px browser default. Declaring them as
      // font-size keeps size and color independent inside cn().
      "font-size": [{ text: ["h1", "h2", "h3", "body", "body-sm", "caption"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
