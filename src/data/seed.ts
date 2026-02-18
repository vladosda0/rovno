import type {
  User, Project, Member, Stage, Task, Estimate, ProcurementItem,
  Document, Media, Event, Notification,
} from "@/types/entities";

export const seedUser: User = {
  id: "user-1",
  email: "alex@stroyagent.io",
  name: "Alex Petrov",
  locale: "ru",
  timezone: "Europe/Moscow",
  plan: "pro",
  credits_free: 50,
  credits_paid: 200,
};

const otherUsers: User[] = [
  { id: "user-2", email: "maria@example.com", name: "Maria Ivanova", locale: "ru", timezone: "Europe/Moscow", plan: "free", credits_free: 50, credits_paid: 0 },
  { id: "user-3", email: "dmitry@example.com", name: "Dmitry Sokolov", locale: "ru", timezone: "Europe/Moscow", plan: "free", credits_free: 50, credits_paid: 0 },
];

export const seedProjects: Project[] = [
  { id: "project-1", owner_id: "user-1", title: "Apartment Renovation", type: "residential", automation_level: "full", current_stage_id: "stage-1-2", progress_pct: 45 },
  { id: "project-2", owner_id: "user-1", title: "Office Build-out", type: "commercial", automation_level: "assisted", current_stage_id: "stage-2-1", progress_pct: 10 },
  { id: "project-3", owner_id: "user-1", title: "Kitchen Remodel", type: "residential", automation_level: "full", current_stage_id: "stage-3-2", progress_pct: 100 },
];

export const seedMembers: Member[] = [
  { project_id: "project-1", user_id: "user-1", role: "owner", ai_access: "project_pool", credit_limit: 500, used_credits: 45 },
  { project_id: "project-1", user_id: "user-2", role: "contractor", ai_access: "consult_only", credit_limit: 100, used_credits: 12 },
  { project_id: "project-1", user_id: "user-3", role: "participant", ai_access: "none", credit_limit: 0, used_credits: 0 },
  { project_id: "project-2", user_id: "user-1", role: "owner", ai_access: "project_pool", credit_limit: 500, used_credits: 8 },
  { project_id: "project-2", user_id: "user-2", role: "contractor", ai_access: "consult_only", credit_limit: 50, used_credits: 3 },
  { project_id: "project-3", user_id: "user-1", role: "owner", ai_access: "project_pool", credit_limit: 500, used_credits: 120 },
  { project_id: "project-3", user_id: "user-3", role: "participant", ai_access: "consult_only", credit_limit: 30, used_credits: 10 },
];

export const seedStages: Stage[] = [
  // Project 1
  { id: "stage-1-1", project_id: "project-1", title: "Demolition", description: "Remove old finishes and structures", order: 1, status: "completed" },
  { id: "stage-1-2", project_id: "project-1", title: "Electrical & Plumbing", description: "Rough-in electrical wiring and plumbing", order: 2, status: "open" },
  { id: "stage-1-3", project_id: "project-1", title: "Finishing", description: "Drywall, paint, tile, flooring", order: 3, status: "open" },
  // Project 2
  { id: "stage-2-1", project_id: "project-2", title: "Space Planning", description: "Layout and partition planning", order: 1, status: "open" },
  { id: "stage-2-2", project_id: "project-2", title: "Construction", description: "Build partitions and infrastructure", order: 2, status: "open" },
  // Project 3
  { id: "stage-3-1", project_id: "project-3", title: "Demolition", description: "Remove old kitchen", order: 1, status: "completed" },
  { id: "stage-3-2", project_id: "project-3", title: "Installation", description: "Install new kitchen cabinets and appliances", order: 2, status: "completed" },
];

