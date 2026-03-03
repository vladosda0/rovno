import { useNavigate } from "react-router-dom";
import { getUserById } from "@/data/store";
import type { Event } from "@/types/entities";
import { isAIEvent } from "@/components/ai/event-utils";
import {
  ClipboardList, Calculator, ShoppingCart, FileText, Image,
  Users, MessageSquare, GitBranch, CheckCircle2, Plus, Activity, XCircle, Bot,
} from "lucide-react";

const typeIcons: Record<string, typeof Activity> = {
  task_created: Plus,
  task_updated: ClipboardList,
  task_completed: CheckCircle2,
  task_moved: GitBranch,
  estimate_created: Calculator,
  estimate_approved: CheckCircle2,
  estimate_archived: Calculator,
  "estimate.version_submitted": Calculator,
  "estimate.version_approved": CheckCircle2,
  procurement_created: ShoppingCart,
  procurement_updated: ShoppingCart,
  document_created: FileText,
  document_uploaded: FileText,
  document_version_created: FileText,
  document_archived: FileText,
  document_acknowledged: FileText,
  photo_uploaded: Image,
  photo_deleted: Image,
  member_added: Users,
  comment_added: MessageSquare,
  stage_created: Plus,
  stage_completed: CheckCircle2,
  stage_deleted: Activity,
  proposal_confirmed: CheckCircle2,
  proposal_cancelled: XCircle,
  project_created: Plus,
  contractor_proposal_submitted: Calculator,
  contractor_proposal_accepted: CheckCircle2,
  contractor_proposal_rejected: Activity,
};

function getEventRoute(evt: Event): string | null {
  const base = `/project/${evt.project_id}`;
  switch (evt.object_type) {
    case "task": return `${base}/tasks`;
    case "estimate_version": return `${base}/estimate`;
    case "procurement_item": return `${base}/procurement`;
    case "document": return `${base}/documents`;
    case "media": return `${base}/gallery`;
    default: return null;
  }
}

interface EventFeedItemProps {
  event: Event;
  compact?: boolean;
  highlighted?: boolean;
}

export function EventFeedItem({ event, compact, highlighted }: EventFeedItemProps) {
  const navigate = useNavigate();
  const actor = getUserById(event.actor_id);
  const payload = event.payload as Record<string, unknown>;
  const detail = (payload.title ?? payload.caption ?? payload.text ?? payload.name ?? "") as string;
  const route = getEventRoute(event);
  const isAiOrigin = isAIEvent(event);
  const Icon = isAiOrigin ? Bot : (typeIcons[event.type] ?? Activity);
  const actorLabel = isAiOrigin ? "AI" : (actor?.name ?? "System");

  const handleClick = () => {
    if (route) navigate(route);
  };

  return (
    <button
      onClick={handleClick}
      disabled={!route}
      className={`flex items-start gap-2 w-full text-left rounded-lg px-2 py-1.5 transition-colors ${
        route ? "hover:bg-accent/10 cursor-pointer" : "cursor-default"
      } ${compact ? "py-1" : ""} ${highlighted ? "bg-destructive/15" : ""}`}
      style={{ transitionDuration: "2500ms" }}
    >
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md mt-0.5 ${
        isAiOrigin ? "bg-accent/10" : "bg-muted"
      }`}>
        <Icon className={`h-3.5 w-3.5 ${isAiOrigin ? "text-accent" : "text-muted-foreground"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-caption leading-tight">
          <span className="font-medium text-foreground">{actorLabel}</span>
          <span className="text-muted-foreground"> {event.type.replace(/[._]/g, " ")}</span>
        </p>
        {detail && <p className="text-caption text-muted-foreground truncate">{detail}</p>}
      </div>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5 shrink-0">
        {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    </button>
  );
}
