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
  {
    id: "project-1",
    owner_id: "user-1",
    title: "Apartment Renovation",
    type: "residential",
    automation_level: "full",
    current_stage_id: "stage-1-2",
    progress_pct: 45,
    address: "12 Nevsky Avenue, Apt 8, Saint Petersburg",
    ai_description: "Demolition is complete. Rough-ins are active, and finishing tasks are queued behind plumbing completion.",
  },
  {
    id: "project-2",
    owner_id: "user-1",
    title: "Office Build-out",
    type: "commercial",
    automation_level: "assisted",
    current_stage_id: "stage-2-1",
    progress_pct: 10,
    address: "5 Business Center Dr, Unit 210",
    ai_description: "Space planning is underway. Construction-line tasks are staged and ready for assignment.",
  },
  {
    id: "project-3",
    owner_id: "user-1",
    title: "Landscape Work",
    type: "residential",
    automation_level: "full",
    current_stage_id: "stage-3-3",
    progress_pct: 65,
    ai_description: "Drainage and grading are complete. Paver installation is active while decorative gravel delivery is blocked.",
  },
];

export const seedMembers: Member[] = [
  { project_id: "project-1", user_id: "user-1", role: "owner", ai_access: "project_pool", credit_limit: 500, used_credits: 45 },
  { project_id: "project-1", user_id: "user-2", role: "contractor", ai_access: "consult_only", credit_limit: 100, used_credits: 12 },
  { project_id: "project-1", user_id: "user-3", role: "viewer", ai_access: "none", credit_limit: 0, used_credits: 0 },
  { project_id: "project-2", user_id: "user-1", role: "owner", ai_access: "project_pool", credit_limit: 500, used_credits: 8 },
  { project_id: "project-2", user_id: "user-2", role: "contractor", ai_access: "consult_only", credit_limit: 50, used_credits: 3 },
  { project_id: "project-3", user_id: "user-1", role: "owner", ai_access: "project_pool", credit_limit: 500, used_credits: 120 },
  { project_id: "project-3", user_id: "user-2", role: "contractor", ai_access: "consult_only", credit_limit: 100, used_credits: 25 },
  { project_id: "project-3", user_id: "user-3", role: "viewer", ai_access: "consult_only", credit_limit: 30, used_credits: 10 },
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
  { id: "stage-3-1", project_id: "project-3", title: "Site preparation", description: "Clear existing vegetation and debris", order: 1, status: "completed" },
  { id: "stage-3-2", project_id: "project-3", title: "Drainage & grading", description: "Install drainage and level terrain", order: 2, status: "completed" },
  { id: "stage-3-3", project_id: "project-3", title: "Paving installation", description: "Lay base and install pavers", order: 3, status: "open" },
  { id: "stage-3-4", project_id: "project-3", title: "Planting & finishing", description: "Plant shrubs, lay gravel, final touches", order: 4, status: "open" },
];