export const seedTasks: Task[] = [
  // Project 1 tasks
  { id: "task-1-1", project_id: "project-1", stage_id: "stage-1-1", title: "Remove old flooring", description: "Strip laminate and underlayment from all rooms", status: "done", assignee_id: "user-2", checklist: [{ id: "cl-1", text: "Living room", done: true }, { id: "cl-2", text: "Bedroom", done: true }], comments: [{ id: "com-1", author_id: "user-2", text: "Completed ahead of schedule", created_at: "2025-01-15T10:00:00Z" }], attachments: [], photos: [], linked_estimate_item_ids: ["ei-1-1"] },
  { id: "task-1-2", project_id: "project-1", stage_id: "stage-1-1", title: "Remove wall tiles in bathroom", description: "Carefully remove tiles, preserve plumbing", status: "done", assignee_id: "user-2", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: ["ei-1-2"] },
  { id: "task-1-3", project_id: "project-1", stage_id: "stage-1-2", title: "Electrical rough-in", description: "Run new wiring for kitchen and bathroom circuits", status: "in_progress", assignee_id: "user-2", checklist: [{ id: "cl-3", text: "Kitchen circuit", done: true }, { id: "cl-4", text: "Bathroom circuit", done: false }], comments: [], attachments: [], photos: [], linked_estimate_item_ids: ["ei-1-3"] },
  { id: "task-1-4", project_id: "project-1", stage_id: "stage-1-2", title: "Plumbing rough-in", description: "Install new supply and drain lines", status: "not_started", assignee_id: "user-2", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: ["ei-1-4"] },
  { id: "task-1-5", project_id: "project-1", stage_id: "stage-1-3", title: "Drywall installation", description: "Hang and finish drywall in all rooms", status: "not_started", assignee_id: "user-3", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [] },
  { id: "task-1-6", project_id: "project-1", stage_id: "stage-1-3", title: "Tile installation — bathroom", description: "Floor and wall tiles in main bathroom", status: "blocked", assignee_id: "user-2", checklist: [], comments: [{ id: "com-2", author_id: "user-2", text: "Waiting for plumbing rough-in to complete", created_at: "2025-02-10T14:30:00Z" }], attachments: [], photos: [], linked_estimate_item_ids: [] },
  // Project 2 tasks
  { id: "task-2-1", project_id: "project-2", stage_id: "stage-2-1", title: "Create floor plan", description: "Design open office layout with meeting rooms", status: "in_progress", assignee_id: "user-1", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [] },
  { id: "task-2-2", project_id: "project-2", stage_id: "stage-2-1", title: "Electrical load calculation", description: "Calculate power requirements for office equipment", status: "not_started", assignee_id: "user-2", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [] },
  { id: "task-2-3", project_id: "project-2", stage_id: "stage-2-2", title: "Build glass partitions", description: "Install glass partitions for meeting rooms", status: "not_started", assignee_id: "user-2", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [] },
  { id: "task-2-4", project_id: "project-2", stage_id: "stage-2-2", title: "HVAC installation", description: "Install split AC units throughout office", status: "not_started", assignee_id: "user-2", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [] },
  // Project 3 tasks
  { id: "task-3-1", project_id: "project-3", stage_id: "stage-3-1", title: "Demo old cabinets", description: "Remove all existing kitchen cabinets", status: "done", assignee_id: "user-3", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [] },
  { id: "task-3-2", project_id: "project-3", stage_id: "stage-3-1", title: "Remove old countertop", description: "Remove laminate countertop and backsplash", status: "done", assignee_id: "user-3", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [] },
  { id: "task-3-3", project_id: "project-3", stage_id: "stage-3-2", title: "Install new cabinets", description: "Mount upper and lower cabinets per design", status: "done", assignee_id: "user-3", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [] },
  { id: "task-3-4", project_id: "project-3", stage_id: "stage-3-2", title: "Install quartz countertop", description: "Template, fabricate, and install", status: "done", assignee_id: "user-3", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [] },
];

