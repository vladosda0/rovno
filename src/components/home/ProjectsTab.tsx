import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Plus, Sparkles, FolderPlus, Paperclip, Search, SortAsc,
  Folder,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { useCurrentUser, useProjects, useWorkspaceMode } from "@/hooks/use-mock-data";
import { PreviewCard } from "@/components/ai/PreviewCard";
import { ActionBar } from "@/components/ai/ActionBar";
import { SuggestionChips } from "@/components/ai/SuggestionChips";
import { generateProjectProposal } from "@/lib/ai-engine";
import { commitProposal } from "@/lib/commit-proposal";
import { toast } from "@/hooks/use-toast";
import type { AIProposal } from "@/types/ai";
import { createWorkspaceProject } from "@/data/workspace-source";
import { workspaceQueryKeys } from "@/hooks/use-workspace-source";
import type { Member, Project } from "@/types/entities";

function getStatusText(progress: number): string {
  if (progress >= 100) return "Done";
  if (progress > 0) return "In progress";
  return "Draft";
}
function getStatusColor(progress: number): string {
  if (progress >= 100) return "bg-success/15 text-success";
  if (progress > 0) return "bg-info/15 text-info";
  return "bg-muted text-muted-foreground";
}

const SUGGESTIONS = [
  "Renovate a 2-bedroom apartment",
  "Build out an office space",
  "Kitchen remodel",
  "Bathroom renovation",
];

type SortKey = "activity" | "progress" | "name";

interface FolderItem {
  id: string;
  name: string;
}

