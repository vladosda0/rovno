import { cn } from "@/lib/utils";

// Yandex's own round mark (login-with-yandex-8-2.svg from the Yandex ID docs).
export function YandexMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" fill="none" aria-hidden="true" className={className}>
      <rect width="44" height="44" rx="22" fill="#FC3F1D" />
      <path
        d="M25.2438 12.3208H23.0173C19.2005 12.3208 17.292 14.2292 17.292 17.0919C17.292 20.2726 18.5643 21.863 21.427 23.7714L23.6535 25.3618L17.292 35.222H12.2029L18.2463 26.316C14.7475 23.7714 12.839 21.5449 12.839 17.41C12.839 12.3208 16.3378 8.82202 23.0173 8.82202H29.6969V35.222H25.2438V12.3208Z"
        fill="white"
      />
    </svg>
  );
}

const VK_SQUARE =
  "M3.33331 13.56C3.33331 8.58197 3.33331 6.09295 4.87979 4.54648C6.42627 3 8.91528 3 13.8933 3H14.7733C19.7513 3 22.2404 3 23.7868 4.54648C25.3333 6.09295 25.3333 8.58197 25.3333 13.56V14.44C25.3333 19.418 25.3333 21.907 23.7868 23.4535C22.2404 25 19.7513 25 14.7733 25H13.8933C8.91528 25 6.42627 25 4.87979 23.4535C3.33331 21.907 3.33331 19.418 3.33331 14.44V13.56Z";
const VK_LETTERS =
  "M15.0398 18.9C10.0174 18.9 7.15269 15.4466 7.03333 9.70001H9.54912C9.63175 13.9178 11.4864 15.7044 12.9555 16.0728V9.70001H15.3245V13.3376C16.7752 13.1811 18.2992 11.5234 18.8134 9.70001H21.1823C20.7875 11.9471 19.1348 13.6047 17.9595 14.2862C19.1348 14.8387 21.0171 16.2846 21.7333 18.9H19.1256C18.5655 17.1503 17.17 15.7965 15.3245 15.6123V18.9H15.0398Z";
const VK_BLUE = "#0077FF";

function VkGlyph({ square, letters, className }: { square: string; letters: string; className?: string }) {
  return (
    <svg viewBox="0 0 29 28" fill="none" aria-hidden="true" className={className}>
      <path d={VK_SQUARE} fill={square} />
      <path d={VK_LETTERS} fill={letters} />
    </svg>
  );
}

/**
 * The VK ID mark from the official set (@vkid/sdk 2.6.10). Its colour may not change, so
 * on a blue (hovered) button inside a `group` it swaps to VK's own white variant, which
 * otherwise would melt into the background (mockup external-login-s3, frame 2). 20 points
 * with its margins, so the square matches the 16-point Yandex circle.
 */
export function VkMark({ className, swapOnHover = false }: { className?: string; swapOnHover?: boolean }) {
  const fade = "absolute inset-0 !h-full !w-full transition-opacity duration-150 ease-in-out motion-reduce:transition-none";
  return (
    <span className={cn("relative inline-block h-5 w-5 shrink-0", className)} aria-hidden="true">
      <VkGlyph square={VK_BLUE} letters="white" className={cn(fade, swapOnHover && "group-hover:opacity-0")} />
      {swapOnHover && <VkGlyph square="white" letters={VK_BLUE} className={cn(fade, "opacity-0 group-hover:opacity-100")} />}
    </span>
  );
}