export const seedEstimates: Estimate[] = [
  {
    project_id: "project-1",
    versions: [
      {
        id: "ev-1-1", project_id: "project-1", number: 1, status: "approved",
        items: [
          { id: "ei-1-1", version_id: "ev-1-1", stage_id: "stage-1-1", type: "work", title: "Flooring removal", unit: "m²", qty: 65, planned_cost: 19500, paid_cost: 19500 },
          { id: "ei-1-2", version_id: "ev-1-1", stage_id: "stage-1-1", type: "work", title: "Tile removal", unit: "m²", qty: 12, planned_cost: 6000, paid_cost: 6000 },
          { id: "ei-1-3", version_id: "ev-1-1", stage_id: "stage-1-2", type: "work", title: "Electrical rough-in", unit: "points", qty: 24, planned_cost: 48000, paid_cost: 20000 },
          { id: "ei-1-4", version_id: "ev-1-1", stage_id: "stage-1-2", type: "work", title: "Plumbing rough-in", unit: "points", qty: 8, planned_cost: 32000, paid_cost: 0 },
          { id: "ei-1-5", version_id: "ev-1-1", stage_id: "stage-1-3", type: "material", title: "Drywall sheets", unit: "pcs", qty: 40, planned_cost: 24000, paid_cost: 0 },
          { id: "ei-1-6", version_id: "ev-1-1", stage_id: "stage-1-3", type: "material", title: "Bathroom tiles", unit: "m²", qty: 18, planned_cost: 36000, paid_cost: 0 },
        ],
      },
    ],
  },
  {
    project_id: "project-2",
    versions: [
      {
        id: "ev-2-1", project_id: "project-2", number: 1, status: "draft",
        items: [
          { id: "ei-2-1", version_id: "ev-2-1", stage_id: "stage-2-1", type: "work", title: "Space planning & design", unit: "project", qty: 1, planned_cost: 80000, paid_cost: 0 },
          { id: "ei-2-2", version_id: "ev-2-1", stage_id: "stage-2-2", type: "material", title: "Glass partitions", unit: "m²", qty: 30, planned_cost: 150000, paid_cost: 0 },
          { id: "ei-2-3", version_id: "ev-2-1", stage_id: "stage-2-2", type: "work", title: "HVAC installation", unit: "units", qty: 6, planned_cost: 120000, paid_cost: 0 },
        ],
      },
    ],
  },
  {
    project_id: "project-3",
    versions: [
      {
        id: "ev-3-1", project_id: "project-3", number: 1, status: "approved",
        items: [
          { id: "ei-3-1", version_id: "ev-3-1", stage_id: "stage-3-1", type: "work", title: "Kitchen demolition", unit: "project", qty: 1, planned_cost: 15000, paid_cost: 15000 },
          { id: "ei-3-2", version_id: "ev-3-1", stage_id: "stage-3-2", type: "material", title: "Kitchen cabinets set", unit: "set", qty: 1, planned_cost: 180000, paid_cost: 180000 },
          { id: "ei-3-3", version_id: "ev-3-1", stage_id: "stage-3-2", type: "material", title: "Quartz countertop", unit: "m²", qty: 4, planned_cost: 60000, paid_cost: 60000 },
          { id: "ei-3-4", version_id: "ev-3-1", stage_id: "stage-3-2", type: "work", title: "Cabinet installation", unit: "project", qty: 1, planned_cost: 25000, paid_cost: 25000 },
          { id: "ei-3-5", version_id: "ev-3-1", stage_id: "stage-3-2", type: "work", title: "Countertop installation", unit: "project", qty: 1, planned_cost: 15000, paid_cost: 15000 },
        ],
      },
    ],
  },
];