export const seedTasks: Task[] = [
  // Project 1 tasks
  { id: "task-1-1", project_id: "project-1", stage_id: "stage-1-1", title: "Remove old flooring", description: "Strip laminate and underlayment from all rooms", status: "done", assignee_id: "user-2", checklist: [{ id: "cl-1", text: "Living room", done: true }, { id: "cl-2", text: "Bedroom", done: true }], comments: [{ id: "com-1", author_id: "user-2", text: "Completed ahead of schedule", created_at: "2025-01-15T10:00:00Z" }], attachments: [], photos: [], linked_estimate_item_ids: ["ei-1-1"], created_at: "2025-01-10T09:00:00Z" },
  { id: "task-1-2", project_id: "project-1", stage_id: "stage-1-1", title: "Remove wall tiles in bathroom", description: "Carefully remove tiles, preserve plumbing", status: "done", assignee_id: "user-2", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: ["ei-1-2"], created_at: "2025-01-10T09:30:00Z" },
  { id: "task-1-3", project_id: "project-1", stage_id: "stage-1-2", title: "Electrical rough-in", description: "Run new wiring for kitchen and bathroom circuits", status: "in_progress", assignee_id: "user-2", checklist: [{ id: "cl-3", text: "Kitchen circuit", done: true }, { id: "cl-4", text: "Bathroom circuit", done: false }], comments: [], attachments: [], photos: [], linked_estimate_item_ids: ["ei-1-3"], created_at: "2025-01-20T10:00:00Z", deadline: "2025-03-15T00:00:00Z" },
  { id: "task-1-4", project_id: "project-1", stage_id: "stage-1-2", title: "Plumbing rough-in", description: "Install new supply and drain lines", status: "not_started", assignee_id: "user-2", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: ["ei-1-4"], created_at: "2025-01-20T10:30:00Z", deadline: "2025-04-01T00:00:00Z" },
  { id: "task-1-5", project_id: "project-1", stage_id: "stage-1-3", title: "Drywall installation", description: "Hang and finish drywall in all rooms", status: "not_started", assignee_id: "user-3", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [], created_at: "2025-01-25T08:00:00Z" },
  { id: "task-1-6", project_id: "project-1", stage_id: "stage-1-3", title: "Tile installation — bathroom", description: "Floor and wall tiles in main bathroom", status: "blocked", assignee_id: "user-2", checklist: [], comments: [{ id: "com-2", author_id: "user-2", text: "Waiting for plumbing rough-in to complete", created_at: "2025-02-10T14:30:00Z" }], attachments: [], photos: [], linked_estimate_item_ids: [], created_at: "2025-01-25T08:30:00Z" },
  // Project 2 tasks
  { id: "task-2-1", project_id: "project-2", stage_id: "stage-2-1", title: "Create floor plan", description: "Design open office layout with meeting rooms", status: "in_progress", assignee_id: "user-1", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [], created_at: "2025-02-01T10:00:00Z" },
  { id: "task-2-2", project_id: "project-2", stage_id: "stage-2-1", title: "Electrical load calculation", description: "Calculate power requirements for office equipment", status: "not_started", assignee_id: "user-2", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [], created_at: "2025-02-01T10:30:00Z" },
  { id: "task-2-3", project_id: "project-2", stage_id: "stage-2-2", title: "Build glass partitions", description: "Install glass partitions for meeting rooms", status: "not_started", assignee_id: "user-2", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [], created_at: "2025-02-02T09:00:00Z" },
  { id: "task-2-4", project_id: "project-2", stage_id: "stage-2-2", title: "HVAC installation", description: "Install split AC units throughout office", status: "not_started", assignee_id: "user-2", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [], created_at: "2025-02-02T09:30:00Z" },
  // Project 3 tasks — Landscape Work
  { id: "task-3-1", project_id: "project-3", stage_id: "stage-3-1", title: "Remove old turf", description: "Strip existing lawn and root layer", status: "done", assignee_id: "user-3", checklist: [{ id: "cl-3-1", text: "Front yard section", done: true }, { id: "cl-3-2", text: "Backyard section", done: true }], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [], created_at: "2025-01-10T08:00:00Z" },
  { id: "task-3-2", project_id: "project-3", stage_id: "stage-3-1", title: "Level backyard soil", description: "Grade and compact soil to design elevation", status: "done", assignee_id: "user-3", checklist: [{ id: "cl-3-3", text: "Rough grading", done: true }, { id: "cl-3-4", text: "Compaction pass", done: true }], comments: [{ id: "com-3-1", author_id: "user-3", text: "Soil compacted to 95% density", created_at: "2025-01-14T15:00:00Z" }], attachments: [], photos: [], linked_estimate_item_ids: [], created_at: "2025-01-12T08:00:00Z" },
  { id: "task-3-3", project_id: "project-3", stage_id: "stage-3-2", title: "Install drainage gravel strip", description: "Lay gravel along perimeter for water runoff", status: "done", assignee_id: "user-2", checklist: [{ id: "cl-3-5", text: "Dig trench 30cm", done: true }, { id: "cl-3-6", text: "Fill with crushed stone", done: true }], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [], created_at: "2025-01-16T08:00:00Z" },
  { id: "task-3-4", project_id: "project-3", stage_id: "stage-3-2", title: "Lay geotextile fabric", description: "Cover graded area with geotextile separator", status: "done", assignee_id: "user-2", checklist: [], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [], created_at: "2025-01-18T08:00:00Z" },
  { id: "task-3-5", project_id: "project-3", stage_id: "stage-3-2", title: "Set perimeter edging", description: "Install aluminum edging along paving borders", status: "done", assignee_id: "user-2", checklist: [{ id: "cl-3-7", text: "North side", done: true }, { id: "cl-3-8", text: "South side", done: true }, { id: "cl-3-9", text: "East side", done: true }], comments: [{ id: "com-3-2", author_id: "user-2", text: "All sides aligned, ready for paving", created_at: "2025-01-22T16:00:00Z" }], attachments: [], photos: [], linked_estimate_item_ids: [], created_at: "2025-01-20T08:00:00Z" },
  { id: "task-3-6", project_id: "project-3", stage_id: "stage-3-3", title: "Install paver base layer", description: "Spread and compact sand-gravel mix for paver base", status: "in_progress", assignee_id: "user-2", checklist: [{ id: "cl-3-10", text: "Spread base material", done: true }, { id: "cl-3-11", text: "Level with screed rails", done: false }, { id: "cl-3-12", text: "Final compaction", done: false }], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [], created_at: "2025-01-25T08:00:00Z" },
  { id: "task-3-7", project_id: "project-3", stage_id: "stage-3-3", title: "Align first row of pavers", description: "Set reference line and lay first course", status: "in_progress", assignee_id: "user-2", checklist: [{ id: "cl-3-13", text: "Set string line", done: true }, { id: "cl-3-14", text: "Lay first course", done: false }], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [], created_at: "2025-01-27T08:00:00Z" },
  { id: "task-3-8", project_id: "project-3", stage_id: "stage-3-3", title: "Prepare irrigation lines", description: "Lay drip irrigation tubing before final paving", status: "in_progress", assignee_id: "user-3", checklist: [{ id: "cl-3-15", text: "Main supply line", done: true }, { id: "cl-3-16", text: "Drip zone A", done: false }, { id: "cl-3-17", text: "Drip zone B", done: false }], comments: [], attachments: [], photos: [], linked_estimate_item_ids: [], created_at: "2025-01-28T08:00:00Z" },
  { id: "task-3-9", project_id: "project-3", stage_id: "stage-3-4", title: "Delivery of decorative gravel", description: "Receive and distribute decorative gravel for planting beds", status: "blocked", assignee_id: "user-2", checklist: [], comments: [{ id: "com-3-3", author_id: "user-2", text: "Supplier delay, expected next week", created_at: "2025-02-01T10:00:00Z" }], attachments: [], photos: [], linked_estimate_item_ids: [], created_at: "2025-01-30T08:00:00Z" },
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
          { id: "ei-3-1", version_id: "ev-3-1", stage_id: "stage-3-1", type: "work", title: "Site clearing & turf removal", unit: "m²", qty: 200, planned_cost: 30000, paid_cost: 30000 },
          { id: "ei-3-2", version_id: "ev-3-1", stage_id: "stage-3-1", type: "work", title: "Soil grading & compaction", unit: "m²", qty: 200, planned_cost: 25000, paid_cost: 25000 },
          { id: "ei-3-3", version_id: "ev-3-1", stage_id: "stage-3-2", type: "material", title: "Crushed stone base", unit: "m³", qty: 8, planned_cost: 32000, paid_cost: 32000 },
          { id: "ei-3-4", version_id: "ev-3-1", stage_id: "stage-3-2", type: "material", title: "Geotextile fabric", unit: "m²", qty: 150, planned_cost: 18000, paid_cost: 18000 },
          { id: "ei-3-5", version_id: "ev-3-1", stage_id: "stage-3-2", type: "material", title: "Lawn border edging", unit: "m", qty: 60, planned_cost: 15000, paid_cost: 15000 },
          { id: "ei-3-6", version_id: "ev-3-1", stage_id: "stage-3-2", type: "work", title: "Drainage installation", unit: "m", qty: 40, planned_cost: 40000, paid_cost: 40000 },
          { id: "ei-3-7", version_id: "ev-3-1", stage_id: "stage-3-3", type: "material", title: "Concrete pavers", unit: "m²", qty: 120, planned_cost: 144000, paid_cost: 80000 },
          { id: "ei-3-8", version_id: "ev-3-1", stage_id: "stage-3-3", type: "work", title: "Paving labour", unit: "m²", qty: 120, planned_cost: 48000, paid_cost: 20000 },
          { id: "ei-3-9", version_id: "ev-3-1", stage_id: "stage-3-3", type: "material", title: "Irrigation supplies", unit: "set", qty: 1, planned_cost: 25000, paid_cost: 15000 },
          { id: "ei-3-10", version_id: "ev-3-1", stage_id: "stage-3-4", type: "material", title: "Decorative gravel", unit: "m³", qty: 3, planned_cost: 18000, paid_cost: 0 },
          { id: "ei-3-11", version_id: "ev-3-1", stage_id: "stage-3-4", type: "work", title: "Planting & finishing work", unit: "project", qty: 1, planned_cost: 25000, paid_cost: 0 },
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
  { id: "proc-3-1", project_id: "project-3", stage_id: "stage-3-3", estimate_item_id: "ei-3-7", title: "Concrete pavers", unit: "m²", qty: 120, in_stock: 120, cost: 144000, status: "purchased" },
  { id: "proc-3-2", project_id: "project-3", stage_id: "stage-3-2", estimate_item_id: "ei-3-3", title: "Crushed stone base", unit: "m³", qty: 8, in_stock: 5, cost: 32000, status: "purchased" },
  { id: "proc-3-3", project_id: "project-3", stage_id: "stage-3-2", estimate_item_id: "ei-3-4", title: "Geotextile fabric", unit: "m²", qty: 150, in_stock: 150, cost: 18000, status: "purchased" },
  { id: "proc-3-4", project_id: "project-3", stage_id: "stage-3-4", estimate_item_id: "ei-3-10", title: "Decorative gravel", unit: "m³", qty: 3, in_stock: 0, cost: 18000, status: "not_purchased" },
  { id: "proc-3-5", project_id: "project-3", stage_id: "stage-3-2", estimate_item_id: "ei-3-5", title: "Lawn border edging", unit: "m", qty: 60, in_stock: 60, cost: 15000, status: "purchased" },
];

