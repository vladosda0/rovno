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
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
