import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  FileText,
  StickyNote,
  Image,
  Folder,
  FolderOpen,
  Calculator,
  IdCard,
  Package,
  BookOpen,
  FileType2,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export interface LeafItem {
  slug: string;
  labelKey: string;
  icon: typeof FileText;
}

export const LEAVES = {
  myAll: { slug: "my-all", labelKey: "home.documentsHub.nav.my.all", icon: FileText },
  myNotes: { slug: "my-notes", labelKey: "home.documentsHub.nav.my.notes", icon: StickyNote },
  myMedia: { slug: "my-media", labelKey: "home.documentsHub.nav.my.media", icon: Image },
  orgAll: { slug: "org-all", labelKey: "home.documentsHub.nav.org.all", icon: FileText },
  orgProjects: { slug: "org-projects", labelKey: "home.documentsHub.nav.org.projects", icon: FolderOpen },
  orgMedia: { slug: "org-media", labelKey: "home.documentsHub.nav.org.media", icon: Image },
  orgEstimates: { slug: "org-estimates", labelKey: "home.documentsHub.nav.org.estimates", icon: Calculator },
  orgCatalogs: { slug: "org-catalogs", labelKey: "home.documentsHub.nav.org.catalogs", icon: Package },
  orgContractorCard: { slug: "org-contractor-card", labelKey: "home.documentsHub.nav.org.contractorCard", icon: IdCard },
  catalogs: { slug: "catalogs", labelKey: "home.documentsHub.nav.catalogs", icon: Package },
  estimates: { slug: "estimates", labelKey: "home.documentsHub.nav.estimates", icon: Calculator },
  knowledgeBase: { slug: "knowledge-base", labelKey: "home.documentsHub.nav.knowledgeBase", icon: BookOpen },
  documentTemplates: { slug: "document-templates", labelKey: "home.documentsHub.nav.documentTemplates", icon: FileType2 },
} as const;

export type LeafSlug = (typeof LEAVES)[keyof typeof LEAVES]["slug"];

export const VALID_LEAVES: ReadonlySet<string> = new Set(
  Object.values(LEAVES).map((leaf) => leaf.slug),
);

export const DEFAULT_LEAF: LeafSlug = "my-all";

export const MY_GROUP: LeafItem[] = [LEAVES.myAll, LEAVES.myNotes, LEAVES.myMedia];
export const ORG_GROUP: LeafItem[] = [
  LEAVES.orgAll,
  LEAVES.orgProjects,
  LEAVES.orgMedia,
  LEAVES.orgEstimates,
  LEAVES.orgCatalogs,
  LEAVES.orgContractorCard,
];
export const FLAT_LEAVES: LeafItem[] = [
  LEAVES.catalogs,
  LEAVES.estimates,
  LEAVES.knowledgeBase,
  LEAVES.documentTemplates,
];

export interface SectionEntry {
  key: string;
  headingKey: string;
  icon: typeof FileText;
  leaves: LeafItem[];
}

/** Top-level "section" entries shown in the mobile section dropdown. Group
 * sections (My, Org) expand into leaves via the pill row; flat sections jump
 * straight to their single leaf. */
export const SECTIONS: SectionEntry[] = [
  { key: "my", headingKey: "home.documentsHub.nav.my.heading", icon: FileText, leaves: MY_GROUP },
  { key: "org", headingKey: "home.documentsHub.nav.org.heading", icon: FolderOpen, leaves: ORG_GROUP },
  { key: "catalogs", headingKey: "home.documentsHub.nav.catalogs", icon: Package, leaves: [LEAVES.catalogs] },
  { key: "estimates", headingKey: "home.documentsHub.nav.estimates", icon: Calculator, leaves: [LEAVES.estimates] },
  { key: "knowledge-base", headingKey: "home.documentsHub.nav.knowledgeBase", icon: BookOpen, leaves: [LEAVES.knowledgeBase] },
  { key: "document-templates", headingKey: "home.documentsHub.nav.documentTemplates", icon: FileType2, leaves: [LEAVES.documentTemplates] },
];

export function findSectionForLeaf(leafSlug: string): SectionEntry {
  return SECTIONS.find((s) => s.leaves.some((l) => l.slug === leafSlug)) ?? SECTIONS[0];
}

interface DocumentsLeftNavProps {
  activeSlug: string;
  onSelect: (slug: LeafSlug) => void;
  cta: ReactNode;
}

interface NavRowProps {
  slug: string;
  labelKey: string;
  icon: typeof FileText;
  activeSlug: string;
  onSelect: (slug: LeafSlug) => void;
  indent?: boolean;
}

function NavRow({ slug, labelKey, icon: Icon, activeSlug, onSelect, indent = false }: NavRowProps) {
  const { t } = useTranslation();
  const isActive = activeSlug === slug;
  return (
    <button
      type="button"
      onClick={() => onSelect(slug as LeafSlug)}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-body-sm transition-colors",
        indent && "pl-7",
        isActive
          ? "bg-accent/10 text-accent font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{t(labelKey)}</span>
    </button>
  );
}

interface GroupProps {
  headingKey: string;
  items: LeafItem[];
  activeSlug: string;
  onSelect: (slug: LeafSlug) => void;
  defaultOpen?: boolean;
}

function Group({ headingKey, items, activeSlug, onSelect, defaultOpen = true }: GroupProps) {
  const { t } = useTranslation();
  const hasActive = items.some((item) => item.slug === activeSlug);
  const [open, setOpen] = useState(defaultOpen || hasActive);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-caption font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/60">
        <span>{t(headingKey)}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open ? "" : "-rotate-90")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-0.5 space-y-0.5">
        {items.map((item) => (
          <NavRow
            key={item.slug}
            slug={item.slug}
            labelKey={item.labelKey}
            icon={item.icon}
            activeSlug={activeSlug}
            onSelect={onSelect}
            indent
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function DocumentsLeftNav({ activeSlug, onSelect, cta }: DocumentsLeftNavProps) {
  return (
    <aside className="w-full space-y-3">
      {cta}
      <nav className="space-y-1">
        <Group
          headingKey="home.documentsHub.nav.my.heading"
          items={MY_GROUP}
          activeSlug={activeSlug}
          onSelect={onSelect}
        />
        <Group
          headingKey="home.documentsHub.nav.org.heading"
          items={ORG_GROUP}
          activeSlug={activeSlug}
          onSelect={onSelect}
          defaultOpen={false}
        />
        <div className="pt-1 space-y-0.5">
          {FLAT_LEAVES.map((leaf) => (
            <NavRow
              key={leaf.slug}
              slug={leaf.slug}
              labelKey={leaf.labelKey}
              icon={leaf.icon}
              activeSlug={activeSlug}
              onSelect={onSelect}
            />
          ))}
        </div>
      </nav>
    </aside>
  );
}