export function ProjectsTab() {
  const projects = useProjects();
  const currentUser = useCurrentUser();
  const workspaceMode = useWorkspaceMode();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const resolvedWorkspaceMode = workspaceMode.kind === "pending-supabase" ? { kind: "local" } : workspaceMode;

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
  const [manualType, setManualType] = useState<Project["type"]>("residential");
  const [manualProjectMode, setManualProjectMode] = useState<"build_myself" | "contractor">("contractor");

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
    const input = (text ?? description).trim();
    if (!input) return;
    setDescription(input);
    setProposal(generateProjectProposal(input));
  }

  function seedCreatedProjectCaches(createdProject: Project) {
    if (workspaceMode.kind !== "supabase") {
      return;
    }

    const projectsQueryKey = workspaceQueryKeys.projects(workspaceMode.profileId);
    const projectQueryKey = workspaceQueryKeys.project(workspaceMode.profileId, createdProject.id);
    const membersQueryKey = workspaceQueryKeys.projectMembers(workspaceMode.profileId, createdProject.id);
    const ownerMember: Member = {
      project_id: createdProject.id,
      user_id: currentUser.id,
      role: "owner",
      ai_access: "project_pool",
      credit_limit: 0,
      used_credits: 0,
    };

    queryClient.setQueryData<Project[]>(projectsQueryKey, (existing = []) => [
      createdProject,
      ...existing.filter((project) => project.id !== createdProject.id),
    ]);
    queryClient.setQueryData(projectQueryKey, createdProject);
    queryClient.setQueryData<Member[]>(membersQueryKey, [ownerMember]);
    void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
    void queryClient.invalidateQueries({ queryKey: membersQueryKey });
  }

  async function handleConfirm() {
    if (!proposal) return;
    const result = await commitProposal(proposal, {
      actor: {
        currentUser,
      },
      workspaceMode: resolvedWorkspaceMode,
      defaultProjectMode: "contractor",
    });
    if (result.success) {
      if (result.createdProject) {
        seedCreatedProjectCaches(result.createdProject);
      }
      toast({ title: "Project created", description: `${result.count} items set up.` });
      setProposal(null);
      setDescription("");
      if (result.projectId) navigate(`/project/${result.projectId}/dashboard`);
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  }

  function resetManualForm() {
    setManualTitle("");
    setManualType("residential");
    setManualProjectMode("contractor");
  }

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const title = manualTitle.trim() || "Untitled Project";
      return createWorkspaceProject(
        resolvedWorkspaceMode,
        {
          title,
          type: manualType,
          projectMode: manualProjectMode,
          ownerId: currentUser.id,
        },
      );
    },
    onSuccess: (createdProject) => {
      seedCreatedProjectCaches(createdProject);

      toast({ title: "Project created", description: createdProject.title });
      setManualOpen(false);
      resetManualForm();
      navigate(`/project/${createdProject.id}/dashboard`);
    },
    onError: (error) => {
      toast({
        title: "Project create failed",
        description: error instanceof Error ? error.message : "Unable to create project.",
        variant: "destructive",
      });
    },
  });

  function handleManualCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createProjectMutation.mutate();
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
      {/* AI Project Input */}
      <div className="glass space-y-3 rounded-card p-4 sm:space-y-4 sm:p-6">
        <div className="flex gap-2 items-start">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your project… e.g. 'Renovate a 60m² apartment with 2 bedrooms'"
            className="flex-1 min-h-[72px] resize-none bg-background/50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAiSubmit(); }
            }}
          />
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button onClick={() => handleAiSubmit()} disabled={!description.trim()} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Sparkles className="h-4 w-4 mr-1.5" /> Generate
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" title="Attach files">
              <Paperclip className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {!proposal && <SuggestionChips suggestions={SUGGESTIONS} onSelect={(s) => handleAiSubmit(s)} />}
        {proposal && (
          <div className="space-y-2 pt-1">
            <PreviewCard summary={proposal.summary} changes={proposal.changes} />
            <ActionBar onConfirm={handleConfirm} onCancel={() => setProposal(null)} />
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          <SelectTrigger className="w-[140px] h-9">
            <SortAsc className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="activity">Last activity</SelectItem>
            <SelectItem value="progress">Progress</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}>
          <FolderPlus className="h-4 w-4 mr-1.5" /> Create manually
        </Button>
      </div>

      <div className="flex gap-4 sm:gap-6">
        {/* Folders sidebar */}
        <div className="w-48 shrink-0 space-y-1">
          <button
            onClick={() => setSelectedFolder(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-body-sm transition-colors text-left ${!selectedFolder ? "bg-accent/10 text-accent font-medium" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Folder className="h-4 w-4" /> All Projects
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
              <Input placeholder="New folder" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} className="h-8 text-caption" />
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
              <Link to={`/project/${p.id}/dashboard`} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-body font-semibold text-foreground truncate">{p.title}</h3>
                  <span className={`text-caption font-medium px-2 py-0.5 rounded-pill shrink-0 ${getStatusColor(p.progress_pct)}`}>
                    {getStatusText(p.progress_pct)}
                  </span>
                </div>
                <Progress value={p.progress_pct} className="h-1.5" />
                <p className="text-caption text-muted-foreground">{p.progress_pct}% complete</p>
              </Link>
              {folders.length > 0 && (
                <Select value={projectFolders[p.id] || ""} onValueChange={(v) => moveToFolder(p.id, v)}>
                  <SelectTrigger className="h-7 text-caption w-auto">
                    <Folder className="h-3 w-3 mr-1" />
                    <SelectValue placeholder="Move to folder" />
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
            <p className="text-caption text-muted-foreground py-8 text-center col-span-full">No projects found.</p>
          )}
        </div>
      </div>

      {/* Manual Create Modal */}
      <AlertDialog
        open={manualOpen}
        onOpenChange={(open) => {
          if (createProjectMutation.isPending && !open) {
            return;
          }
          setManualOpen(open);
        }}
      >
        <AlertDialogContent className="glass-modal rounded-modal">
          <AlertDialogHeader>
            <AlertDialogTitle>Create project manually</AlertDialogTitle>
            <AlertDialogDescription>Enter a name and type for your new project.</AlertDialogDescription>
          </AlertDialogHeader>
          <form className="space-y-3 py-2" onSubmit={handleManualCreate}>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Project name</label>
              <Input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="e.g. Bathroom renovation" autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Type</label>
              <select value={manualType} onChange={(e) => setManualType(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="industrial">Industrial</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Project mode</label>
              <select
                value={manualProjectMode}
                onChange={(e) => setManualProjectMode(e.target.value as "build_myself" | "contractor")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="build_myself">I'm building/renovating for myself</option>
                <option value="contractor">I'm a contractor working for a client</option>
              </select>
            </div>
            <AlertDialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setManualOpen(false)}
                disabled={createProjectMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={createProjectMutation.isPending}
              >
                {createProjectMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
