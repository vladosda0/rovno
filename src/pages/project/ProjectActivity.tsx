import { useParams } from "react-router-dom";
import { useEvents } from "@/hooks/use-mock-data";
import { getUserById } from "@/data/store";
import { EmptyState } from "@/components/EmptyState";
import { Activity } from "lucide-react";

export default function ProjectActivity() {
  const { id } = useParams<{ id: string }>();
  const events = useEvents(id!);

  if (events.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="Activity"
        description="No activity yet. Events will appear here as work progresses."
      />
    );
  }

  return (
    <div className="p-sp-3">
      <h2 className="text-h3 text-foreground mb-sp-2">Activity</h2>
      <div className="space-y-3">
        {events.map((evt) => {
          const actor = getUserById(evt.actor_id);
          const payload = evt.payload as Record<string, unknown>;
          const detail = (payload.title ?? payload.caption ?? payload.name ?? payload.text ?? "") as string;
          return (
            <div key={evt.id} className="flex items-start gap-3 glass rounded-card p-sp-2">
              <div className="flex-1 min-w-0">
                <p className="text-body-sm">
                  <span className="font-medium text-foreground">{actor?.name ?? "Unknown"}</span>
                  <span className="text-muted-foreground"> {evt.type.replace(/_/g, " ")}</span>
                </p>
                {detail && <p className="text-caption text-muted-foreground truncate">{detail}</p>}
              </div>
              <span className="text-caption text-muted-foreground whitespace-nowrap">
                {new Date(evt.timestamp).toLocaleDateString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
