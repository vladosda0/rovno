import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Plus, Sparkles, Paperclip, FolderPlus } from "lucide-react";
import { useProjects, useCurrentUser } from "@/hooks/use-mock-data";
import { PreviewCard } from "@/components/ai/PreviewCard";
import { ActionBar } from "@/components/ai/ActionBar";
import { SuggestionChips } from "@/components/ai/SuggestionChips";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { generateProjectProposal } from "@/lib/ai-engine";
import { commitProposal } from "@/lib/commit-proposal";
import { toast } from "@/hooks/use-toast";
import type { AIProposal } from "@/types/ai";
import { addProject, addStage, addMember, addEvent, getCurrentUser } from "@/data/store";

/* ---------- status helpers ---------- */
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

/* ---------- suggestion chips ---------- */
const SUGGESTIONS = [
  "Renovate a 2-bedroom apartment",
  "Build out an office space",
  "Kitchen remodel",
  "Bathroom renovation",
];

export default function Home() {
  const projects = useProjects();
  const navigate = useNavigate();

  /* AI project creation state */
  const [description, setDescription] = useState("");
  const [proposal, setProposal] = useState<AIProposal | null>(null);

  /* Manual creation modal */
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualType, setManualType] = useState("residential");

  /* --- AI flow --- */
  function handleAiSubmit(text?: string) {
    const input = (text ?? description).trim();
    if (!input) return;
    setDescription(input);
    const p = generateProjectProposal(input);
    setProposal(p);
  }

  function handleConfirm() {
    if (!proposal) return;
    const result = commitProposal(proposal);
    if (result.success) {
      toast({ title: "Project created", description: `${result.count} items set up.` });
      setProposal(null);
      setDescription("");
      if (result.projectId) {
        navigate(`/project/${result.projectId}/dashboard`);
      }
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  }

  function handleCancel() {
    setProposal(null);
  }

  /* --- Manual flow --- */
  function handleManualCreate() {
    const title = manualTitle.trim() || "Untitled Project";
    const id = `project-manual-${Date.now()}`;
    const stageId = `stage-manual-${Date.now()}-0`;
    const user = getCurrentUser();

    addProject({
      id,
      owner_id: user.id,
      title,
      type: manualType,
      automation_level: "manual",
      current_stage_id: stageId,
      progress_pct: 0,
    });
    addMember({
      project_id: id,
      user_id: user.id,
      role: "owner",
      ai_access: "project_pool",
      credit_limit: 500,
      used_credits: 0,
    });
    addStage({
      id: stageId,
      project_id: id,
      title: "Stage 1",
      description: "",
      order: 1,
      status: "open",
    });
    addEvent({
      id: `evt-manual-${Date.now()}`,
      project_id: id,
      actor_id: user.id,
      type: "project_created",
      object_type: "project",
      object_id: id,
      timestamp: new Date().toISOString(),
      payload: { title },
    });
    toast({ title: "Project created", description: title });
    setManualOpen(false);
    setManualTitle("");
    navigate(`/project/${id}/dashboard`);
  }

  return (
    <div className="p-sp-3 max-w-5xl mx-auto space-y-sp-3">
      {/* --- HomeHeader --- */}
      <div className="glass-elevated rounded-panel p-sp-3">
        <h1 className="text-h2 text-foreground">Your Projects</h1>
        <p className="text-body-sm text-muted-foreground mt-1">
          Describe a project and let AI set it up, or create one manually.
        </p>
      </div>

      {/* --- AiProjectInput --- */}
      <div className="glass rounded-card p-sp-2 space-y-sp-1">
        <div className="flex gap-2 items-start">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your project… e.g. 'Renovate a 60m² apartment with 2 bedrooms'"
            className="flex-1 min-h-[72px] resize-none bg-background/50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAiSubmit();
              }
            }}
          />
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button
              onClick={() => handleAiSubmit()}
              disabled={!description.trim()}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              Generate
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {!proposal && (
          <SuggestionChips suggestions={SUGGESTIONS} onSelect={(s) => handleAiSubmit(s)} />
        )}

        {/* Proposal preview */}
        {proposal && (
          <div className="space-y-2 pt-1">
            <PreviewCard summary={proposal.summary} changes={proposal.changes} />
            <ActionBar
              onConfirm={handleConfirm}
              onCancel={handleCancel}
            />
          </div>
        )}
      </div>

      {/* --- ProjectCardGrid --- */}
      <div className="flex items-center justify-between">
        <h2 className="text-body font-semibold text-foreground">All projects</h2>
        <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}>
          <FolderPlus className="h-4 w-4 mr-1.5" />
          Create manually
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-sp-2">
        {projects.map((p) => (
          <Link
            key={p.id}
            to={`/project/${p.id}/dashboard`}
            className="glass rounded-card p-sp-3 hover:scale-[1.01] transition-transform duration-150 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-body font-semibold text-foreground truncate">{p.title}</h3>
              <span className={`text-caption font-medium px-2 py-0.5 rounded-pill shrink-0 ${getStatusColor(p.progress_pct)}`}>
                {getStatusText(p.progress_pct)}
              </span>
            </div>
            <Progress value={p.progress_pct} className="h-1.5" />
            <p className="text-caption text-muted-foreground">{p.progress_pct}% complete</p>
          </Link>
        ))}
      </div>

      {/* --- ManualCreateModal --- */}
      <AlertDialog open={manualOpen} onOpenChange={setManualOpen}>
        <AlertDialogContent className="glass-modal rounded-modal">
          <AlertDialogHeader>
            <AlertDialogTitle>Create project manually</AlertDialogTitle>
            <AlertDialogDescription>Enter a name and type for your new project.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Project name</label>
              <Input
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="e.g. Bathroom renovation"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Type</label>
              <select
                value={manualType}
                onChange={(e) => setManualType(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="industrial">Industrial</option>
              </select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleManualCreate} className="bg-accent text-accent-foreground hover:bg-accent/90">
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
