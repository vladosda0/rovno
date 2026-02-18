import type {
  User, Project, Member, Stage, Task, Estimate, ProcurementItem,
  Document, Media, Event, Notification,
} from "@/types/entities";
import {
  seedUser, seedProjects, seedMembers, seedStages, seedTasks,
  seedEstimates, seedProcurementItems, seedDocuments, seedMedia,
  seedEvents, seedNotifications, allUsers,
} from "@/data/seed";

// --- In-memory state ---
let user: User = { ...seedUser };
let projects: Project[] = [...seedProjects];
let members: Member[] = [...seedMembers];
let stages: Stage[] = [...seedStages];
let tasks: Task[] = [...seedTasks];
let estimates: Estimate[] = [...seedEstimates];
let procurementItems: ProcurementItem[] = [...seedProcurementItems];
let documents: Document[] = [...seedDocuments];
let media: Media[] = [...seedMedia];
let events: Event[] = [...seedEvents];
let notifications: Notification[] = [...seedNotifications];

// --- Pub/Sub ---
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((l) => l());
}

// --- Read accessors ---
export function getCurrentUser(): User {
  return user;
}

export function getUserById(id: string): User | undefined {
  return allUsers.find((u) => u.id === id);
}

export function getProjects(): Project[] {
  return projects;
}

export function getProject(id: string): Project | undefined {
  return projects.find((p) => p.id === id);
}

export function getMembers(projectId: string): Member[] {
  return members.filter((m) => m.project_id === projectId);
}

export function getStages(projectId: string): Stage[] {
  return stages.filter((s) => s.project_id === projectId).sort((a, b) => a.order - b.order);
}

export function getTasks(projectId: string, filters?: { stage_id?: string; status?: string }): Task[] {
  let result = tasks.filter((t) => t.project_id === projectId);
  if (filters?.stage_id) result = result.filter((t) => t.stage_id === filters.stage_id);
  if (filters?.status) result = result.filter((t) => t.status === filters.status);
  return result;
}

export function getEstimate(projectId: string): Estimate | undefined {
  return estimates.find((e) => e.project_id === projectId);
}

export function getProcurementItems(projectId: string): ProcurementItem[] {
  return procurementItems.filter((p) => p.project_id === projectId);
}

export function getDocuments(projectId: string): Document[] {
  return documents.filter((d) => d.project_id === projectId);
}

export function getMedia(projectId: string): Media[] {
  return media.filter((m) => m.project_id === projectId);
}

export function getEvents(projectId: string): Event[] {
  return events
    .filter((e) => e.project_id === projectId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function getNotifications(userId: string): Notification[] {
  return notifications.filter((n) => n.user_id === userId);
}

export function getUnreadNotificationCount(userId: string): number {
  return notifications.filter((n) => n.user_id === userId && !n.is_read).length;
}

// --- Write functions ---
export function addEvent(event: Event) {
  events = [...events, event];
  // Generate notifications for project members (except actor)
  const projectMembers = getMembers(event.project_id);
  const newNotifs: Notification[] = projectMembers
    .filter((m) => m.user_id !== event.actor_id)
    .map((m, i) => ({
      id: `notif-auto-${Date.now()}-${i}`,
      user_id: m.user_id,
      project_id: event.project_id,
      event_id: event.id,
      is_read: false,
    }));
  notifications = [...notifications, ...newNotifs];
  notify();
}

export function updateTask(id: string, partial: Partial<Task>) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, ...partial } : t));
  const task = tasks.find((t) => t.id === id);
  if (task) {
    const eventType = partial.status === "done" ? "task_completed" : "task_updated";
    addEvent({
      id: `evt-auto-${Date.now()}`,
      project_id: task.project_id,
      actor_id: user.id,
      type: eventType,
      object_type: "task",
      object_id: id,
      timestamp: new Date().toISOString(),
      payload: { title: task.title, ...partial },
    });
  }
  notify();
}

export function addTask(task: Task) {
  tasks = [...tasks, task];
  addEvent({
    id: `evt-auto-${Date.now()}`,
    project_id: task.project_id,
    actor_id: user.id,
    type: "task_created",
    object_type: "task",
    object_id: task.id,
    timestamp: new Date().toISOString(),
    payload: { title: task.title },
  });
  notify();
}

export function markNotificationRead(id: string) {
  notifications = notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n));
  notify();
}

export function updateProject(id: string, partial: Partial<Project>) {
  projects = projects.map((p) => (p.id === id ? { ...p, ...partial } : p));
  notify();
}

export function addProcurementItem(item: ProcurementItem) {
  procurementItems = [...procurementItems, item];
  notify();
}

export function addDocument(doc: Document) {
  documents = [...documents, doc];
  notify();
}

export function updateEstimateItems(versionId: string, updatedItems: import("@/types/entities").EstimateItem[]) {
  estimates = estimates.map((e) => ({
    ...e,
    versions: e.versions.map((v) =>
      v.id === versionId ? { ...v, items: updatedItems } : v
    ),
  }));
  notify();
}

export function deductCredit() {
  if (user.credits_free > 0) {
    user = { ...user, credits_free: user.credits_free - 1 };
  } else if (user.credits_paid > 0) {
    user = { ...user, credits_paid: user.credits_paid - 1 };
  }
  notify();
}