export const seedDocuments: Document[] = [
  {
    id: "doc-1-1",
    project_id: "project-1",
    type: "contract",
    title: "Renovation Contract",
    origin: "project_creation",
    created_at: "2025-01-09T09:00:00Z",
    versions: [{ id: "dv-1-1", document_id: "doc-1-1", number: 1, status: "active", content: "General renovation contract for apartment..." }],
  },
  {
    id: "doc-1-2",
    project_id: "project-1",
    type: "specification",
    title: "Electrical Specification",
    created_at: "2025-01-16T09:00:00Z",
    versions: [{ id: "dv-1-2", document_id: "doc-1-2", number: 1, status: "draft", content: "Detailed electrical specification..." }],
  },
  {
    id: "doc-2-1",
    project_id: "project-2",
    type: "contract",
    title: "Build-out Agreement",
    origin: "project_creation",
    created_at: "2025-02-03T14:00:00Z",
    versions: [{ id: "dv-2-1", document_id: "doc-2-1", number: 1, status: "awaiting_approval", content: "Office build-out agreement..." }],
  },
  {
    id: "doc-3-1",
    project_id: "project-3",
    type: "specification",
    title: "Landscape design plan",
    created_at: "2025-01-10T10:00:00Z",
    versions: [
      { id: "dv-3-1", document_id: "doc-3-1", number: 2, status: "active", content: "Landscape layout with paving zones, planting beds, and irrigation..." },
      { id: "dv-3-1b", document_id: "doc-3-1", number: 1, status: "active", content: "Initial landscape concept..." },
    ],
  },
  {
    id: "doc-3-2",
    project_id: "project-3",
    type: "specification",
    title: "Irrigation layout scheme",
    created_at: "2025-01-18T10:00:00Z",
    versions: [{ id: "dv-3-2", document_id: "doc-3-2", number: 1, status: "active", content: "Drip irrigation layout for zones A and B..." }],
  },
  {
    id: "doc-3-3",
    project_id: "project-3",
    type: "specification",
    title: "Material specification sheet",
    created_at: "2025-01-24T10:00:00Z",
    versions: [{ id: "dv-3-3", document_id: "doc-3-3", number: 1, status: "draft", content: "Paver type, gravel grade, edging spec..." }],
  },
];

