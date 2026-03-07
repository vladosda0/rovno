import type {
  User, Project, Member, Stage, Task, Estimate, ProcurementItem,
  Document, Media, Event, Notification, ContractorProposal, EstimateVersion, EstimateItem,
} from "@/types/entities";
import { moveEstimateItemToStage, deleteEstimateItemsForTask, deleteEstimateItemsBySourceId } from "@/data/estimate-store";
import { getCachedWorkspaceUser } from "@/data/workspace-profile-cache";
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
let contractorProposals: ContractorProposal[] = [];

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
  return getCachedWorkspaceUser(id) ?? allUsers.find((u) => u.id === id);
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

export function getAllTasks(): Task[] {
  return tasks;
}

export function getAllDocuments(): Document[] {
  return documents;
}

export function getAllProcurementItems(): ProcurementItem[] {
  return procurementItems;
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

interface AddTaskOptions {
  actorId?: string;
  source?: string;
}

export function addTask(task: Task, options: AddTaskOptions = {}) {
  tasks = [...tasks, task];
  addEvent({
    id: `evt-auto-${Date.now()}`,
    project_id: task.project_id,
    actor_id: options.actorId ?? user.id,
    type: "task_created",
    object_type: "task",
    object_id: task.id,
    timestamp: new Date().toISOString(),
    payload: {
      title: task.title,
      ...(options.source ? { source: options.source } : {}),
    },
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

export function updateProcurementItem(id: string, partial: Partial<ProcurementItem>) {
  procurementItems = procurementItems.map((p) => (p.id === id ? { ...p, ...partial } : p));
  notify();
}

export function deleteProcurementItem(id: string) {
  procurementItems = procurementItems.filter((p) => p.id !== id);
  notify();
}

export function addDocument(doc: Document) {
  documents = [...documents, doc];
  notify();
}

export function updateDocument(id: string, partial: Partial<Document>) {
  documents = documents.map((d) => (d.id === id ? { ...d, ...partial } : d));
  notify();
}

export function addDocumentVersion(docId: string, version: import("@/types/entities").DocumentVersion) {
  documents = documents.map((d) =>
    d.id === docId ? { ...d, versions: [...d.versions, version] } : d
  );
  notify();
}

export function deleteDocument(id: string) {
  documents = documents.filter((d) => d.id !== id);
  notify();
}

export function addMedia(item: Media) {
  media = [...media, item];
  notify();
}

export function updateMedia(id: string, partial: Partial<Media>) {
  media = media.map((m) => (m.id === id ? { ...m, ...partial } : m));
  notify();
}

export function deleteMedia(id: string) {
  media = media.filter((m) => m.id !== id);
  notify();
}

export function updateEstimateItems(versionId: string, updatedItems: EstimateItem[]) {
  estimates = estimates.map((e) => ({
    ...e,
    versions: e.versions.map((v) =>
      v.id === versionId ? { ...v, items: updatedItems } : v
    ),
  }));
  notify();
}

export function addEstimateVersion(projectId: string, version: EstimateVersion) {
  const existing = estimates.find((e) => e.project_id === projectId);
  if (existing) {
    estimates = estimates.map((e) =>
      e.project_id === projectId ? { ...e, versions: [...e.versions, version] } : e
    );
  } else {
    estimates = [...estimates, { project_id: projectId, versions: [version] }];
  }
  notify();
}

export function updateEstimateVersionStatus(versionId: string, status: import("@/types/entities").EstimateVersionStatus) {
  estimates = estimates.map((e) => ({
    ...e,
    versions: e.versions.map((v) =>
      v.id === versionId ? { ...v, status } : v
    ),
  }));
  notify();
}

export function deleteEstimateVersion(versionId: string) {
  estimates = estimates.map((e) => ({
    ...e,
    versions: e.versions.filter((v) => v.id !== versionId),
  }));
  notify();
}

export function updateEstimateItemPaid(versionId: string, itemId: string, paidCost: number) {
  estimates = estimates.map((e) => ({
    ...e,
    versions: e.versions.map((v) =>
      v.id === versionId
        ? { ...v, items: v.items.map((i) => (i.id === itemId ? { ...i, paid_cost: paidCost } : i)) }
        : v
    ),
  }));
  notify();
}

export function getContractorProposals(projectId: string): ContractorProposal[] {
  return contractorProposals.filter((p) => p.project_id === projectId);
}

export function addContractorProposal(proposal: ContractorProposal) {
  contractorProposals = [...contractorProposals, proposal];
  notify();
}

export function updateContractorProposalStatus(proposalId: string, status: "accepted" | "rejected") {
  contractorProposals = contractorProposals.map((p) =>
    p.id === proposalId ? { ...p, status } : p
  );
  notify();
}

export function linkEstimateToTasks(versionId: string, links: { itemId: string; taskIds: string[] }[]) {
  // Update tasks with linked estimate item IDs
  for (const link of links) {
    for (const taskId of link.taskIds) {
      tasks = tasks.map((t) =>
        t.id === taskId && !t.linked_estimate_item_ids.includes(link.itemId)
          ? { ...t, linked_estimate_item_ids: [...t.linked_estimate_item_ids, link.itemId] }
          : t
      );
    }
  }
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

export function addProject(project: Project) {
  projects = [...projects, project];
  notify();
}

export function addMember(member: Member) {
  members = [...members, member];
  notify();
}

// --- Stage mutations ---
export function addStage(stage: Stage) {
  stages = [...stages, stage];
  addEvent({
    id: `evt-auto-${Date.now()}`,
    project_id: stage.project_id,
    actor_id: user.id,
    type: "stage_created",
    object_type: "stage",
    object_id: stage.id,
    timestamp: new Date().toISOString(),
    payload: { title: stage.title },
  });
  notify();
}

export function deleteStage(stageId: string) {
  const stage = stages.find((s) => s.id === stageId);
  if (!stage) return;
  stages = stages.filter((s) => s.id !== stageId);
  addEvent({
    id: `evt-auto-${Date.now()}`,
    project_id: stage.project_id,
    actor_id: user.id,
    type: "stage_deleted",
    object_type: "stage",
    object_id: stageId,
    timestamp: new Date().toISOString(),
    payload: { title: stage.title },
  });
  notify();
}

export function completeStage(stageId: string) {
  const stage = stages.find((s) => s.id === stageId);
  if (!stage) return;
  stages = stages.map((s) => (s.id === stageId ? { ...s, status: "completed" as const } : s));
  addEvent({
    id: `evt-auto-${Date.now()}`,
    project_id: stage.project_id,
    actor_id: user.id,
    type: "stage_completed",
    object_type: "stage",
    object_id: stageId,
    timestamp: new Date().toISOString(),
    payload: { title: stage.title },
  });
  notify();
}

export function moveTask(taskId: string, newStageId: string) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task || task.stage_id === newStageId) return;
  const oldStageId = task.stage_id;
  tasks = tasks.map((t) => (t.id === taskId ? { ...t, stage_id: newStageId } : t));
  moveEstimateItemToStage(taskId, newStageId);
  addEvent({
    id: `evt-auto-${Date.now()}`,
    project_id: task.project_id,
    actor_id: user.id,
    type: "task_moved",
    object_type: "task",
    object_id: taskId,
    timestamp: new Date().toISOString(),
    payload: { title: task.title, from_stage: oldStageId, to_stage: newStageId },
  });
  notify();
}

export function addComment(taskId: string, text: string) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;
  const comment = { id: `com-${Date.now()}`, author_id: user.id, text, created_at: new Date().toISOString() };
  tasks = tasks.map((t) => (t.id === taskId ? { ...t, comments: [...t.comments, comment] } : t));
  addEvent({
    id: `evt-auto-${Date.now()}`,
    project_id: task.project_id,
    actor_id: user.id,
    type: "comment_added",
    object_type: "task",
    object_id: taskId,
    timestamp: new Date().toISOString(),
    payload: { title: task.title, text },
  });
  notify();
}

export function updateChecklist(taskId: string, checklist: import("@/types/entities").ChecklistItem[]) {
  tasks = tasks.map((t) => (t.id === taskId ? { ...t, checklist } : t));
  notify();
}

export function getTask(id: string): Task | undefined {
  return tasks.find((t) => t.id === id);
}

export function getStage(id: string): Stage | undefined {
  return stages.find((s) => s.id === id);
}

export function deleteTask(id: string) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  // Delete linked estimate items
  deleteEstimateItemsForTask(id, task.checklist.map((c) => c.id));
  tasks = tasks.filter((t) => t.id !== id);
  notify();
}

export function updateTaskDescription(id: string, description: string) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, description } : t));
  notify();
}

export function updateTaskDeadline(id: string, deadline: string | undefined) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, deadline } : t));
  notify();
}

export function addChecklistItem(taskId: string, item: import("@/types/entities").ChecklistItem) {
  tasks = tasks.map((t) =>
    t.id === taskId ? { ...t, checklist: [...t.checklist, item] } : t
  );
  notify();
}

export function updateChecklistItem(taskId: string, itemId: string, text: string) {
  tasks = tasks.map((t) =>
    t.id === taskId
      ? { ...t, checklist: t.checklist.map((c) => (c.id === itemId ? { ...c, text } : c)) }
      : t
  );
  notify();
}

export function deleteChecklistItem(taskId: string, itemId: string) {
  deleteEstimateItemsBySourceId(itemId);
  tasks = tasks.map((t) =>
    t.id === taskId ? { ...t, checklist: t.checklist.filter((c) => c.id !== itemId) } : t
  );
  notify();
}