export const seedProcurementItems: ProcurementItem[] = [
  { id: "proc-1-1", project_id: "project-1", stage_id: "stage-1-2", estimate_item_id: "ei-1-3", title: "Electrical cable NYM 3×2.5", unit: "m", qty: 200, in_stock: 200, cost: 8000, status: "purchased" },
  { id: "proc-1-2", project_id: "project-1", stage_id: "stage-1-2", estimate_item_id: "ei-1-4", title: "PPR pipes 20mm", unit: "m", qty: 50, in_stock: 0, cost: 5000, status: "not_purchased" },
  { id: "proc-1-3", project_id: "project-1", stage_id: "stage-1-3", estimate_item_id: "ei-1-5", title: "Gypsum drywall 12.5mm", unit: "pcs", qty: 40, in_stock: 0, cost: 24000, status: "not_purchased" },
  { id: "proc-1-4", project_id: "project-1", stage_id: "stage-1-3", estimate_item_id: "ei-1-6", title: "Porcelain floor tiles 60×60", unit: "m²", qty: 18, in_stock: 0, cost: 36000, status: "not_purchased" },
  { id: "proc-2-1", project_id: "project-2", stage_id: "stage-2-2", estimate_item_id: "ei-2-2", title: "Tempered glass panels", unit: "m²", qty: 30, in_stock: 0, cost: 150000, status: "not_purchased" },
  { id: "proc-3-1", project_id: "project-3", stage_id: "stage-3-2", estimate_item_id: "ei-3-2", title: "Kitchen cabinet set — Hoff", unit: "set", qty: 1, in_stock: 1, cost: 180000, status: "purchased" },
  { id: "proc-3-2", project_id: "project-3", stage_id: "stage-3-2", estimate_item_id: "ei-3-3", title: "Quartz slab — White Storm", unit: "m²", qty: 4, in_stock: 4, cost: 60000, status: "purchased" },
];

export const seedDocuments: Document[] = [
  { id: "doc-1-1", project_id: "project-1", type: "contract", title: "Renovation Contract", versions: [{ id: "dv-1-1", document_id: "doc-1-1", number: 1, status: "active", content: "General renovation contract for apartment..." }] },
  { id: "doc-1-2", project_id: "project-1", type: "specification", title: "Electrical Specification", versions: [{ id: "dv-1-2", document_id: "doc-1-2", number: 1, status: "draft", content: "Detailed electrical specification..." }] },
  { id: "doc-2-1", project_id: "project-2", type: "contract", title: "Build-out Agreement", versions: [{ id: "dv-2-1", document_id: "doc-2-1", number: 1, status: "awaiting_approval", content: "Office build-out agreement..." }] },
  { id: "doc-3-1", project_id: "project-3", type: "warranty", title: "Kitchen Warranty Card", versions: [{ id: "dv-3-1", document_id: "doc-3-1", number: 1, status: "active", content: "2-year warranty on installed kitchen..." }] },
  { id: "doc-3-2", project_id: "project-3", type: "specification", title: "Countertop Spec", versions: [{ id: "dv-3-2", document_id: "doc-3-2", number: 1, status: "active", content: "Quartz countertop material specification..." }] },
];

export const seedMedia: Media[] = [
  { id: "media-1-1", project_id: "project-1", task_id: "task-1-1", uploader_id: "user-2", caption: "Old flooring removed — living room", is_final: false, created_at: "2025-01-14T16:00:00Z" },
  { id: "media-1-2", project_id: "project-1", task_id: "task-1-2", uploader_id: "user-2", caption: "Bathroom tiles stripped", is_final: false, created_at: "2025-01-18T11:00:00Z" },
  { id: "media-1-3", project_id: "project-1", task_id: "task-1-3", uploader_id: "user-2", caption: "Wiring in progress — kitchen", is_final: false, created_at: "2025-02-05T09:00:00Z" },
  { id: "media-2-1", project_id: "project-2", uploader_id: "user-1", caption: "Current office space — before", is_final: false, created_at: "2025-02-01T10:00:00Z" },
  { id: "media-3-1", project_id: "project-3", task_id: "task-3-3", uploader_id: "user-3", caption: "New cabinets installed", is_final: true, created_at: "2025-01-25T15:00:00Z" },
  { id: "media-3-2", project_id: "project-3", task_id: "task-3-4", uploader_id: "user-3", caption: "Countertop final photo", is_final: true, created_at: "2025-01-28T12:00:00Z" },
];

