import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Building2, ChevronLeft, FolderOpen, FileText } from "lucide-react";
import { useProjects } from "@/hooks/use-mock-data";
import { useProjectDocuments } from "@/hooks/use-documents-media-source";
import { useActiveOrg } from "@/hooks/use-orgs";
import { SectionChrome } from "@/components/home/documents-hub/SectionChrome";
import { TileGrid, FolderTile, FileTile } from "@/components/home/documents-hub/tiles";
import { EmptyState } from "@/components/home/documents-hub/EmptyState";
import { FilePreviewDialog, type PreviewableDocument } from "@/components/home/documents-hub/FilePreviewDialog";
import { useSectionFilters } from "@/hooks/use-section-filters";
import type { Project } from "@/types/entities";

function ProjectDocsView({ project, onBack }: { project: Project; onBack: () => void }) {
  const { t } = useTranslation();
  const docs = useProjectDocuments(project.id);
  const [previewDoc, setPreviewDoc] = useState<PreviewableDocument | null>(null);

  const filters = useSectionFilters({
    items: docs,
    sectionSlug: `org-projects-${project.id}`,
    searchKeys: [(d) => d.title, (d) => d.description ?? ""],
    getCreatedAt: (d) => d.created_at,
  });

  return (
    <>
      <SectionChrome
        title={project.title}
        search={filters.search}
        onSearchChange={filters.setSearch}
        preset={filters.preset}
        onPresetChange={filters.setPreset}
        dateRange={filters.dateRange}
        onDateRangeChange={filters.setDateRange}
        pageSize={filters.pageSize}
        onPageSizeChange={filters.setPageSize}
        page={filters.page}
        onPageChange={filters.setPage}
        totalAfterFilter={filters.totalAfterFilter}
        isFilterActive={filters.isFilterActive}
        onReset={filters.reset}
        systemHidden={filters.systemHidden}
        headerExtra={
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="h-3.5 w-3.5 mr-1" />
            {t("home.documentsHub.folders.backToAll")}
          </Button>
        }
      >
        {filters.paged.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t("home.documentsHub.leaves.orgProjects.projectEmptyTitle")}
            body={t("home.documentsHub.leaves.orgProjects.projectEmpty")}
          />
        ) : (
          <TileGrid>
            {filters.paged.map((doc) => (
              <FileTile
                key={doc.id}
                title={doc.title}
                description={doc.description ?? null}
                icon={FileText}
                dateAdded={doc.created_at ? doc.created_at.slice(0, 10) : null}
                onClick={() =>
                  setPreviewDoc({
                    id: doc.id,
                    title: doc.title,
                    type: doc.type,
                    origin: doc.origin,
                    description: doc.description ?? null,
                    createdAt: doc.created_at,
                    scope: "org",
                    mimeType: doc.file_meta?.mime,
                  })
                }
                viewLabel={t("home.documentsHub.preview.openInNewTab")}
                downloadLabel={t("home.documentsHub.preview.download")}
              />
            ))}
          </TileGrid>
        )}
      </SectionChrome>

      <FilePreviewDialog
        open={previewDoc !== null}
        onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}
        doc={previewDoc}
      />
    </>
  );
}

function ProjectsListView({ projects, onSelect }: { projects: Project[]; onSelect: (project: Project) => void }) {
  const { t } = useTranslation();
  const filters = useSectionFilters<Project>({
    items: projects,
    sectionSlug: "org-projects",
    searchKeys: [(p) => p.title, (p) => p.address ?? ""],
  });

  return (
    <SectionChrome
      title={t("home.documentsHub.leaves.orgProjects.title")}
      subtitle={t("home.documentsHub.leaves.orgProjects.subtitle")}
      search={filters.search}
      onSearchChange={filters.setSearch}
      preset={filters.preset}
      onPresetChange={filters.setPreset}
      dateRange={filters.dateRange}
      onDateRangeChange={filters.setDateRange}
      pageSize={filters.pageSize}
      onPageSizeChange={filters.setPageSize}
      page={filters.page}
      onPageChange={filters.setPage}
      totalAfterFilter={filters.totalAfterFilter}
      isFilterActive={filters.isFilterActive}
      onReset={filters.reset}
      systemHidden={filters.systemHidden}
    >
      {filters.paged.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={t("home.documentsHub.leaves.orgProjects.emptyTitle")}
          body={t("home.documentsHub.leaves.orgProjects.emptyBody")}
        />
      ) : (
        <TileGrid>
          {filters.paged.map((project) => (
            <ProjectFolderTile key={project.id} project={project} onClick={() => onSelect(project)} />
          ))}
        </TileGrid>
      )}
    </SectionChrome>
  );
}

function ProjectFolderTile({ project, onClick }: { project: Project; onClick: () => void }) {
  const { t } = useTranslation();
  const docs = useProjectDocuments(project.id);
  return (
    <FolderTile
      title={project.title}
      count={docs.length}
      description={project.address ?? project.ai_description ?? null}
      icon={FolderOpen}
      onClick={onClick}
      filesLabel={t("home.documentsHub.folders.filesCount")}
      menu={null}
    />
  );
}

export function OrgProjectsView() {
  const { t } = useTranslation();
  const activeOrg = useActiveOrg();
  const projects = useProjects();
  const [drilledProjectId, setDrilledProjectId] = useState<string | null>(null);
  const drilledProject = useMemo(
    () => projects.find((p) => p.id === drilledProjectId) ?? null,
    [projects, drilledProjectId],
  );

  if (!activeOrg) {
    return (
      <EmptyState
        icon={Building2}
        title={t("home.documentsHub.empty.noOrg.title")}
        body={t("home.documentsHub.empty.noOrg.description")}
      />
    );
  }

  if (drilledProject) {
    return <ProjectDocsView project={drilledProject} onBack={() => setDrilledProjectId(null)} />;
  }

  return <ProjectsListView projects={projects} onSelect={(p) => setDrilledProjectId(p.id)} />;
}