export const seedMedia: Media[] = [
  { id: "media-1-1", project_id: "project-1", task_id: "task-1-1", uploader_id: "user-2", caption: "Old flooring removed — living room", is_final: false, created_at: "2025-01-14T16:00:00Z" },
  { id: "media-1-2", project_id: "project-1", task_id: "task-1-2", uploader_id: "user-2", caption: "Bathroom tiles stripped", is_final: false, created_at: "2025-01-18T11:00:00Z" },
  { id: "media-1-3", project_id: "project-1", task_id: "task-1-3", uploader_id: "user-2", caption: "Wiring in progress — kitchen", is_final: false, created_at: "2025-02-05T09:00:00Z" },
  { id: "media-2-1", project_id: "project-2", uploader_id: "user-1", caption: "Current office space — before", is_final: false, created_at: "2025-02-01T10:00:00Z" },
  { id: "media-3-1", project_id: "project-3", task_id: "task-3-2", uploader_id: "user-3", caption: "Graded soil before paving", is_final: false, created_at: "2025-01-14T16:00:00Z" },
  { id: "media-3-2", project_id: "project-3", task_id: "task-3-3", uploader_id: "user-2", caption: "Drainage trench close-up", is_final: false, created_at: "2025-01-17T11:00:00Z" },
  { id: "media-3-3", project_id: "project-3", task_id: "task-3-5", uploader_id: "user-2", caption: "Installed edging detail", is_final: false, created_at: "2025-01-22T16:30:00Z" },
  { id: "media-3-4", project_id: "project-3", task_id: "task-3-7", uploader_id: "user-2", caption: "Paver alignment check", is_final: false, created_at: "2025-01-28T10:00:00Z" },
];