export const seedEvents: Event[] = [
  { id: "evt-1", project_id: "project-1", actor_id: "user-1", type: "task_created", object_type: "task", object_id: "task-1-1", timestamp: "2025-01-10T09:00:00Z", payload: { title: "Remove old flooring" } },
  { id: "evt-2", project_id: "project-1", actor_id: "user-2", type: "task_completed", object_type: "task", object_id: "task-1-1", timestamp: "2025-01-15T10:00:00Z", payload: { title: "Remove old flooring" } },
  { id: "evt-3", project_id: "project-1", actor_id: "user-2", type: "task_completed", object_type: "task", object_id: "task-1-2", timestamp: "2025-01-20T14:00:00Z", payload: { title: "Remove wall tiles in bathroom" } },
  { id: "evt-4", project_id: "project-1", actor_id: "user-1", type: "estimate_approved", object_type: "estimate_version", object_id: "ev-1-1", timestamp: "2025-01-12T11:00:00Z", payload: { version: 1 } },
  { id: "evt-5", project_id: "project-1", actor_id: "user-2", type: "photo_uploaded", object_type: "media", object_id: "media-1-1", timestamp: "2025-01-14T16:00:00Z", payload: { caption: "Old flooring removed — living room" } },
  { id: "evt-6", project_id: "project-1", actor_id: "user-2", type: "comment_added", object_type: "task", object_id: "task-1-6", timestamp: "2025-02-10T14:30:00Z", payload: { text: "Waiting for plumbing rough-in to complete" } },
  { id: "evt-7", project_id: "project-1", actor_id: "user-1", type: "member_added", object_type: "member", object_id: "user-3", timestamp: "2025-01-08T09:00:00Z", payload: { name: "Dmitry Sokolov", role: "participant" } },
  { id: "evt-8", project_id: "project-2", actor_id: "user-1", type: "task_created", object_type: "task", object_id: "task-2-1", timestamp: "2025-02-01T10:00:00Z", payload: { title: "Create floor plan" } },
  { id: "evt-9", project_id: "project-2", actor_id: "user-1", type: "estimate_created", object_type: "estimate_version", object_id: "ev-2-1", timestamp: "2025-02-02T11:00:00Z", payload: { version: 1 } },
  { id: "evt-10", project_id: "project-2", actor_id: "user-1", type: "document_uploaded", object_type: "document", object_id: "doc-2-1", timestamp: "2025-02-03T14:00:00Z", payload: { title: "Build-out Agreement" } },
  { id: "evt-11", project_id: "project-3", actor_id: "user-3", type: "task_completed", object_type: "task", object_id: "task-3-4", timestamp: "2025-01-28T12:00:00Z", payload: { title: "Install quartz countertop" } },
  { id: "evt-12", project_id: "project-3", actor_id: "user-3", type: "photo_uploaded", object_type: "media", object_id: "media-3-2", timestamp: "2025-01-28T12:00:00Z", payload: { caption: "Countertop final photo" } },
];

export const seedNotifications: Notification[] = [
  { id: "notif-1", user_id: "user-1", project_id: "project-1", event_id: "evt-2", is_read: true },
  { id: "notif-2", user_id: "user-1", project_id: "project-1", event_id: "evt-3", is_read: true },
  { id: "notif-3", user_id: "user-1", project_id: "project-1", event_id: "evt-5", is_read: false },
  { id: "notif-4", user_id: "user-1", project_id: "project-1", event_id: "evt-6", is_read: false },
  { id: "notif-5", user_id: "user-1", project_id: "project-3", event_id: "evt-11", is_read: false },
];

export const allUsers: User[] = [seedUser, ...otherUsers];
