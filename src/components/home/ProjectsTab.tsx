import { useState, type MouseEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Plus, Search, SortAsc,
  Folder, Trash2,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useProjects, useWorkspaceMode } from "@/hooks/use-mock-data";
import { getPlanningSource } from "@/data/planning-source";
import { getWorkspaceSource, resolveWorkspaceMode } from "@/data/workspace-source";
import { planningQueryKeys } from "@/hooks/use-planning-source";
import { toast } from "@/hooks/use-toast";
import { workspaceQueryKeys } from "@/hooks/use-workspace-source";

function getStatusKey(progress: number): string {
  if (progress >= 100) return "status.done";
  if (progress > 0) return "status.inProgress";
  return "status.draft";
}
function getStatusColor(progress: number): string {
  if (progress >= 100) return "bg-success/15 text-success";
  if (progress > 0) return "bg-info/15 text-info";
  return "bg-muted text-muted-foreground";
}

type SortKey = "activity" | "progress" | "name";

interface FolderItem {
  id: string;
  name: string;
}

export function ProjectsTab() {
  const { t } = useTranslation();
  const projects = useProjects();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceMode = useWorkspaceMode();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("activity");
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [projectFolders, setProjectFolders] = useState<Record<string, string>>({});
  const [newFolderName, setNewFolderName] = useState("");

  // Manual project creation (inline on tab)
  const [manualTitle, setManualTitle] = useState("");
  const [manualType, setManualType] = useState("residential");
  const [manualProjectMode, setManualProjectMode] = useState<"build_myself" | "contractor">("contractor");
  const [manualCreating, setManualCreating] = useState(false);

  // Deletion
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  const filteredProjects = projects
    .filter((p) => {
      if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedFolder) return projectFolders[p.id] === selectedFolder;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "progress") return b.progress_pct - a.progress_pct;
      if (sortBy === "name") return a.title.localeCompare(b.title);
      return 0; // activity — keep original order
    });

  async function handleManualCreate(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (manualCreating) return;

    const title = manualTitle.trim();
    if (!title) {
      toast({
        title: t("projectsTab.nameRequiredTitle"),
        description: t("projectsTab.nameRequiredDescription"),
        variant: "destructive",
      });
      return;
    }
    setManualCreating(true);

    try {
      const resolvedWorkspaceMode = workspaceMode.kind === "pending-supabase"
        ? await resolveWorkspaceMode()
        : workspaceMode;
      const workspaceSource = await getWorkspaceSource(resolvedWorkspaceMode);
      const planningSource = await getPlanningSource(resolvedWorkspaceMode);
      const createdProject = await workspaceSource.createProject({
        title,
        type: manualType,
        projectMode: manualProjectMode,
      });

      await planningSource.createProjectStage({
        projectId: createdProject.id,
        title: t("projectsTab.stage1"),
        description: "",
        order: 1,
        status: "open",
      });

      if (resolvedWorkspaceMode.kind === "supabase") {
        await queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.projects(resolvedWorkspaceMode.profileId),
        });
        await queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.project(resolvedWorkspaceMode.profileId, createdProject.id),
        });
        await queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.projectMembers(resolvedWorkspaceMode.profileId, createdProject.id),
        });
        await queryClient.invalidateQueries({
          queryKey: planningQueryKeys.projectStages(resolvedWorkspaceMode.profileId, createdProject.id),
        });
      }

      toast({ title: t("projectsTab.projectCreated"), description: title });
      setManualTitle("");
      setManualType("residential");
      setManualProjectMode("contractor");
      navigate(`/project/${createdProject.id}/estimate`);
    } catch (error) {
      toast({
        title: t("projectsTab.projectCreationFailed"),
        description: error instanceof Error ? error.message : t("projectsTab.projectCreationFailedGeneric"),
        variant: "destructive",
      });
    } finally {
      setManualCreating(false);
    }
  }

  function requestDeleteProject(event: MouseEvent<HTMLButtonElement>, project: { id: string; title: string }) {
    event.preventDefault();
    event.stopPropagation();
    setDeleteTarget(project);
    setDeleteConfirmInput("");
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || deleting) return;
    if (deleteConfirmInput.trim() !== deleteTarget.title.trim()) return;

    setDeleting(true);
    try {
      const resolvedWorkspaceMode = workspaceMode.kind === "pending-supabase"
        ? await resolveWorkspaceMode()
        : workspaceMode;
      const workspaceSource = await getWorkspaceSource(resolvedWorkspaceMode);
      await workspaceSource.deleteProject(deleteTarget.id);

      if (resolvedWorkspaceMode.kind === "supabase") {
        await queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.projects(resolvedWorkspaceMode.profileId),
        });
      }

      toast({ title: t("projectsTab.deleteSuccess"), description: deleteTarget.title });
      setProjectFolders((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });
      setDeleteTarget(null);
      setDeleteConfirmInput("");
    } catch (error) {
      toast({
        title: t("projectsTab.deleteFailed"),
        description: error instanceof Error ? error.message : t("projectsTab.deleteFailedGeneric"),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setFolders((prev) => [...prev, { id: `folder-${Date.now()}`, name }]);
    setNewFolderName("");
  }

  function moveToFolder(projectId: string, folderId: string) {
    setProjectFolders((prev) => ({ ...prev, [projectId]: folderId }));
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Create project — inline questionnaire (replaces the former AI description block) */}
      <div className="glass space-y-4 rounded-card p-4 sm:space-y-5 sm:p-6" id="projects-create-form">
        <div>
          <h2 className="text-body font-semibold text-foreground">{t("projectsTab.manualTitle")}</h2>
          <p className="text-caption text-muted-foreground mt-1">{t("projectsTab.manualDescription")}</p>
        </div>
        <div className="space-y-3 max-w-2xl">
          <div className="space-y-1.5">
            <label className="text-body-sm font-medium text-foreground" htmlFor="manual-project-name">
              {t("projectsTab.nameLabel")}
              <span className="text-destructive" aria-hidden> *</span>
            </label>
            <Input
              id="manual-project-name"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder={t("projectsTab.namePlaceholder")}
              autoFocus
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-body-sm font-medium text-foreground" id="manual-project-type-label">
                {t("projectsTab.typeLabel")}
              </span>
              <Select value={manualType} onValueChange={setManualType}>
                <SelectTrigger
                  className="h-10 w-full"
                  id="manual-project-type"
                  aria-labelledby="manual-project-type-label"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="residential">{t("projectsTab.type.residential")}</SelectItem>
                  <SelectItem value="commercial">{t("projectsTab.type.commercial")}</SelectItem>
                  <SelectItem value="industrial">{t("projectsTab.type.industrial")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <span className="text-body-sm font-medium text-foreground" id="manual-project-mode-label">
                {t("projectsTab.modeLabel")}
              </span>
              <Select
                value={manualProjectMode}
                onValueChange={(v) => setManualProjectMode(v as "build_myself" | "contractor")}
              >
                <SelectTrigger
                  className="h-10 w-full"
                  id="manual-project-mode"
                  aria-labelledby="manual-project-mode-label"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="build_myself">{t("projectsTab.mode.selfBuild")}</SelectItem>
                  <SelectItem value="contractor">{t("projectsTab.mode.contractor")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="max-w-2xl">
          <Button
            type="button"
            className="w-full h-12 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleManualCreate}
            disabled={manualCreating || !manualTitle.trim()}
          >
            {manualCreating ? t("projectsTab.creating") : t("overview.createProject")}
          </Button>
        </div>
      </div>

      {/* Toolbar: search, sort, folder filters, new folder — single horizontal band */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="relative min-w-0 w-full max-w-56 sm:shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input placeholder={t("projectsTab.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          <SelectTrigger className="w-[min(100%,9rem)] sm:w-[140px] h-9 shrink-0">
            <SortAsc className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="activity">{t("projectsTab.sort.activity")}</SelectItem>
            <SelectItem value="progress">{t("projectsTab.sort.progress")}</SelectItem>
            <SelectItem value="name">{t("projectsTab.sort.name")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="hidden sm:block h-6 w-px bg-border shrink-0" aria-hidden />
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => setSelectedFolder(null)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 h-9 text-body-sm transition-colors shrink-0 ${!selectedFolder ? "bg-accent/10 text-accent font-medium" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Folder className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[9rem] sm:max-w-[11rem]">{t("projectsTab.allProjects")}</span>
          </button>
          {folders.map((f) => (
            <button
              type="button"
              key={f.id}
              onClick={() => setSelectedFolder(f.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 h-9 text-body-sm transition-colors shrink-0 max-w-[10rem] ${selectedFolder === f.id ? "bg-accent/10 text-accent font-medium" : "text-muted-foreground hover:bg-muted"}`}
            >
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 w-full min-[500px]:w-auto min-[500px]:max-w-xs">
          <Input
            placeholder={t("projectsTab.newFolder")}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="h-9 text-caption min-w-0 flex-1 sm:flex-initial sm:w-40"
          />
          <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={handleCreateFolder} disabled={!newFolderName.trim()} title={t("projectsTab.newFolder")}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Projects grid — full width, three columns on large screens */}
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {filteredProjects.map((p) => (
            <div key={p.id} className="glass group relative space-y-2 rounded-card p-4 sm:p-6">
              <button
                type="button"
                onClick={(event) => requestDeleteProject(event, { id: p.id, title: p.title })}
                className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={t("projectsTab.deleteProjectAria", { title: p.title })}
                title={t("projectsTab.deleteProject")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <Link to={`/project/${p.id}/dashboard`} className="space-y-2">
                <div className="flex items-start justify-between gap-2 pr-8">
                  <h3 className="text-body font-semibold text-foreground truncate">{p.title}</h3>
                  <span className={`text-caption font-medium px-2 py-0.5 rounded-pill shrink-0 ${getStatusColor(p.progress_pct)}`}>
                    {t(getStatusKey(p.progress_pct))}
                  </span>
                </div>
                <Progress value={p.progress_pct} className="h-1.5" />
                <p className="text-caption text-muted-foreground">{t("projectsTab.percentComplete", { percent: p.progress_pct })}</p>
              </Link>
              {folders.length > 0 && (
                <Select value={projectFolders[p.id] || ""} onValueChange={(v) => moveToFolder(p.id, v)}>
                  <SelectTrigger className="h-7 text-caption w-auto">
                    <Folder className="h-3 w-3 mr-1" />
                    <SelectValue placeholder={t("projectsTab.moveToFolder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {folders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
          {filteredProjects.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-sp-1 py-sp-4 text-center">
              <p className="text-body text-muted-foreground">{t("projectsTab.noProjects")}</p>
              <p className="text-caption text-muted-foreground max-w-sm">{t("projectsTab.emptyInlineHint")}</p>
            </div>
          )}
      </div>

      {/* Delete Confirmation Modal */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirmInput("");
          }
        }}
      >
        <AlertDialogContent className="glass-modal rounded-modal">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projectsTab.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("projectsTab.deleteDescription", { title: deleteTarget?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-body-sm font-medium text-foreground">
              {t("projectsTab.deleteConfirmLabel", { title: deleteTarget?.title ?? "" })}
            </label>
            <Input
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder={deleteTarget?.title ?? ""}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-caption text-muted-foreground">{t("projectsTab.deleteIrreversible")}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
              disabled={
                deleting ||
                !deleteTarget ||
                deleteConfirmInput.trim() !== (deleteTarget?.title.trim() ?? "")
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t("projectsTab.deleting") : t("projectsTab.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