export const seedEvents: Event[] = [
  { id: "evt-1", project_id: "project-1", actor_id: "user-1", type: "task_created", object_type: "task", object_id: "task-1-1", timestamp: "2025-01-10T09:00:00Z", payload: { title: "Remove old flooring" } },
  { id: "evt-2", project_id: "project-1", actor_id: "user-2", type: "task_completed", object_type: "task", object_id: "task-1-1", timestamp: "2025-01-15T10:00:00Z", payload: { title: "Remove old flooring" } },
  { id: "evt-3", project_id: "project-1", actor_id: "user-2", type: "task_completed", object_type: "task", object_id: "task-1-2", timestamp: "2025-01-20T14:00:00Z", payload: { title: "Remove wall tiles in bathroom" } },
  { id: "evt-4", project_id: "project-1", actor_id: "user-1", type: "estimate_approved", object_type: "estimate_version", object_id: "ev-1-1", timestamp: "2025-01-12T11:00:00Z", payload: { version: 1 } },
  { id: "evt-5", project_id: "project-1", actor_id: "user-2", type: "photo_uploaded", object_type: "media", object_id: "media-1-1", timestamp: "2025-01-14T16:00:00Z", payload: { caption: "Old flooring removed — living room" } },
  { id: "evt-6", project_id: "project-1", actor_id: "user-2", type: "comment_added", object_type: "task", object_id: "task-1-6", timestamp: "2025-02-10T14:30:00Z", payload: { text: "Waiting for plumbing rough-in to complete" } },
  { id: "evt-7", project_id: "project-1", actor_id: "user-1", type: "member_added", object_type: "member", object_id: "user-3", timestamp: "2025-01-08T09:00:00Z", payload: { name: "Dmitry Sokolov", role: "viewer" } },
  { id: "evt-8", project_id: "project-2", actor_id: "user-1", type: "task_created", object_type: "task", object_id: "task-2-1", timestamp: "2025-02-01T10:00:00Z", payload: { title: "Create floor plan" } },
  { id: "evt-9", project_id: "project-2", actor_id: "user-1", type: "estimate_created", object_type: "estimate_version", object_id: "ev-2-1", timestamp: "2025-02-02T11:00:00Z", payload: { version: 1 } },
  { id: "evt-10", project_id: "project-2", actor_id: "user-1", type: "document_uploaded", object_type: "document", object_id: "doc-2-1", timestamp: "2025-02-03T14:00:00Z", payload: { title: "Build-out Agreement" } },
  { id: "evt-11", project_id: "project-3", actor_id: "user-1", type: "task_created", object_type: "task", object_id: "task-3-1", timestamp: "2025-01-10T08:00:00Z", payload: { title: "Remove old turf" } },
  { id: "evt-12", project_id: "project-3", actor_id: "user-3", type: "task_completed", object_type: "task", object_id: "task-3-1", timestamp: "2025-01-12T17:00:00Z", payload: { title: "Remove old turf" } },
  { id: "evt-13", project_id: "project-3", actor_id: "user-3", type: "task_completed", object_type: "task", object_id: "task-3-2", timestamp: "2025-01-14T17:00:00Z", payload: { title: "Level backyard soil" } },
  { id: "evt-14", project_id: "project-3", actor_id: "user-3", type: "photo_uploaded", object_type: "media", object_id: "media-3-1", timestamp: "2025-01-14T16:00:00Z", payload: { caption: "Graded soil before paving" } },
  { id: "evt-15", project_id: "project-3", actor_id: "user-1", type: "estimate_approved", object_type: "estimate_version", object_id: "ev-3-1", timestamp: "2025-01-15T10:00:00Z", payload: { version: 1 } },
  { id: "evt-16", project_id: "project-3", actor_id: "user-2", type: "task_completed", object_type: "task", object_id: "task-3-5", timestamp: "2025-01-22T16:00:00Z", payload: { title: "Set perimeter edging" } },
  { id: "evt-17", project_id: "project-3", actor_id: "user-2", type: "photo_uploaded", object_type: "media", object_id: "media-3-3", timestamp: "2025-01-22T16:30:00Z", payload: { caption: "Installed edging detail" } },
  { id: "evt-18", project_id: "project-3", actor_id: "user-2", type: "comment_added", object_type: "task", object_id: "task-3-9", timestamp: "2025-02-01T10:00:00Z", payload: { text: "Supplier delay, expected next week" } },
];

export const seedNotifications: Notification[] = [
  { id: "notif-1", user_id: "user-1", project_id: "project-1", event_id: "evt-2", is_read: true },
  { id: "notif-2", user_id: "user-1", project_id: "project-1", event_id: "evt-3", is_read: true },
  { id: "notif-3", user_id: "user-1", project_id: "project-1", event_id: "evt-5", is_read: false },
  { id: "notif-4", user_id: "user-1", project_id: "project-1", event_id: "evt-6", is_read: false },
  { id: "notif-5", user_id: "user-1", project_id: "project-3", event_id: "evt-18", is_read: false },
];

export const allUsers: User[] = [seedUser, ...otherUsers];
