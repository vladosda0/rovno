import { useState, type MouseEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Plus, Sparkles, FolderPlus, Paperclip, Search, SortAsc,
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
import { PreviewCard } from "@/components/ai/PreviewCard";
import { ActionBar } from "@/components/ai/ActionBar";
import { SuggestionChips } from "@/components/ai/SuggestionChips";
import { getPlanningSource } from "@/data/planning-source";
import { getWorkspaceSource, resolveWorkspaceMode } from "@/data/workspace-source";
import { getAuthRole } from "@/lib/auth-state";
import { generateProjectProposal } from "@/lib/ai-engine";
import { commitProposal } from "@/lib/commit-proposal";
import { can } from "@/lib/permission-matrix";
import type { AIAccess, MemberRole } from "@/types/entities";
import { planningQueryKeys } from "@/hooks/use-planning-source";
import { toast } from "@/hooks/use-toast";
import { workspaceQueryKeys } from "@/hooks/use-workspace-source";
import type { AIProposal } from "@/types/ai";

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

const SUGGESTION_KEYS = [
  "projectsTab.suggestion.renovateApartment",
  "projectsTab.suggestion.buildOffice",
  "projectsTab.suggestion.kitchenRemodel",
  "projectsTab.suggestion.bathroomRenovation",
] as const;

type SortKey = "activity" | "progress" | "name";

/** AI project sparkles: local/demo store only; Supabase must use real project APIs. */
function homeAiProjectSparklesAllowed(workspaceMode: ReturnType<typeof useWorkspaceMode>): boolean {
  if (workspaceMode.kind !== "demo" && workspaceMode.kind !== "local") return false;
  const role = getAuthRole();
  if (role === "guest") return false;
  const memberRole = role as MemberRole;
  const aiAccess: AIAccess =
    memberRole === "contractor" ? "consult_only" : memberRole === "viewer" ? "none" : "project_pool";
  return can(memberRole, "ai.generate", aiAccess);
}

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
  const aiProjectSparklesEnabled = homeAiProjectSparklesAllowed(workspaceMode);

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("activity");
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [projectFolders, setProjectFolders] = useState<Record<string, string>>({});
  const [newFolderName, setNewFolderName] = useState("");

  // AI project creation
  const [description, setDescription] = useState("");
  const [proposal, setProposal] = useState<AIProposal | null>(null);

  // Manual creation
  const [manualOpen, setManualOpen] = useState(false);
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

  function handleAiSubmit(text?: string) {
    if (!aiProjectSparklesEnabled) {
      toast({
        title: t("projectsTab.aiUnavailable.title"),
        description:
          workspaceMode.kind === "supabase" || workspaceMode.kind === "pending-supabase"
            ? t("projectsTab.aiUnavailable.supabase")
            : t("projectsTab.aiUnavailable.other"),
        variant: "destructive",
      });
      return;
    }
    const input = (text ?? description).trim();
    if (!input) return;
    setDescription(input);
    setProposal(generateProjectProposal(input));
  }

  function handleConfirm() {
    if (!proposal) return;
    if (!aiProjectSparklesEnabled) {
      toast({
        title: t("projectsTab.aiUnavailable.title"),
        description: t("projectsTab.aiUnavailable.confirmDisabled"),
        variant: "destructive",
      });
      return;
    }
    const result = commitProposal(proposal, { eventSource: "user", emitProposalEvent: true });
    if (result.success) {
      toast({ title: t("projectsTab.projectCreated"), description: t("projectsTab.projectCreatedItems", { count: result.count }) });
      setProposal(null);
      setDescription("");
      if (result.projectId) navigate(`/project/${result.projectId}/estimate`);
    } else {
      toast({ title: t("common.error"), description: result.error, variant: "destructive" });
    }
  }

  async function handleManualCreate(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (manualCreating) return;

    const title = manualTitle.trim() || t("projectsTab.untitledProject");
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
      setManualOpen(false);
      setManualTitle("");
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
      {/* AI Project Input — local/demo only; no authority bypass vs Supabase */}
      <div className="glass space-y-3 rounded-card p-4 sm:space-y-4 sm:p-6">
        {!aiProjectSparklesEnabled && (
          <p className="text-caption text-muted-foreground">
            {workspaceMode.kind === "supabase" || workspaceMode.kind === "pending-supabase"
              ? t("projectsTab.aiHint.supabase")
              : t("projectsTab.aiHint.other")}
          </p>
        )}
        <div className="flex gap-2 items-start">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("projectsTab.aiPlaceholder")}
            className="flex-1 min-h-[72px] resize-none bg-background/50"
            disabled={!aiProjectSparklesEnabled}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAiSubmit(); }
            }}
          />
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button
              onClick={() => handleAiSubmit()}
              disabled={!aiProjectSparklesEnabled || !description.trim()}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Sparkles className="h-4 w-4 mr-1.5" /> {t("projectsTab.generate")}
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" title={t("projectsTab.attachFiles")}>
              <Paperclip className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {!proposal && aiProjectSparklesEnabled && (
          <SuggestionChips suggestions={SUGGESTION_KEYS.map((key) => t(key))} onSelect={(s) => handleAiSubmit(s)} />
        )}
        {proposal && (
          <div className="space-y-2 pt-1">
            <PreviewCard summary={proposal.summary} changes={proposal.changes} />
            <ActionBar
              onConfirm={handleConfirm}
              onCancel={() => setProposal(null)}
              disabled={!aiProjectSparklesEnabled}
            />
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("projectsTab.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          <SelectTrigger className="w-[140px] h-9">
            <SortAsc className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="activity">{t("projectsTab.sort.activity")}</SelectItem>
            <SelectItem value="progress">{t("projectsTab.sort.progress")}</SelectItem>
            <SelectItem value="name">{t("projectsTab.sort.name")}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}>
          <FolderPlus className="h-4 w-4 mr-1.5" /> {t("projectsTab.createManually")}
        </Button>
      </div>

      <div className="flex gap-4 sm:gap-6">
        {/* Folders sidebar */}
        <div className="w-48 shrink-0 space-y-1">
          <button
            onClick={() => setSelectedFolder(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-body-sm transition-colors text-left ${!selectedFolder ? "bg-accent/10 text-accent font-medium" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Folder className="h-4 w-4" /> {t("projectsTab.allProjects")}
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFolder(f.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-body-sm transition-colors text-left ${selectedFolder === f.id ? "bg-accent/10 text-accent font-medium" : "text-muted-foreground hover:bg-muted"}`}
            >
              <Folder className="h-4 w-4" /> {f.name}
            </button>
          ))}
          <div className="pt-2">
            <div className="flex gap-1">
              <Input placeholder={t("projectsTab.newFolder")} value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} className="h-8 text-caption" />
              <Button size="sm" variant="ghost" className="h-8 px-2 shrink-0" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Projects grid */}
        <div className="grid flex-1 grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
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
            <div className="col-span-full flex flex-col items-center gap-sp-2 py-sp-4 text-center">
              <p className="text-body text-muted-foreground">{t("projectsTab.noProjects")}</p>
              <p className="text-caption text-muted-foreground">{t("projectsTab.emptySubtitle")}</p>
              <Button
                size="lg"
                onClick={() => setManualOpen(true)}
                className="bg-accent text-accent-foreground hover:bg-accent/90 mt-sp-1"
              >
                <Plus className="h-4 w-4 mr-1.5" /> {t("projectsTab.createManually")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Manual Create Modal */}
      <AlertDialog open={manualOpen} onOpenChange={setManualOpen}>
        <AlertDialogContent className="glass-modal rounded-modal">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projectsTab.manualTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("projectsTab.manualDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">{t("projectsTab.nameLabel")}</label>
              <Input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder={t("projectsTab.namePlaceholder")} autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">{t("projectsTab.typeLabel")}</label>
              <select value={manualType} onChange={(e) => setManualType(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="residential">{t("projectsTab.type.residential")}</option>
                <option value="commercial">{t("projectsTab.type.commercial")}</option>
                <option value="industrial">{t("projectsTab.type.industrial")}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">{t("projectsTab.modeLabel")}</label>
              <select
                value={manualProjectMode}
                onChange={(e) => setManualProjectMode(e.target.value as "build_myself" | "contractor")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="build_myself">{t("projectsTab.mode.selfBuild")}</option>
                <option value="contractor">{t("projectsTab.mode.contractor")}</option>
              </select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleManualCreate}
              disabled={manualCreating}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {manualCreating ? t("projectsTab.creating") : t("common.create")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
