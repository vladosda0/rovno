import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SECTIONS,
  findSectionForLeaf,
  type LeafSlug,
  type SectionEntry,
} from "@/components/home/documents-hub/DocumentsLeftNav";

interface MobileSectionNavProps {
  activeLeaf: string;
  onSelect: (slug: LeafSlug) => void;
}

export function MobileSectionNav({ activeLeaf, onSelect }: MobileSectionNavProps) {
  const { t } = useTranslation();
  const activeSection: SectionEntry = findSectionForLeaf(activeLeaf);
  const showLeafPills = activeSection.leaves.length > 1;

  return (
    <div className="md:hidden space-y-2">
      {/* Section dropdown (replaces the desktop sidebar headings on mobile). */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="flex items-center gap-2 truncate">
              <activeSection.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t(activeSection.headingKey)}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
          {SECTIONS.map((section) => (
            <DropdownMenuItem
              key={section.key}
              onSelect={() => onSelect(section.leaves[0].slug as LeafSlug)}
              className={cn(
                activeSection.key === section.key && "bg-accent/10 text-accent font-medium",
              )}
            >
              <section.icon className="h-4 w-4 mr-2" />
              {t(section.headingKey)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Leaf pills (only for sections with multiple leaves). */}
      {showLeafPills && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {activeSection.leaves.map((leaf) => {
            const isActive = leaf.slug === activeLeaf;
            return (
              <button
                key={leaf.slug}
                type="button"
                onClick={() => onSelect(leaf.slug as LeafSlug)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-caption transition-colors whitespace-nowrap",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                <leaf.icon className="h-3.5 w-3.5" />
                {t(leaf.labelKey)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
