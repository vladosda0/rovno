import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Bot,
  ChevronLeft,
  ChevronDown,
  CloudUpload,
  Files,
  Hammer,
  Menu,
  Moon,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Sun,
  Timer,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useCurrentUser, useProjects } from "@/hooks/use-mock-data";
import { isAuthenticated } from "@/lib/auth-state";
import { toast } from "@/hooks/use-toast";

const THEME_KEY = "landing-theme";
const ACCEPTED_FILE_TYPES = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx";

const DEMO_COVER_IMAGE_MAP: Record<string, string> = {
  "project-1": "/demo/apt-demo.png",
  "project-2": "/demo/office-demo.png",
  "project-3": "/demo/kitchen-demo.png",
};

type ControlTab = "tasks" | "estimate" | "procurement" | "photos" | "documents" | "activity";
type KanbanColumn = "todo" | "doing" | "done";

type ControlRow = { label: string; value: string; tone?: string };
type ControlPanelContent = {
  title: string;
  rows: ControlRow[];
  bullets: string[];
};
type KanbanTask = {
  id: string;
  title: string;
  assignee: string;
  meta: string;
  linked?: string;
};
type KanbanState = Record<KanbanColumn, KanbanTask[]>;
type EstimateVariance = "over" | "under" | "on-track" | "pending";
type EstimateLinkedTask = {
  title: string;
  status: string;
};
type EstimateItem = {
  id: string;
  item: string;
  planned: string;
  actual: string;
  variance: string;
  varianceType: EstimateVariance;
  linkedTasks?: EstimateLinkedTask[];
  receipts?: string;
  note?: string;
  aiInsight?: string;
};
type ProcurementStatusLabel = "To buy" | "Ordered" | "Partial" | "In stock" | "Delayed";
type ProcurementItem = {
  id: string;
  material: string;
  neededQty: number;
  receivedQty: number;
  orderedQty: number;
  supplier: string;
  eta: string;
  committedCost: string;
  linkedTaskName: string;
  linkedEstimate: string;
  delayed?: boolean;
};
type PhotosDemoId = "photo-tile" | "photo-crack" | "photo-insulation" | "photo-landscape";
type PhotoAction = {
  label: string;
  kind: "primary" | "secondary";
  action:
    | "create_task"
    | "order"
    | "reminder"
    | "create_project_landscape"
    | "materials"
    | "plan_30d"
    | "request_photo";
};
type PhotosDemoItem = {
  id: PhotosDemoId;
  title: string;
  src: string;
  submittedBy: string;
  submittedAt: string;
  aiQuestion: string;
  aiVerdict: string;
  aiReason: string;
  aiFindings: string[];
  aiEvidenceRequested: string[];
  aiReferences: string[];
  aiActionDetails: Partial<Record<PhotoAction["action"], string[]>>;
  aiActions: PhotoAction[];
};
type DocPageId = "page-1" | "page-2" | "page-3";
type Severity = "critical" | "medium" | "low";
type Finding = {
  id: string;
  page: DocPageId;
  clauseId: string;
  severity: Severity;
  title: string;
  description: string;
  originalText: string;
  suggestedText: string;
  scoreImpact: number;
};
type ContractClause = {
  id: string;
  page: DocPageId;
  text: string;
};

const KANBAN_COLUMN_LABELS: Record<KanbanColumn, string> = {
  todo: "To do",
  doing: "In progress",
  done: "Done",
};

const INITIAL_KANBAN_STATE: KanbanState = {
  todo: [
    {
      id: "task-order-junction-boxes",
      title: "Order junction boxes",
      assignee: "MK",
      meta: "Due Mar 3",
      linked: "Electrical rough-in",
    },
    {
      id: "task-confirm-tile-layout",
      title: "Confirm tile layout with client",
      assignee: "AV",
      meta: "Due Today",
    },
    {
      id: "task-approve-cabinet-finish",
      title: "Approve cabinet finish sample",
      assignee: "CL",
      meta: "Awaiting decision",
    },
  ],
  doing: [
    {
      id: "task-run-conduit",
      title: "Run conduit to panel",
      assignee: "AV",
      meta: "Evidence: 2 photos",
    },
    {
      id: "task-install-drywall",
      title: "Install drywall in corridor",
      assignee: "VV",
      meta: "Checklist 4/7",
    },
  ],
  done: [
    {
      id: "task-mark-outlets",
      title: "Mark outlet locations",
      assignee: "AV",
      meta: "Completed 2h ago",
    },
    {
      id: "task-demolish-backsplash",
      title: "Demolish old backsplash",
      assignee: "MK",
      meta: "Completed",
    },
  ],
};

const ESTIMATE_ITEMS: EstimateItem[] = [
  {
    id: "estimate-drywall-finishing",
    item: "Drywall + finishing",
    planned: "220k",
    actual: "245k",
    variance: "+25k",
    varianceType: "over",
    linkedTasks: [
      { title: "Install drywall in corridor", status: "In progress" },
      { title: "Paint ceiling coat #1", status: "To do" },
    ],
    receipts: "3 receipts uploaded",
    note: "Additional corner beads and extra sanding after wall irregularities.",
    aiInsight:
      "AI: Variance is consistent with extra prep on uneven substrates. Next time: add a 10% contingency on finishing for old-panel walls.",
  },
  {
    id: "estimate-electrical-materials",
    item: "Electrical materials",
    planned: "180k",
    actual: "165k",
    variance: "-15k",
    varianceType: "under",
    linkedTasks: [{ title: "Run conduit to panel", status: "In progress" }],
    receipts: "2 receipts uploaded",
  },
  {
    id: "estimate-bathroom-tiles-labor",
    item: "Bathroom tiles + labor",
    planned: "310k",
    actual: "310k",
    variance: "0",
    varianceType: "on-track",
    linkedTasks: [{ title: "Confirm tile layout with client", status: "To do" }],
    receipts: "4 receipts uploaded",
  },
  {
    id: "estimate-doors-installation",
    item: "Doors installation",
    planned: "90k",
    actual: "0",
    variance: "not started",
    varianceType: "pending",
    linkedTasks: [{ title: "Approve cabinet finish sample", status: "To do" }],
    receipts: "No receipts uploaded",
  },
];

const PROCUREMENT_ITEMS: ProcurementItem[] = [
  {
    id: "proc-drywall-sheets",
    material: "Drywall sheets",
    neededQty: 120,
    orderedQty: 120,
    receivedQty: 80,
    supplier: "BuildMart LLC",
    eta: "Mar 4",
    committedCost: "₽165,000",
    linkedTaskName: "Install drywall in corridor",
    linkedEstimate: "Drywall + finishing",
  },
  {
    id: "proc-tile-adhesive",
    material: "Tile adhesive",
    neededQty: 20,
    orderedQty: 0,
    receivedQty: 0,
    supplier: "KeramPro",
    eta: "—",
    committedCost: "₽42,000",
    linkedTaskName: "Tile installation",
    linkedEstimate: "Bathroom tiles + labor",
  },
  {
    id: "proc-electrical-cable-roll",
    material: "Electrical cable roll",
    neededQty: 6,
    orderedQty: 6,
    receivedQty: 6,
    supplier: "ElectroHub",
    eta: "Mar 1",
    committedCost: "₽55,000",
    linkedTaskName: "Run conduit to panel",
    linkedEstimate: "Electrical materials",
  },
  {
    id: "proc-interior-doors",
    material: "Interior doors",
    neededQty: 6,
    orderedQty: 6,
    receivedQty: 0,
    supplier: "DoorLine",
    eta: "Mar 6",
    committedCost: "₽58,000",
    linkedTaskName: "Doors installation",
    linkedEstimate: "Doors installation",
  },
];

const PHOTOS_ANALYSIS_STEPS = ["Analyzing image...", "Checking standards...", "Drafting action plan..."];

const PHOTOS_DEMO: PhotosDemoItem[] = [
  {
    id: "photo-tile",
    title: "Tile lippage check",
    src: "/demo/photos/tile-defect-lippage.png",
    submittedBy: "AV",
    submittedAt: "8m ago",
    aiQuestion: "Check this tile installation. Is the lippage acceptable and what’s the correct fix?",
    aiVerdict: "Needs rework",
    aiReason: "Lippage and grout alignment appear outside acceptable finishing tolerance in the visible zone.",
    aiFindings: [
      "Edge offset appears above target plane on multiple adjacent tiles.",
      "Grout line width variation indicates inconsistent bedding depth.",
      "Defect location increases slip and moisture-retention risk.",
    ],
    aiEvidenceRequested: [
      "2 m straightedge photo with feeler gauge reading.",
      "Close-up of three worst joints before removal.",
      "Adhesive coverage photo after first tile lift.",
    ],
    aiReferences: [
      "EN 14411",
      "Adhesive datasheet (Mapei Keraflex / equivalent)",
      "Wet-area tile installation best practice",
    ],
    aiActionDetails: {
      create_task: [
        "Create task: Re-bed raised corridor tiles.",
        "Attach straightedge measurements and photos.",
        "Set acceptance gate: max 1 mm lippage before signoff.",
      ],
      order: [
        "Order leveling clips and wedges for one correction cycle.",
        "Add fresh C2-class adhesive and replacement spacers.",
        "Confirm delivery before rework slot starts.",
      ],
      reminder: [
        "Request contractor quote for affected square meterage.",
        "Include removal, reset, and cleanup in one line item.",
        "Set reminder to review quote same day.",
      ],
    },
    aiActions: [
      { label: "Create fix task", kind: "primary", action: "create_task" },
      { label: "Order leveling clips", kind: "secondary", action: "order" },
      { label: "Ask contractor for rework quote", kind: "secondary", action: "reminder" },
    ],
  },
  {
    id: "photo-crack",
    title: "Window corner crack",
    src: "/demo/photos/plaster-corner-crack.png",
    submittedBy: "MK",
    submittedAt: "2h ago",
    aiQuestion: "Hairline crack near window corner. Cause and best repair approach?",
    aiVerdict: "Acceptable with notes",
    aiReason: "Pattern matches movement stress near opening corner with likely weak local reinforcement.",
    aiFindings: [
      "Crack trajectory follows a high-stress corner path from the window edge.",
      "No visible branching suggests localized finish-layer issue.",
      "Repair should include mesh reinforcement to prevent recurrence.",
    ],
    aiEvidenceRequested: [
      "Corner photo after V-groove opening and cleaning.",
      "Photo confirming mesh overlap beyond crack line.",
      "Follow-up photo after primer coat.",
    ],
    aiReferences: [
      "Knauf reinforcement guidance",
      "Corner stress reinforcement practice",
    ],
    aiActionDetails: {
      create_task: [
        "Create task: Repair window corner crack.",
        "Sequence: groove, mesh, flexible filler, repaint.",
        "Set check: no re-opening after first week.",
      ],
      order: [
        "Order fiberglass mesh tape and elastic filler.",
        "Include fine-grit sanding sheets and primer.",
        "Reserve enough material for two passes.",
      ],
      reminder: [
        "Add 14-day inspection reminder.",
        "Check if crack width changes after repaint.",
        "Escalate to frame anchoring check if reopened.",
      ],
    },
    aiActions: [
      { label: "Create repair task", kind: "primary", action: "create_task" },
      { label: "Order mesh tape + elastic filler", kind: "secondary", action: "order" },
      { label: "Add inspection reminder", kind: "secondary", action: "reminder" },
    ],
  },
  {
    id: "photo-insulation",
    title: "Insulation assembly ID",
    src: "/demo/photos/insulation-vapor-barrier.png",
    submittedBy: "Client",
    submittedAt: "Yesterday",
    aiQuestion: "What materials are shown and is the vapor barrier installed correctly?",
    aiVerdict: "Proceed with QA checks",
    aiReason: "Assembly appears correct in principle, but seam continuity is not fully verifiable from this angle.",
    aiFindings: [
      "Mineral wool infill between studs appears consistent (~100 mm class).",
      "Polyethylene barrier is present but seam taping is incomplete.",
      "Untaped joints may reduce thermal performance and raise condensation risk.",
    ],
    aiEvidenceRequested: [
      "Close-up photos of all membrane seams.",
      "Corner and outlet penetration sealing photos.",
      "One full-bay continuity photo before cladding.",
    ],
    aiReferences: [
      "Rockwool / Knauf installation guides",
      "DIN 4108 vapor-control principles",
    ],
    aiActionDetails: {
      create_task: [
        "Create QA checklist task for barrier continuity.",
        "Add checkpoints for seams, corners, and penetrations.",
        "Require signoff photos before wall closure.",
      ],
      order: [
        "Order additional sealing tape for all exposed joints.",
        "Include membrane patch material for puncture repair.",
        "Confirm compatibility with installed film.",
      ],
      request_photo: [
        "Request close-up seam photos every 2-3 meters.",
        "Request outlet and corner photos with tape visible.",
        "Mark each photo by room and wall segment.",
      ],
    },
    aiActions: [
      { label: "Create QA checklist task", kind: "primary", action: "create_task" },
      { label: "Order sealing tape", kind: "secondary", action: "order" },
      { label: "Request photo of seams", kind: "secondary", action: "request_photo" },
    ],
  },
  {
    id: "photo-landscape",
    title: "Vacation house landscape plan",
    src: "/demo/photos/landscape-house.png",
    submittedBy: "Client",
    submittedAt: "Today",
    aiQuestion: "Plan a practical landscape design around this vacation house. Prioritize drainage, low maintenance, and a clean modern look.",
    aiVerdict: "Concept approved",
    aiReason: "Site is suitable for phased low-maintenance landscape delivery with drainage-first sequencing.",
    aiFindings: [
      "Drainage correction should precede planting and paving to avoid rework.",
      "Simple modern hardscape geometry suits current house lines.",
      "Native layered planting can reduce upkeep while keeping year-round structure.",
    ],
    aiEvidenceRequested: [
      "Quick slope map with low-point markers.",
      "Foundation distance check for planned planting zones.",
      "Night photo to place low-voltage lighting routes.",
    ],
    aiReferences: [
      "Residential drainage best practices",
      "Low-maintenance planting guides",
      "Landscape lighting standards",
    ],
    aiActionDetails: {
      create_project_landscape: [
        "Create landscape project with 5 phases: survey, drainage, hardscape, planting, lighting.",
        "Set phase gates and acceptance criteria per stage.",
        "Prefill kickoff prompt for immediate planning.",
      ],
      materials: [
        "Generate materials list by phase and supplier category.",
        "Separate drainage, hardscape, and planting packages.",
        "Include contingency line for soil amendments.",
      ],
      plan_30d: [
        "Create 30-day schedule with week-by-week milestones.",
        "Reserve first week for survey and drainage setup.",
        "Set handoff checkpoints to avoid scope drift.",
      ],
    },
    aiActions: [
      { label: "Create project: Landscape design", kind: "primary", action: "create_project_landscape" },
      { label: "Generate materials list", kind: "secondary", action: "materials" },
      { label: "Create 30-day plan", kind: "secondary", action: "plan_30d" },
    ],
  },
];

const DOC_SCAN_STEPS = ["Reading clauses...", "Checking risk patterns...", "Drafting corrective edits..."];
const BASE_SAFE_SCORE = 63;
const MAX_SAFE_SCORE = 100;
const DOC_PAGE_ORDER: DocPageId[] = ["page-1", "page-2", "page-3"];
const DOC_PAGE_LABELS: Record<DocPageId, string> = {
  "page-1": "Page 1",
  "page-2": "Page 2",
  "page-3": "Page 3",
};
const DOC_SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Critical",
  medium: "Medium",
  low: "Low",
};
const DOC_SEVERITY_CLAUSE_CLASSES: Record<Severity, string> = {
  critical: "border-l-4 border-l-rose-500/80 bg-rose-500/10",
  medium: "border-l-4 border-l-amber-500/80 bg-amber-500/10",
  low: "border-l-4 border-l-sky-500/80 bg-sky-500/10",
};
const DOC_APPLIED_CLAUSE_CLASS = "border-l-4 border-l-emerald-500/80 bg-emerald-500/12";
const DOC_SEVERITY_DOT_CLASSES: Record<Severity, string> = {
  critical: "bg-rose-500",
  medium: "bg-amber-500",
  low: "bg-sky-500",
};
const DOC_SEVERITY_CHIP_CLASSES: Record<Severity, string> = {
  critical: "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  medium: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

const CONTRACT_CLAUSES: ContractClause[] = [
  {
    id: "scope_vague",
    page: "page-1",
    text:
      "The Contractor shall perform renovation works to modernize the apartment interiors as reasonably required to deliver a complete result acceptable to the Client.",
  },
  {
    id: "milestones_vague",
    page: "page-1",
    text:
      "The Works shall be completed in phases according to a mutually agreed schedule, with milestone dates to be coordinated during project execution.",
  },
  {
    id: "payment_terms_unbalanced",
    page: "page-1",
    text:
      "The Client shall pay a 70% advance within three business days of signing, with the remaining amount payable upon final completion; delayed payments permit immediate suspension of all works.",
  },
  {
    id: "penalty_one_sided",
    page: "page-2",
    text:
      "Any delay by the Client in approvals, access, or payments shall incur a penalty of 0.5% of the contract value per day, and no equivalent penalty shall apply to the Contractor.",
  },
  {
    id: "variation_missing",
    page: "page-2",
    text:
      "Additional works requested by the Client may be executed upon instruction and charged at the Contractor's standard rates without requiring a signed variation order.",
  },
  {
    id: "warranty_ambiguous",
    page: "page-2",
    text:
      "The Contractor provides a workmanship warranty for a reasonable period after completion, subject to normal use and maintenance conditions.",
  },
  {
    id: "termination_unilateral",
    page: "page-3",
    text:
      "The Contractor may terminate this Agreement at any time with two days' written notice, with payment due for all completed and planned works up to the termination date.",
  },
  {
    id: "dispute_jurisdiction_unfair",
    page: "page-3",
    text:
      "All disputes shall be resolved exclusively by the courts located at the Contractor's registered office, and the Client waives objection to venue.",
  },
];

const FINDINGS: Finding[] = [
  {
    id: "finding-scope-vague",
    page: "page-1",
    clauseId: "scope_vague",
    severity: "critical",
    title: "Scope is open-ended",
    description: "Undefined deliverables can create billing disputes and quality disagreements.",
    originalText:
      "The Contractor shall perform renovation works to modernize the apartment interiors as reasonably required to deliver a complete result acceptable to the Client.",
    suggestedText:
      "The Contractor shall perform only the works listed in Appendix A (Scope Matrix), including stated quantities, materials, and exclusions; any additional deliverable requires a signed variation order before execution.",
    scoreImpact: 8,
  },
  {
    id: "finding-milestones-vague",
    page: "page-1",
    clauseId: "milestones_vague",
    severity: "medium",
    title: "Milestones are not fixed",
    description: "Missing dates and acceptance gates weaken schedule accountability.",
    originalText:
      "The Works shall be completed in phases according to a mutually agreed schedule, with milestone dates to be coordinated during project execution.",
    suggestedText:
      "The Works shall follow the milestone schedule in Appendix B with fixed target dates, acceptance criteria for each stage, and a written change log for any approved timeline adjustments.",
    scoreImpact: 4,
  },
  {
    id: "finding-penalty-one-sided",
    page: "page-2",
    clauseId: "penalty_one_sided",
    severity: "critical",
    title: "Penalty is one-sided",
    description: "Only the client is exposed to delay penalties.",
    originalText:
      "Any delay by the Client in approvals, access, or payments shall incur a penalty of 0.5% of the contract value per day, and no equivalent penalty shall apply to the Contractor.",
    suggestedText:
      "Delay penalties shall be reciprocal: each party pays 0.2% of affected stage value per day for delays within its control, capped at 10% of the relevant stage value.",
    scoreImpact: 4,
  },
  {
    id: "finding-payment-unbalanced",
    page: "page-1",
    clauseId: "payment_terms_unbalanced",
    severity: "medium",
    title: "Payment terms are unbalanced",
    description: "Large upfront payment and broad suspension rights increase client risk.",
    originalText:
      "The Client shall pay a 70% advance within three business days of signing, with the remaining amount payable upon final completion; delayed payments permit immediate suspension of all works.",
    suggestedText:
      "Payments shall be stage-based: 20% mobilization, 30% after rough-in acceptance, 30% after finishing acceptance, and 20% at final handover; suspension may occur only after a 7-day cure notice for undisputed amounts.",
    scoreImpact: 8,
  },
  {
    id: "finding-variation-missing",
    page: "page-2",
    clauseId: "variation_missing",
    severity: "medium",
    title: "Variation control is missing",
    description: "Extra work can be billed without prior commercial approval.",
    originalText:
      "Additional works requested by the Client may be executed upon instruction and charged at the Contractor's standard rates without requiring a signed variation order.",
    suggestedText:
      "No variation shall be executed unless both parties sign a written variation order specifying scope, price, and schedule impact, except emergency safety works documented within 24 hours.",
    scoreImpact: 4,
  },
  {
    id: "finding-warranty-ambiguous",
    page: "page-2",
    clauseId: "warranty_ambiguous",
    severity: "low",
    title: "Warranty period is ambiguous",
    description: "Undefined duration and remedy process create ambiguity after handover.",
    originalText:
      "The Contractor provides a workmanship warranty for a reasonable period after completion, subject to normal use and maintenance conditions.",
    suggestedText:
      "The Contractor provides a 12-month workmanship warranty from handover; defects reported in writing shall be inspected within 5 business days and remedied within a mutually agreed corrective timeline.",
    scoreImpact: 2,
  },
  {
    id: "finding-termination-unilateral",
    page: "page-3",
    clauseId: "termination_unilateral",
    severity: "critical",
    title: "Termination right is unilateral",
    description: "Contractor can exit quickly without mirrored protection for the client.",
    originalText:
      "The Contractor may terminate this Agreement at any time with two days' written notice, with payment due for all completed and planned works up to the termination date.",
    suggestedText:
      "Either party may terminate for material breach after a 10-day cure period; payment on termination is limited to accepted completed works and documented demobilization costs.",
    scoreImpact: 5,
  },
  {
    id: "finding-dispute-jurisdiction",
    page: "page-3",
    clauseId: "dispute_jurisdiction_unfair",
    severity: "medium",
    title: "Dispute venue is unfair",
    description: "Single-party venue control raises enforcement burden.",
    originalText:
      "All disputes shall be resolved exclusively by the courts located at the Contractor's registered office, and the Client waives objection to venue.",
    suggestedText:
      "Disputes shall first be escalated to executive negotiation for 15 days, then submitted to arbitration in a mutually agreed neutral venue under agreed procedural rules.",
    scoreImpact: 2,
  },
];

const ESTIMATE_VARIANCE_BADGE_CLASSES: Record<EstimateVariance, string> = {
  over: "bg-warning/25 text-foreground border-warning/50",
  under: "bg-info/20 text-foreground border-info/45",
  "on-track": "bg-success/20 text-foreground border-success/45",
  pending: "bg-muted/80 text-muted-foreground border-border",
};

type EstimateExpandedOverride = {
  statusInsight?: string;
  riskLabel?: string;
  riskClass?: string;
};

const ESTIMATE_EXPANDED_OVERRIDES: Partial<Record<EstimateItem["id"], EstimateExpandedOverride>> = {
  "estimate-drywall-finishing": {
    statusInsight: "Additional finishing prep increased labor and material scope.",
  },
  "estimate-electrical-materials": {
    statusInsight: "Bulk purchase discount applied.",
  },
  "estimate-bathroom-tiles-labor": {
    statusInsight: "Client layout confirmation pending before grouting.",
    riskLabel: "Blocked by client",
    riskClass: "bg-warning/20 text-foreground border-warning/45",
  },
  "estimate-doors-installation": {
    statusInsight: "Awaiting supplier invoice.",
    riskLabel: "Payment required",
    riskClass: "bg-warning/15 text-foreground border-warning/40",
  },
};

const CONTROL_CONTENT: Record<ControlTab, ControlPanelContent> = {
  tasks: {
    title: "Task board snapshot",
    rows: [
      { label: "Electrical rough-in", value: "In progress", tone: "text-info" },
      { label: "Plumbing rough-in", value: "Not started", tone: "text-muted-foreground" },
      { label: "Tile installation", value: "Blocked", tone: "text-warning-foreground" },
    ],
    bullets: [
      "Work moves visually, not in chat threads.",
      "Blockers show what’s needed next and who owns it.",
      "Evidence and comments stay attached to execution.",
    ],
  },
  estimate: {
    title: "Estimate control snapshot",
    rows: [
      { label: "Version 2", value: "Approved", tone: "text-success" },
      { label: "Planned", value: "1 240 000 RUB", tone: "text-foreground" },
      { label: "Paid", value: "468 000 RUB", tone: "text-info" },
    ],
    bullets: [
      "Keep approved versions and see exactly what changed.",
      "Track planned vs paid vs remaining in one glance.",
      "Explain variance with receipts and AI notes, not arguments.",
    ],
  },
  procurement: {
    title: "Procurement queue snapshot",
    rows: [
      { label: "To buy", value: "7 items", tone: "text-warning-foreground" },
      { label: "Ordered", value: "4 items", tone: "text-info" },
      { label: "In stock", value: "3 items", tone: "text-success" },
    ],
    bullets: [
      "Material status updates are tied to real task progress.",
      "Receive/order actions update remaining quantities instantly.",
      "Procurement links preserve traceability to estimate sources.",
    ],
  },
  photos: {
    title: "Photo evidence snapshot",
    rows: [
      { label: "Final photos", value: "12", tone: "text-success" },
      { label: "Open reviews", value: "5", tone: "text-warning-foreground" },
      { label: "Linked tasks", value: "19", tone: "text-info" },
    ],
    bullets: [
      "Evidence stays attached to the exact task or stage.",
      "AI turns issues into step-by-step corrective actions.",
      "Identify materials/tools and verify correct installation fast.",
    ],
  },
  documents: {
    title: "Documents snapshot",
    rows: [
      { label: "Contracts", value: "3 active", tone: "text-foreground" },
      { label: "Specs", value: "8 files", tone: "text-info" },
      { label: "Approvals", value: "2 pending", tone: "text-warning-foreground" },
    ],
    bullets: [
      "Draft, active, archived states keep docs lifecycle clear.",
      "Versions are grouped by document, not scattered in chat.",
      "Document activity can trigger team notifications.",
    ],
  },
  activity: {
    title: "Activity stream snapshot",
    rows: [
      { label: "Task completed", value: "2m ago", tone: "text-success" },
      { label: "Photo uploaded", value: "8m ago", tone: "text-info" },
      { label: "Comment added", value: "11m ago", tone: "text-foreground" },
    ],
    bullets: [
      "Every action is visible in a chronological project timeline.",
      "Notifications highlight changes that need your decision.",
      "Team accountability is built in without external tools.",
    ],
  },
};

function getProgressLabel(progress: number): string {
  if (progress >= 100) return "Done";
  if (progress > 0) return "In progress";
  return "Draft";
}

function getEstimateVarianceLabel(row: EstimateItem): string {
  const absoluteVariance = row.variance.replace(/^[-+]/, "");
  if (row.varianceType === "over") return `Over +₽${absoluteVariance}`;
  if (row.varianceType === "under") return `Saved -₽${absoluteVariance}`;
  if (row.varianceType === "on-track") return "On track";
  return "To be paid";
}

function getDefaultRiskFromVariance(varianceType: EstimateVariance): string {
  if (varianceType === "over") return "Over budget";
  if (varianceType === "under") return "Within budget";
  if (varianceType === "on-track") return "On track";
  return "Payment required";
}

function getDefaultRiskClassFromVariance(varianceType: EstimateVariance): string {
  if (varianceType === "over") return "bg-warning/20 text-foreground border-warning/45";
  if (varianceType === "under") return "bg-success/20 text-foreground border-success/45";
  if (varianceType === "on-track") return "bg-info/20 text-foreground border-info/45";
  return "bg-warning/15 text-foreground border-warning/40";
}

function getExpandedDetails(row: EstimateItem): Required<EstimateExpandedOverride> {
  const override = ESTIMATE_EXPANDED_OVERRIDES[row.id] ?? {};
  return {
    statusInsight: override.statusInsight ?? "Awaiting next update.",
    riskLabel: override.riskLabel ?? getDefaultRiskFromVariance(row.varianceType),
    riskClass: override.riskClass ?? getDefaultRiskClassFromVariance(row.varianceType),
  };
}

function getProcStatus({
  needed,
  ordered,
  received,
  delayed,
}: {
  needed: number;
  ordered: number;
  received: number;
  delayed?: boolean;
}): { label: ProcurementStatusLabel; className: string } {
  if (delayed) {
    return { label: "Delayed", className: "border-warning/50 bg-warning/20 text-foreground transition-colors duration-300" };
  }
  if (ordered === 0 && received === 0) {
    return { label: "To buy", className: "border-border bg-muted/70 text-muted-foreground transition-colors duration-300" };
  }
  if (ordered > 0 && received === 0) {
    return { label: "Ordered", className: "border-info/45 bg-info/20 text-foreground transition-colors duration-300" };
  }
  if (received >= needed) {
    return { label: "In stock", className: "border-success/45 bg-success/20 text-foreground transition-colors duration-300" };
  }
  return { label: "Partial", className: "border-warning/45 bg-warning/20 text-foreground transition-colors duration-300" };
}

function getInitialProcurementReceived(): Record<string, number> {
  return PROCUREMENT_ITEMS.reduce<Record<string, number>>((acc, item) => {
    acc[item.id] = item.receivedQty;
    return acc;
  }, {});
}

function getInitialProcurementReady(): Record<string, boolean> {
  return PROCUREMENT_ITEMS.reduce<Record<string, boolean>>((acc, item) => {
    acc[item.id] = item.receivedQty >= item.neededQty;
    return acc;
  }, {});
}

function getPhotoActionClasses(kind: PhotoAction["kind"], isActive: boolean): string {
  const shared = "inline-flex items-center rounded-pill border px-2.5 py-1 text-caption font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success";
  const emphasis =
    kind === "primary"
      ? "border-success/50 bg-success/20 text-foreground shadow-[0_0_0_1px_rgba(34,197,94,0.22)] hover:bg-success/30"
      : "border-success/35 bg-success/10 text-foreground hover:bg-success/20";
  const active = isActive
    ? "ring-1 ring-success/65 shadow-[0_0_0_1px_rgba(34,197,94,0.35)]"
    : "";

  return `${shared} ${emphasis} ${active}`;
}

export default function Landing() {
  const projects = useProjects();
  const currentUser = useCurrentUser();
  const isGuest = !isAuthenticated();
  const createProjectTo = isGuest ? "/auth/signup" : "/home";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [isDark, setIsDark] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activeControlTab, setActiveControlTab] = useState<ControlTab>("tasks");
  const [communityEmail, setCommunityEmail] = useState("");
  const [kanban, setKanban] = useState<KanbanState>(INITIAL_KANBAN_STATE);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragSourceColumn, setDragSourceColumn] = useState<KanbanColumn | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<KanbanColumn | null>(null);
  const [dropMessage, setDropMessage] = useState<string | null>(null);
  const [movedTaskId, setMovedTaskId] = useState<string | null>(null);
  const [sparkleTaskId, setSparkleTaskId] = useState<string | null>(null);
  const [expandedEstimateItemId, setExpandedEstimateItemId] = useState<string | null>(null);
  const [procurementReceived, setProcurementReceived] = useState<Record<string, number>>(() =>
    getInitialProcurementReceived(),
  );
  const [expandedProcurementId, setExpandedProcurementId] = useState<string>(PROCUREMENT_ITEMS[0]?.id ?? "");
  const [procurementWasReady, setProcurementWasReady] = useState<Record<string, boolean>>(() =>
    getInitialProcurementReady(),
  );
  const [wowFlash, setWowFlash] = useState<{ materialId: string | null; on: boolean }>({
    materialId: null,
    on: false,
  });
  const [wowToast, setWowToast] = useState<string | null>(null);
  const [activePhotoId, setActivePhotoId] = useState<PhotosDemoId | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStepIndex, setAnalysisStepIndex] = useState(0);
  const [showPhotoAnswer, setShowPhotoAnswer] = useState(false);
  const [activePhotoAction, setActivePhotoAction] = useState<PhotoAction["action"] | null>(null);
  const [showPhotoActionDetails, setShowPhotoActionDetails] = useState(false);
  const [photoInlineToast, setPhotoInlineToast] = useState<string | null>(null);
  const docViewerRef = useRef<HTMLDivElement | null>(null);
  const [docViewerHeightPx, setDocViewerHeightPx] = useState<number | null>(null);
  const [activeDocPage, setActiveDocPage] = useState<DocPageId>("page-1");
  const [isDocScanning, setIsDocScanning] = useState(false);
  const [docScanStepIndex, setDocScanStepIndex] = useState(0);
  const [hasDocScanned, setHasDocScanned] = useState(false);
  const [appliedFixes, setAppliedFixes] = useState<Record<string, boolean>>({});
  const [displaySafeScore, setDisplaySafeScore] = useState(BASE_SAFE_SCORE);
  const [showCleanVersionPanel, setShowCleanVersionPanel] = useState(false);
  const [pulsingClauseId, setPulsingClauseId] = useState<string | null>(null);
  const kanbanTimersRef = useRef<number[]>([]);
  const wowFlashTimerRef = useRef<number | null>(null);
  const wowToastTimerRef = useRef<number | null>(null);
  const analysisRunIdRef = useRef(0);
  const analysisFinishTimerRef = useRef<number | null>(null);
  const analysisStepTimerRef = useRef<number | null>(null);
  const photoActionToastTimerRef = useRef<number | null>(null);
  const docScanFinishTimerRef = useRef<number | null>(null);
  const docScanStepTimerRef = useRef<number | null>(null);
  const safeScoreAnimTimerRef = useRef<number | null>(null);
  const docClausePulseTimerRef = useRef<number | null>(null);

  const demoProjects = useMemo(
    () => projects.filter((project) => project.owner_id === currentUser.id).slice(0, 3),
    [projects, currentUser.id],
  );

  const procurementView = useMemo(
    () =>
      PROCUREMENT_ITEMS.map((item) => {
        const received = procurementReceived[item.id] ?? item.receivedQty;
        const remaining = Math.max(item.neededQty - received, 0);
        const isReady = received >= item.neededQty;
        return {
          ...item,
          received,
          remaining,
          isReady,
          status: getProcStatus({
            needed: item.neededQty,
            ordered: item.orderedQty,
            received,
            delayed: item.delayed,
          }),
        };
      }),
    [procurementReceived],
  );

  const procurementSummary = useMemo(
    () => ({
      totalItems: procurementView.length,
      partialCount: procurementView.filter((item) => item.status.label === "Partial").length,
      waitingCount: procurementView.filter((item) => !item.isReady).length,
    }),
    [procurementView],
  );

  const activePhoto = useMemo(() => PHOTOS_DEMO.find((photo) => photo.id === activePhotoId) ?? null, [activePhotoId]);
  const activePhotoActionDetails = useMemo(() => {
    if (!activePhoto || !activePhotoAction) return [];
    return activePhoto.aiActionDetails[activePhotoAction] ?? [];
  }, [activePhoto, activePhotoAction]);
  const findingsByPage = useMemo(
    () =>
      FINDINGS.reduce<Record<DocPageId, Finding[]>>(
        (acc, finding) => {
          acc[finding.page].push(finding);
          return acc;
        },
        { "page-1": [], "page-2": [], "page-3": [] },
      ),
    [],
  );
  const findingByClauseId = useMemo(
    () =>
      FINDINGS.reduce<Record<string, Finding>>((acc, finding) => {
        acc[finding.clauseId] = finding;
        return acc;
      }, {}),
    [],
  );
  const docClausesForActivePage = useMemo(
    () => CONTRACT_CLAUSES.filter((clause) => clause.page === activeDocPage),
    [activeDocPage],
  );
  const targetSafeScoreRaw = useMemo(
    () =>
      FINDINGS.reduce((score, finding) => {
        if (!appliedFixes[finding.id]) return score;
        return score + finding.scoreImpact;
      }, BASE_SAFE_SCORE),
    [appliedFixes],
  );
  const targetSafeScore = useMemo(
    () => Math.min(MAX_SAFE_SCORE, targetSafeScoreRaw),
    [targetSafeScoreRaw],
  );
  const isSafeToSign = targetSafeScore >= MAX_SAFE_SCORE;

  const clearPhotoAnalysisTimers = () => {
    if (analysisFinishTimerRef.current) window.clearTimeout(analysisFinishTimerRef.current);
    if (analysisStepTimerRef.current) window.clearInterval(analysisStepTimerRef.current);
    if (photoActionToastTimerRef.current) window.clearTimeout(photoActionToastTimerRef.current);
    analysisFinishTimerRef.current = null;
    analysisStepTimerRef.current = null;
    photoActionToastTimerRef.current = null;
  };
  const clearDocScanTimers = () => {
    if (docScanFinishTimerRef.current) window.clearTimeout(docScanFinishTimerRef.current);
    if (docScanStepTimerRef.current) window.clearInterval(docScanStepTimerRef.current);
    docScanFinishTimerRef.current = null;
    docScanStepTimerRef.current = null;
  };

  useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_KEY);
    const theme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark";
    setIsDark(theme === "dark");
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (!storedTheme) {
      localStorage.setItem(THEME_KEY, theme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (activeControlTab !== "documents") return;
    const node = docViewerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const updateHeight = () => {
      const nextHeight = Math.round(node.getBoundingClientRect().height);
      if (nextHeight > 0) setDocViewerHeightPx(nextHeight);
    };

    updateHeight();
    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(node);

    return () => observer.disconnect();
  }, [activeControlTab]);

  useEffect(() => {
    if (safeScoreAnimTimerRef.current) {
      window.clearInterval(safeScoreAnimTimerRef.current);
      safeScoreAnimTimerRef.current = null;
    }

    safeScoreAnimTimerRef.current = window.setInterval(() => {
      setDisplaySafeScore((prev) => {
        if (prev === targetSafeScore) {
          if (safeScoreAnimTimerRef.current) window.clearInterval(safeScoreAnimTimerRef.current);
          safeScoreAnimTimerRef.current = null;
          return prev;
        }

        const direction = targetSafeScore > prev ? 1 : -1;
        const totalDistance = Math.abs(targetSafeScore - prev);
        const steps = Math.max(8, Math.ceil(320 / 20));
        const stepSize = Math.max(1, Math.ceil(totalDistance / steps));
        const next = prev + direction * stepSize;
        const reached = direction > 0 ? next >= targetSafeScore : next <= targetSafeScore;
        if (reached) {
          if (safeScoreAnimTimerRef.current) window.clearInterval(safeScoreAnimTimerRef.current);
          safeScoreAnimTimerRef.current = null;
          return targetSafeScore;
        }
        return next;
      });
    }, 20);

    return () => {
      if (safeScoreAnimTimerRef.current) {
        window.clearInterval(safeScoreAnimTimerRef.current);
        safeScoreAnimTimerRef.current = null;
      }
    };
  }, [targetSafeScore]);

  useEffect(
    () => () => {
      kanbanTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      kanbanTimersRef.current = [];
      if (wowFlashTimerRef.current) window.clearTimeout(wowFlashTimerRef.current);
      if (wowToastTimerRef.current) window.clearTimeout(wowToastTimerRef.current);
      if (analysisFinishTimerRef.current) window.clearTimeout(analysisFinishTimerRef.current);
      if (analysisStepTimerRef.current) window.clearInterval(analysisStepTimerRef.current);
      if (photoActionToastTimerRef.current) window.clearTimeout(photoActionToastTimerRef.current);
      if (docScanFinishTimerRef.current) window.clearTimeout(docScanFinishTimerRef.current);
      if (docScanStepTimerRef.current) window.clearInterval(docScanStepTimerRef.current);
      if (safeScoreAnimTimerRef.current) window.clearInterval(safeScoreAnimTimerRef.current);
      if (docClausePulseTimerRef.current) window.clearTimeout(docClausePulseTimerRef.current);
    },
    [],
  );

  const addFiles = (incoming: File[]) => {
    setSelectedFiles((prev) => {
      const existing = new Set(prev.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      const deduped = incoming.filter((file) => !existing.has(`${file.name}-${file.size}-${file.lastModified}`));
      return [...prev, ...deduped];
    });
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (event.dataTransfer.files.length > 0) {
      addFiles(Array.from(event.dataTransfer.files));
    }
  };

  const handleBrowseFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      addFiles(Array.from(event.target.files));
      event.target.value = "";
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const scrollToSection = (id: string) => {
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleMobileScroll = (id: string) => {
    scrollToSection(id);
    setMobileMenuOpen(false);
  };

  const handleCommunitySubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!communityEmail.trim()) return;
    toast({ title: "Saved (mock)" });
    setCommunityEmail("");
  };

  const handleTaskDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    taskId: string,
    sourceColumn: KanbanColumn,
  ) => {
    setDraggingTaskId(taskId);
    setDragSourceColumn(sourceColumn);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
  };

  const handleColumnDragOver = (event: React.DragEvent<HTMLDivElement>, targetColumn: KanbanColumn) => {
    event.preventDefault();
    if (dragOverColumn !== targetColumn) {
      setDragOverColumn(targetColumn);
    }
  };

  const handleColumnDrop = (targetColumn: KanbanColumn) => {
    if (!draggingTaskId || !dragSourceColumn) return;

    setKanban((prev) => {
      const sourceTasks = prev[dragSourceColumn];
      const draggedTask = sourceTasks.find((task) => task.id === draggingTaskId);
      if (!draggedTask) return prev;

      const nextSourceTasks = sourceTasks.filter((task) => task.id !== draggingTaskId);
      if (dragSourceColumn === targetColumn) {
        return {
          ...prev,
          [targetColumn]: [...nextSourceTasks, draggedTask],
        };
      }

      return {
        ...prev,
        [dragSourceColumn]: nextSourceTasks,
        [targetColumn]: [...prev[targetColumn], draggedTask],
      };
    });

    kanbanTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    kanbanTimersRef.current = [];

    setDropMessage(`Moved to ${KANBAN_COLUMN_LABELS[targetColumn]}`);
    setMovedTaskId(draggingTaskId);
    setSparkleTaskId(draggingTaskId);
    setDraggingTaskId(null);
    setDragSourceColumn(null);
    setDragOverColumn(null);

    const pulseTimer = window.setTimeout(() => setMovedTaskId(null), 320);
    const sparkleTimer = window.setTimeout(() => setSparkleTaskId(null), 450);
    const messageTimer = window.setTimeout(() => setDropMessage(null), 1400);
    kanbanTimersRef.current.push(pulseTimer, sparkleTimer, messageTimer);
  };

  const handleProcurementReceivedChange = (item: ProcurementItem, nextValue: number) => {
    const clampedValue = Math.min(item.neededQty, Math.max(0, nextValue));
    const wasReady = procurementWasReady[item.id] ?? item.receivedQty >= item.neededQty;
    const isReady = clampedValue >= item.neededQty;

    setProcurementReceived((prev) => ({ ...prev, [item.id]: clampedValue }));
    setProcurementWasReady((prev) => ({ ...prev, [item.id]: isReady }));

    if (!wasReady && isReady) {
      if (wowFlashTimerRef.current) window.clearTimeout(wowFlashTimerRef.current);
      if (wowToastTimerRef.current) window.clearTimeout(wowToastTimerRef.current);

      setWowFlash({ materialId: item.id, on: true });
      setWowToast("Materials complete. Task ready.");

      wowFlashTimerRef.current = window.setTimeout(() => {
        setWowFlash((prev) => (prev.materialId === item.id ? { materialId: item.id, on: false } : prev));
      }, 900);

      wowToastTimerRef.current = window.setTimeout(() => {
        setWowToast(null);
      }, 1200);
    }
  };

  const startPhotoAnalysis = (photoId: PhotosDemoId) => {
    analysisRunIdRef.current += 1;
    const runId = analysisRunIdRef.current;

    clearPhotoAnalysisTimers();
    setActivePhotoId(photoId);
    setIsAnalyzing(true);
    setAnalysisStepIndex(0);
    setShowPhotoAnswer(false);
    setActivePhotoAction(null);
    setShowPhotoActionDetails(false);
    setPhotoInlineToast(null);

    analysisStepTimerRef.current = window.setInterval(() => {
      if (analysisRunIdRef.current !== runId) return;
      setAnalysisStepIndex((prev) => (prev + 1) % PHOTOS_ANALYSIS_STEPS.length);
    }, 800);

    analysisFinishTimerRef.current = window.setTimeout(() => {
      if (analysisRunIdRef.current !== runId) return;
      if (analysisStepTimerRef.current) {
        window.clearInterval(analysisStepTimerRef.current);
        analysisStepTimerRef.current = null;
      }

      setIsAnalyzing(false);
      setShowPhotoAnswer(true);
    }, 3400);
  };

  const handleBackFromPhotoAnalysis = () => {
    analysisRunIdRef.current += 1;
    clearPhotoAnalysisTimers();
    setActivePhotoId(null);
    setIsAnalyzing(false);
    setShowPhotoAnswer(false);
    setAnalysisStepIndex(0);
    setActivePhotoAction(null);
    setShowPhotoActionDetails(false);
    setPhotoInlineToast(null);
  };

  const handlePhotoAction = (action: PhotoAction, photo: PhotosDemoItem) => {
    if (photoActionToastTimerRef.current) window.clearTimeout(photoActionToastTimerRef.current);

    setActivePhotoAction(action.action);
    setShowPhotoActionDetails(true);

    let toastMessage = "Action saved in draft.";
    if (action.action === "create_task") toastMessage = `Task created: ${photo.title} review (Draft)`;
    if (action.action === "order") toastMessage = "Draft order list prepared.";
    if (action.action === "reminder") toastMessage = "Reminder added to project timeline.";
    if (action.action === "request_photo") toastMessage = "Request sent: upload close-up seam photos.";
    if (action.action === "materials") toastMessage = "Materials list generated (Draft).";
    if (action.action === "plan_30d") toastMessage = "30-day implementation plan drafted.";

    if (action.action === "create_project_landscape") {
      setPromptText("Create a landscape design project for my vacation house");
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (promptTextareaRef.current) {
        window.setTimeout(() => promptTextareaRef.current?.focus(), 350);
        toastMessage = "Project draft prepared in the prompt above.";
      } else {
        toastMessage = "Prompt prefilled above";
      }
    }

    setPhotoInlineToast(toastMessage);
    photoActionToastTimerRef.current = window.setTimeout(() => {
      setPhotoInlineToast(null);
    }, 1400);
  };

  const startDocScan = () => {
    if (isDocScanning || hasDocScanned) return;

    clearDocScanTimers();
    setIsDocScanning(true);
    setHasDocScanned(false);
    setDocScanStepIndex(0);
    setShowCleanVersionPanel(false);

    docScanStepTimerRef.current = window.setInterval(() => {
      setDocScanStepIndex((prev) => (prev + 1) % DOC_SCAN_STEPS.length);
    }, 850);

    docScanFinishTimerRef.current = window.setTimeout(() => {
      clearDocScanTimers();
      setIsDocScanning(false);
      setHasDocScanned(true);
    }, 3200);
  };

  const toggleFix = (findingId: string) => {
    if (!hasDocScanned || isDocScanning) return;

    const finding = FINDINGS.find((item) => item.id === findingId);
    if (!finding) return;

    if (finding.page !== activeDocPage) {
      setActiveDocPage(finding.page);
    }

    setAppliedFixes((prev) => ({ ...prev, [findingId]: !prev[findingId] }));
    setPulsingClauseId(finding.clauseId);
    setShowCleanVersionPanel(false);

    if (docClausePulseTimerRef.current) window.clearTimeout(docClausePulseTimerRef.current);
    docClausePulseTimerRef.current = window.setTimeout(() => {
      setPulsingClauseId((prev) => (prev === finding.clauseId ? null : prev));
      docClausePulseTimerRef.current = null;
    }, 480);
  };

  const handlePrepareCleanVersion = () => {
    if (!isSafeToSign) return;
    setShowCleanVersionPanel(true);
  };

  const handlePrepareEmail = () => {
    toast({ title: "Draft prepared (demo)" });
  };

  const handleTaskDragEnd = () => {
    setDraggingTaskId(null);
    setDragSourceColumn(null);
    setDragOverColumn(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header
        className={`sticky top-0 z-50 border-b border-border transition-all duration-200 ${
          isScrolled ? "bg-background/90 py-2 backdrop-blur-xl" : "bg-background/70 py-3 backdrop-blur-md"
        }`}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-sp-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent via-info to-warning text-accent-foreground shadow-md">
              <Hammer className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-body font-semibold text-foreground">СтройАгент</p>
              <p className="text-caption text-muted-foreground">AI-first construction workspace</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            <button onClick={() => scrollToSection("resources")} className="rounded-md px-3 py-2 text-body-sm text-muted-foreground transition-colors hover:text-foreground">
              Resources
            </button>
            <Link to="/pricing" className="rounded-md px-3 py-2 text-body-sm text-muted-foreground transition-colors hover:text-foreground">
              Pricing
            </Link>
            <button onClick={() => scrollToSection("community")} className="rounded-md px-3 py-2 text-body-sm text-muted-foreground transition-colors hover:text-foreground">
              Community
            </button>
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsDark((prev) => !prev)}
              className="relative h-9 w-9 overflow-hidden"
            >
              <Sun
                className={`absolute h-4 w-4 transition-all duration-200 ${
                  isDark ? "rotate-180 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
                }`}
              />
              <Moon
                className={`absolute h-4 w-4 transition-all duration-200 ${
                  isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-180 scale-0 opacity-0"
                }`}
              />
              <span className="sr-only">Toggle theme</span>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/auth/login">Log in</Link>
            </Button>
            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/auth/signup">Get started</Link>
            </Button>
          </div>

          <div className="flex items-center gap-1 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsDark((prev) => !prev)}
              className="relative h-9 w-9 overflow-hidden"
            >
              <Sun
                className={`absolute h-4 w-4 transition-all duration-200 ${
                  isDark ? "rotate-180 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
                }`}
              />
              <Moon
                className={`absolute h-4 w-4 transition-all duration-200 ${
                  isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-180 scale-0 opacity-0"
                }`}
              />
              <span className="sr-only">Toggle theme</span>
            </Button>
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="glass-sidebar">
                <SheetHeader>
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <div className="mt-8 space-y-2">
                  <Button variant="ghost" className="w-full justify-start" onClick={() => handleMobileScroll("resources")}>
                    Resources
                  </Button>
                  <Button variant="ghost" asChild className="w-full justify-start">
                    <Link to="/pricing" onClick={() => setMobileMenuOpen(false)}>
                      Pricing
                    </Link>
                  </Button>
                  <Button variant="ghost" className="w-full justify-start" onClick={() => handleMobileScroll("community")}>
                    Community
                  </Button>
                </div>
                <div className="mt-8 space-y-2">
                  <Button variant="outline" asChild className="w-full">
                    <Link to="/auth/login" onClick={() => setMobileMenuOpen(false)}>
                      Log in
                    </Link>
                  </Button>
                  <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                    <Link to="/auth/signup" onClick={() => setMobileMenuOpen(false)}>
                      Get started
                    </Link>
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[680px]">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-accent/10 to-transparent" />
          <div className="absolute left-[10%] top-16 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute right-[8%] top-24 h-56 w-56 rounded-full bg-info/20 blur-3xl" />
        </div>

        <section className="relative mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-3xl items-center px-sp-3 pb-sp-6 pt-sp-4">
          <div className="glass-elevated w-full rounded-panel p-sp-4 sm:p-sp-5">
            <p className="text-caption font-medium text-accent">AI-first construction management</p>
            <h1 className="mt-2 text-h1 text-foreground">Start your project in 60 seconds</h1>
            <p className="mt-2 max-w-2xl text-body text-muted-foreground">
              Describe the work, attach plans and estimates. We generate a structured workspace. Mock-only for now.
            </p>

            <div className="mt-4 space-y-3">
              <div className="rounded-card border border-border bg-background/60 p-sp-2">
                <Textarea
                  ref={promptTextareaRef}
                  value={promptText}
                  onChange={(event) => setPromptText(event.target.value)}
                  className="min-h-[140px] resize-none border-0 bg-transparent p-0 text-body focus-visible:ring-0"
                  placeholder={`Example: Renovate 54m² apartment. Budget 1.2M ₽. Timeline 8 weeks.\nNeed: demolition, plumbing/electric, finishing, materials list.`}
                />
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                className={`rounded-card border-2 border-dashed p-sp-4 transition-colors ${
                  dragActive ? "border-accent bg-accent/10" : "border-border bg-background/40"
                }`}
              >
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 rounded-md bg-accent/10 p-2">
                      <CloudUpload className="h-4 w-4 text-accent" />
                    </span>
                    <div>
                      <p className="text-body-sm font-medium leading-relaxed text-foreground">
                        Drop plans, photos, estimates (PDF/JPG/PNG/DOCX)
                      </p>
                      <p className="text-caption leading-relaxed text-muted-foreground">Attachments stay local in this mock flow.</p>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={handleBrowseFiles}>
                    Browse files
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_FILE_TYPES}
                  onChange={handleFileChange}
                  className="hidden"
                />

                {selectedFiles.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedFiles.map((file, index) => (
                      <span key={`${file.name}-${file.size}-${index}`} className="inline-flex items-center gap-1 rounded-pill border border-border bg-muted/60 px-2.5 py-1 text-caption text-foreground">
                        <Files className="h-3.5 w-3.5 text-muted-foreground" />
                        {file.name}
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                          <span className="sr-only">Remove file</span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <Link to={createProjectTo}>
                    Create project
                    <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section id="demos" className="mx-auto w-full max-w-6xl space-y-3 px-sp-3 py-sp-6">
          <div>
            <h2 className="text-h2 text-foreground">Open a real demo workspace</h2>
            <p className="mt-1 text-body text-muted-foreground">
              One click opens the full UI. Seeded demo projects from the mock account.
            </p>
          </div>

          {demoProjects.length === 0 ? (
            <div className="glass rounded-panel p-sp-3">
              <p className="text-body text-muted-foreground">Demo projects are loading or not available. Please refresh.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-sp-2 md:grid-cols-2 lg:grid-cols-3">
              {demoProjects.map((project) => (
                <Link
                  key={project.id}
                  to={`/project/${project.id}/dashboard`}
                  className="group overflow-hidden rounded-card border border-border bg-card/50 transition-all duration-150 hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <div className="relative h-40 overflow-hidden rounded-t-card isolate bg-muted">
                    <div className="absolute inset-0 transform-gpu will-change-transform [transform:translateZ(0)] [backface-visibility:hidden] transition-transform duration-300 ease-out group-hover:scale-105">
                      <img
                        src={DEMO_COVER_IMAGE_MAP[project.id] ?? "/placeholder.svg"}
                        onError={(event) => {
                          event.currentTarget.src = "/placeholder.svg";
                        }}
                        alt={`${project.title} cover`}
                        className="h-full w-full object-cover object-center"
                      />
                    </div>
                    <span className="absolute left-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/80 text-foreground backdrop-blur">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <span className="absolute right-3 top-3 z-20 rounded-pill bg-background/85 px-2 py-0.5 text-caption font-medium text-foreground">
                      Demo
                    </span>
                  </div>
                  <div className="space-y-2 p-sp-3">
                    <h3 className="truncate text-body font-semibold text-foreground">{project.title}</h3>
                    <div className="flex items-center justify-between text-caption">
                      <span className="rounded-pill bg-muted px-2 py-0.5 text-muted-foreground">{project.type}</span>
                      <span className="text-muted-foreground">{getProgressLabel(project.progress_pct)}</span>
                    </div>
                    <Progress value={project.progress_pct} className="h-1.5" />
                    <p className="text-caption text-muted-foreground">{project.progress_pct}% complete</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section id="resources" className="mx-auto w-full max-w-6xl space-y-3 px-sp-3 py-sp-6">
          <div>
            <h2 className="text-h2 text-foreground">How it works</h2>
            <p className="mt-1 text-body text-muted-foreground">From initial idea to execution control in three predictable steps.</p>
          </div>
          <div className="grid grid-cols-1 gap-sp-2 md:grid-cols-3">
            {[
              {
                icon: Bot,
                title: "Describe the work",
                line1: "AI converts text into stages, tasks, and checklists.",
                line2: "You start with structure, not a blank board.",
              },
              {
                icon: CloudUpload,
                title: "Attach evidence",
                line1: "Plans, photos, estimates, invoices. Everything organized.",
                line2: "Files remain local in this mock setup.",
              },
              {
                icon: Timer,
                title: "Control execution",
                line1: "Statuses, blockers, procurement, and progress by stage.",
                line2: "Every update stays visible to the team.",
              },
            ].map((step, index) => (
              <div key={step.title} className="glass rounded-card p-sp-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent transition-colors group-hover:bg-accent/20">
                    <step.icon className="h-4 w-4" />
                  </span>
                  <span className="text-caption text-muted-foreground">Step {index + 1}</span>
                </div>
                <h3 className="text-body font-semibold text-foreground">{step.title}</h3>
                <p className="mt-1 text-body-sm text-muted-foreground">{step.line1}</p>
                <p className="mt-1 text-caption text-muted-foreground">{step.line2}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl space-y-3 px-sp-3 py-sp-6">
          <div>
            <h2 className="text-h2 text-foreground">Everything in one workspace</h2>
            <p className="mt-1 text-body text-muted-foreground">
              Tasks, estimates, procurement, photos, and documents stay in sync.
            </p>
          </div>

          <Tabs value={activeControlTab} onValueChange={(value) => setActiveControlTab(value as ControlTab)}>
            <div className="rounded-panel border border-border bg-card/50">
              <div className="border-b border-border px-sp-3 py-1.5">
                <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                  <TabsTrigger value="tasks">Tasks</TabsTrigger>
                  <TabsTrigger value="estimate">Estimate</TabsTrigger>
                  <TabsTrigger value="procurement">Procurement</TabsTrigger>
                  <TabsTrigger value="photos">Photos</TabsTrigger>
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                </TabsList>
              </div>

              {(Object.keys(CONTROL_CONTENT) as ControlTab[]).map((tab) => {
                const content = CONTROL_CONTENT[tab];
                return (
                  <TabsContent
                    key={tab}
                    value={tab}
                    className="mt-0 p-sp-3 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-1 duration-200"
                  >
                    <div className="grid grid-cols-1 gap-sp-2 min-w-0">
                    <div className={`glass min-w-0 w-full rounded-card p-sp-3 ${tab === "photos" ? "overflow-hidden" : ""}`}>
                      {tab === "tasks" ? (
                        <>
                          <p className="text-caption text-muted-foreground">{content.title}</p>
                          {dropMessage && <p className="mt-2 text-caption text-accent">{dropMessage}</p>}
                          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                            {(Object.keys(KANBAN_COLUMN_LABELS) as KanbanColumn[]).map((column) => (
                              <div
                                key={column}
                                onDragOver={(event) => handleColumnDragOver(event, column)}
                                onDrop={() => handleColumnDrop(column)}
                                className={`rounded-md border p-2 transition-colors ${
                                  dragOverColumn === column
                                    ? "border-accent bg-accent/10"
                                    : "border-border bg-background/45"
                                }`}
                              >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <span className="text-body-sm font-semibold text-foreground">
                                    {KANBAN_COLUMN_LABELS[column]}
                                  </span>
                                  <span className="rounded-pill bg-muted px-2 py-0.5 text-caption text-muted-foreground">
                                    {kanban[column].length}
                                  </span>
                                </div>
                                <div className="space-y-2">
                                  {kanban[column].map((task) => (
                                    <div
                                      key={task.id}
                                      draggable
                                      tabIndex={0}
                                      onDragStart={(event) => handleTaskDragStart(event, task.id, column)}
                                      onDragEnd={handleTaskDragEnd}
                                      className={`relative rounded-md border border-border bg-card/80 p-2.5 transition-transform duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-grab active:cursor-grabbing ${
                                        movedTaskId === task.id ? "scale-[1.02]" : "scale-100"
                                      }`}
                                    >
                                      {sparkleTaskId === task.id && (
                                        <Sparkles className="pointer-events-none absolute right-1.5 top-1.5 h-3 w-3 text-accent animate-ping" />
                                      )}
                                      <p className="pr-5 text-body-sm font-medium text-foreground">{task.title}</p>
                                      <div className="mt-2 flex items-center gap-2">
                                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-foreground">
                                          {task.assignee}
                                        </span>
                                        <span className="truncate text-caption text-muted-foreground">{task.meta}</span>
                                      </div>
                                      {task.linked && (
                                        <p className="mt-1 truncate text-caption text-info">Linked: {task.linked}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : tab === "estimate" ? (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-body font-semibold text-foreground">Estimate</h3>
                            <span className="rounded-pill border border-success/30 bg-success/10 px-2 py-0.5 text-caption text-success">
                              Version 2 (Approved)
                            </span>
                          </div>
                          <p className="mt-1 text-caption text-muted-foreground">Last updated: 3h ago by MK</p>

                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <div className="rounded-md border border-border bg-background/55 px-2.5 py-2">
                              <p className="text-caption text-muted-foreground">Planned</p>
                              <p className="mt-0.5 text-body-sm font-semibold text-foreground">₽ 1,240,000</p>
                            </div>
                            <div className="rounded-md border border-border bg-background/55 px-2.5 py-2">
                              <p className="text-caption text-muted-foreground">Paid</p>
                              <p className="mt-0.5 text-body-sm font-semibold text-foreground">₽ 468,000</p>
                            </div>
                            <div className="rounded-md border border-border bg-background/55 px-2.5 py-2">
                              <p className="text-caption text-muted-foreground">Remaining</p>
                              <p className="mt-0.5 text-body-sm font-semibold text-foreground">₽ 772,000</p>
                            </div>
                          </div>

                          <div className="mt-3">
                            <p className="mb-1 text-caption text-muted-foreground">Paid ₽468,000 (38%)</p>
                            <Progress value={38} className="h-1.5" />
                          </div>

                          <div className="mt-3 w-full min-w-0">
                            <div className="w-full min-w-0 rounded-md border border-border bg-background/35">
                              <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_28px] border-b border-border px-3 py-2 text-caption font-medium text-muted-foreground">
                                <span>Item</span>
                                <span>Planned</span>
                                <span>Actual</span>
                                <span>Variance</span>
                                <span />
                              </div>
                              {ESTIMATE_ITEMS.map((row) => {
                                const isExpanded = expandedEstimateItemId === row.id;
                                const expandedDetails = getExpandedDetails(row);
                                return (
                                  <div key={row.id}>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedEstimateItemId((prev) => (prev === row.id ? null : row.id))
                                      }
                                      className={`grid w-full grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_28px] items-center px-3 py-2.5 text-left transition-colors hover:bg-background/60 ${
                                        isExpanded ? "border-b-0" : "border-b border-border"
                                      }`}
                                    >
                                      <span className="truncate text-body-sm text-foreground">{row.item}</span>
                                      <span className="text-body-sm text-muted-foreground">{row.planned}</span>
                                      <span className="text-body-sm text-muted-foreground">{row.actual}</span>
                                      <span className="justify-self-start">
                                        <span
                                          className={`inline-flex rounded-pill border px-2 py-0.5 text-caption font-medium ${ESTIMATE_VARIANCE_BADGE_CLASSES[row.varianceType]}`}
                                        >
                                          {getEstimateVarianceLabel(row)}
                                        </span>
                                      </span>
                                      <ChevronDown
                                        className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                                          isExpanded ? "rotate-180" : "rotate-0"
                                        }`}
                                      />
                                    </button>
                                    {isExpanded && (
                                      <div className="space-y-2 border-b border-t border-border/60 bg-background/60 px-3 py-2.5">
                                        <div className="space-y-1">
                                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                                            Linked tasks
                                          </p>
                                          <div className="mt-1 flex flex-wrap gap-1.5">
                                            {row.linkedTasks?.map((task) => (
                                              <span
                                                key={`${row.id}-${task.title}`}
                                                className="inline-flex items-center gap-1 rounded-pill border border-border bg-muted/60 px-2 py-0.5 text-caption text-foreground"
                                              >
                                                {task.title}
                                                <span className="text-muted-foreground">({task.status})</span>
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                                            Receipts
                                          </p>
                                          <p className="text-caption text-muted-foreground">
                                            {row.receipts ?? "No receipts uploaded"}
                                          </p>
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                                            Status insight
                                          </p>
                                          <p className="text-caption text-muted-foreground">{expandedDetails.statusInsight}</p>
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                                            Risk / next action
                                          </p>
                                          <span
                                            className={`inline-flex rounded-pill border px-2 py-0.5 text-caption font-medium ${expandedDetails.riskClass}`}
                                          >
                                            {expandedDetails.riskLabel}
                                          </span>
                                        </div>
                                        {row.varianceType === "over" && row.aiInsight && (
                                          <div className="rounded-md border border-info/30 bg-info/10 px-2 py-1.5">
                                            <p className="text-caption text-foreground">{row.aiInsight}</p>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      ) : tab === "procurement" ? (
                        <>
                          <p className="text-caption text-muted-foreground">{content.title}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="rounded-pill border border-border bg-muted/70 px-2 py-0.5 text-caption text-foreground">
                              {procurementSummary.totalItems} items
                            </span>
                            <span className="rounded-pill border border-warning/45 bg-warning/20 px-2 py-0.5 text-caption text-foreground">
                              {procurementSummary.partialCount} partial
                            </span>
                            <span className="rounded-pill border border-border bg-muted/70 px-2 py-0.5 text-caption text-muted-foreground">
                              {procurementSummary.waitingCount} waiting
                            </span>
                            <span className="rounded-pill border border-info/45 bg-info/20 px-2 py-0.5 text-caption text-foreground">
                              ₽320k committed
                            </span>
                          </div>

                          {wowToast && (
                            <div className="mt-2 rounded-md border border-success/40 bg-success/10 px-2 py-1 text-caption text-success">
                              {wowToast}
                            </div>
                          )}

                          <div className="mt-2 space-y-1.5">
                            {procurementView.map((item) => {
                              const isExpanded = expandedProcurementId === item.id;
                              return (
                                <div key={item.id} className="min-w-0 rounded-md border border-border bg-background/45">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedProcurementId(item.id)}
                                    className="w-full min-w-0 px-2.5 py-2 text-left transition-colors hover:bg-background/60"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="truncate text-body-sm font-medium text-foreground">{item.material}</p>
                                        <p className="truncate text-caption text-muted-foreground">
                                          Received {item.received} / Needed {item.neededQty}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span
                                          className={`inline-flex rounded-pill border px-2 py-0.5 text-caption font-medium ${item.status.className}`}
                                        >
                                          {item.status.label}
                                        </span>
                                        <ChevronDown
                                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                                            isExpanded ? "rotate-180" : "rotate-0"
                                          }`}
                                        />
                                      </div>
                                    </div>
                                    <p className="mt-1 truncate text-caption text-muted-foreground">
                                      Linked task: {item.linkedTaskName}
                                    </p>
                                  </button>

                                  {isExpanded && (
                                    <div className="space-y-2 border-t border-border/60 bg-background/60 px-2.5 py-2">
                                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                        <p className="text-caption text-muted-foreground">
                                          Supplier: <span className="text-foreground">{item.supplier}</span>
                                        </p>
                                        <p className="text-caption text-muted-foreground">
                                          ETA: <span className="text-foreground">{item.eta}</span>
                                        </p>
                                        <p className="truncate text-caption text-muted-foreground">
                                          Linked task: <span className="text-foreground">{item.linkedTaskName}</span>
                                        </p>
                                        <p className="truncate text-caption text-muted-foreground">
                                          Linked estimate: <span className="text-foreground">{item.linkedEstimate}</span>
                                        </p>
                                        <p className="text-caption text-muted-foreground">
                                          Committed cost: <span className="text-foreground">{item.committedCost}</span>
                                        </p>
                                      </div>

                                      <div className="space-y-1.5">
                                        <div className="flex items-center justify-between gap-2 text-caption">
                                          <span className="text-muted-foreground">
                                            Received: {item.received} / {item.neededQty}
                                          </span>
                                          <span
                                            className={`transition-colors duration-300 ${
                                              item.remaining === 0 ? "text-success" : "text-muted-foreground"
                                            }`}
                                          >
                                            Remaining: {item.remaining}
                                          </span>
                                        </div>
                                        <input
                                          type="range"
                                          min={0}
                                          max={item.neededQty}
                                          value={item.received}
                                          onChange={(event) =>
                                            handleProcurementReceivedChange(item, Number(event.target.value))
                                          }
                                          className={`h-1.5 w-full cursor-pointer ${
                                            item.remaining === 0 ? "accent-success" : "accent-accent"
                                          }`}
                                        />
                                      </div>

                                      <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-caption text-muted-foreground">Task readiness</span>
                                        <span
                                          className={`inline-flex rounded-pill border px-2 py-0.5 text-caption font-medium transition-colors duration-300 ${
                                            item.isReady
                                              ? "border-success/45 bg-success/20 text-foreground"
                                              : "border-border bg-muted/70 text-muted-foreground"
                                          } ${
                                            wowFlash.on && wowFlash.materialId === item.id && item.isReady
                                              ? "animate-pulse ring-2 ring-success/25"
                                              : ""
                                          }`}
                                        >
                                          {item.isReady ? "Ready" : "Waiting"}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : tab === "photos" ? (
                        <>
                          <style>{`
                            .ph-grid {
                              background-image:
                                linear-gradient(to right, rgba(148, 163, 184, 0.25) 1px, transparent 1px),
                                linear-gradient(to bottom, rgba(148, 163, 184, 0.25) 1px, transparent 1px);
                              background-size: 14px 14px;
                            }
                            @keyframes phScanLine {
                              0% { transform: translateY(-120%); }
                              100% { transform: translateY(240%); }
                            }
                            .ph-scanline {
                              animation: phScanLine 3.4s linear infinite;
                            }
                            @keyframes phSkeletonShimmer {
                              0% { background-position: 100% 0; }
                              100% { background-position: -100% 0; }
                            }
                            .ph-skeleton {
                              background: linear-gradient(90deg, rgba(148, 163, 184, 0.15) 25%, rgba(148, 163, 184, 0.35) 50%, rgba(148, 163, 184, 0.15) 75%);
                              background-size: 200% 100%;
                              animation: phSkeletonShimmer 1.2s ease-in-out infinite;
                            }
                            @keyframes phInspectorReveal {
                              0% { opacity: 0; transform: translateY(6px); }
                              100% { opacity: 1; transform: translateY(0); }
                            }
                            .ph-inspector-reveal {
                              animation: phInspectorReveal 180ms ease-out;
                            }
                            @keyframes phDetailSwap {
                              0% { opacity: 0; transform: translateY(4px); }
                              100% { opacity: 1; transform: translateY(0); }
                            }
                            .ph-detail-swap {
                              animation: phDetailSwap 180ms ease-out;
                            }
                          `}</style>
                          {activePhoto === null ? (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              {PHOTOS_DEMO.map((photo) => (
                                <div key={photo.id} className="min-w-0 rounded-md border border-border bg-background/45 p-2">
                                  <div className="overflow-hidden rounded-md">
                                    <img
                                      src={photo.src}
                                      alt={photo.title}
                                      className="h-36 w-full transform-gpu object-cover object-center transition-transform duration-300 will-change-transform hover:scale-[1.03] sm:h-40"
                                    />
                                  </div>
                                  <div className="mt-2 rounded-md bg-gradient-to-r from-warning/50 via-accent/45 to-info/45 p-[1px] transition-all duration-200 hover:shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_8px_18px_-12px_rgba(251,191,36,0.5)]">
                                    <button
                                      type="button"
                                      onClick={() => startPhotoAnalysis(photo.id)}
                                      aria-label={`Consult AI for ${photo.title}`}
                                      className="flex w-full items-center justify-center gap-1.5 rounded-[7px] bg-background/90 px-3 py-2 text-caption font-semibold tracking-tight text-foreground drop-shadow-[0_1px_0_rgba(0,0,0,0.45)] shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-background/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                    >
                                      <Sparkles className="h-3.5 w-3.5" />
                                      Consult AI
                                    </button>
                                  </div>
                                  <p className="mt-1 text-center text-caption text-muted-foreground">
                                    {photo.submittedBy} · {photo.submittedAt}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="relative flex min-h-[620px] min-w-0 flex-col overflow-hidden">
                              <div className="mx-auto flex min-h-[620px] w-full max-w-[900px] min-w-0 flex-col">
                                <div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleBackFromPhotoAnalysis}
                                    aria-label="Back to photos grid"
                                    className="h-7 w-7 p-0"
                                  >
                                    <ChevronLeft className="h-4 w-4" />
                                  </Button>
                                </div>

                                <div className="mt-3 flex justify-end">
                                  <div className="mx-auto w-full max-w-[640px] min-w-0">
                                    <div className="relative w-full rounded-[14px] border border-border bg-background/20 overflow-hidden">
                                      <img
                                        src={activePhoto.src}
                                        alt={activePhoto.title}
                                        className="h-[260px] w-full object-contain"
                                      />
                                      {isAnalyzing && (
                                        <>
                                          <div className="ph-grid pointer-events-none absolute inset-0" />
                                          <div className="ph-scanline pointer-events-none absolute left-0 right-0 h-10 bg-gradient-to-b from-accent/10 via-accent/45 to-accent/10" />
                                        </>
                                      )}
                                    </div>

                                    <div className="mt-2 w-full rounded-[14px] border border-border bg-background/40 px-2 py-1 text-right">
                                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/85">You</p>
                                      <p className="text-[14px] leading-snug text-foreground break-words">
                                        {activePhoto.aiQuestion}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 mx-auto w-full max-w-[900px] min-w-0 flex-1 min-h-0">
                                  <div className="flex h-full min-h-0 flex-col rounded-md border border-border bg-background/60 p-3">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                        <Sparkles className="h-3.5 w-3.5 text-accent" />
                                        AI Inspector
                                      </div>
                                      <div className="inline-flex items-center gap-1.5">
                                        {isAnalyzing && (
                                          <span className="inline-flex items-center gap-1">
                                            <span className="h-1 w-1 rounded-full bg-accent/80 animate-pulse" />
                                            <span className="h-1 w-1 rounded-full bg-accent/70 animate-pulse [animation-delay:120ms]" />
                                            <span className="h-1 w-1 rounded-full bg-accent/60 animate-pulse [animation-delay:220ms]" />
                                          </span>
                                        )}
                                        <span className="rounded-pill border border-border bg-muted/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                          AI generated
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex-1 min-h-0 min-w-0 overflow-y-auto pr-1 text-[14px] leading-snug">
                                      {isAnalyzing ? (
                                        <div className="space-y-2">
                                          <p className="text-sm text-muted-foreground">{PHOTOS_ANALYSIS_STEPS[analysisStepIndex]}</p>
                                          <div className="space-y-1.5">
                                            <div className="ph-skeleton h-2 rounded-md" />
                                            <div className="ph-skeleton h-2 w-4/5 rounded-md" />
                                          </div>
                                        </div>
                                      ) : showPhotoAnswer ? (
                                        <div className="ph-inspector-reveal min-w-0 break-words space-y-2.5">
                                          <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div className="min-w-0">
                                              <p className="text-xs font-semibold text-foreground">Verdict</p>
                                              <p className="mt-0.5 text-[14px] leading-snug text-muted-foreground">{activePhoto.aiReason}</p>
                                            </div>
                                            <span className="rounded-pill border border-warning/50 bg-warning/20 px-2 py-0.5 text-caption font-medium text-foreground">
                                              {activePhoto.aiVerdict}
                                            </span>
                                          </div>

                                          <div className="border-t border-border/50 pt-2">
                                            <p className="text-xs font-semibold text-foreground">Findings</p>
                                            <ul className="mt-1 space-y-1">
                                              {activePhoto.aiFindings.slice(0, 3).map((finding) => (
                                                <li key={finding} className="flex items-start gap-1.5 text-[14px] leading-snug text-foreground">
                                                  <span className="mt-1 h-1 w-1 rounded-full bg-warning/80" />
                                                  <span className="break-words">{finding}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>

                                          <div className="border-t border-border/50 pt-2">
                                            <p className="mb-1 text-xs font-semibold text-foreground">Actions</p>
                                            <div className="flex flex-wrap gap-2">
                                              {activePhoto.aiActions.map((action) => (
                                                <button
                                                  key={`${activePhoto.id}-${action.label}`}
                                                  type="button"
                                                  onClick={() => handlePhotoAction(action, activePhoto)}
                                                  className={getPhotoActionClasses(action.kind, activePhotoAction === action.action)}
                                                >
                                                  {action.label}
                                                </button>
                                              ))}
                                            </div>
                                          </div>

                                          <div className="border-t border-border/50 pt-2">
                                            {showPhotoActionDetails && activePhotoAction ? (
                                              <div className="ph-detail-swap space-y-1.5">
                                                <div className="flex flex-wrap items-center gap-2">
                                                  <span className="h-4 w-1 rounded-full bg-success/70" />
                                                  <span className="text-xs font-semibold text-success">Selected action:</span>
                                                  <span className="text-[14px] leading-snug text-foreground">
                                                    {activePhoto.aiActions.find((action) => action.action === activePhotoAction)?.label}
                                                  </span>
                                                </div>
                                                <ul className="space-y-1">
                                                  {activePhotoActionDetails.map((detail) => (
                                                    <li key={detail} className="text-[14px] leading-snug text-muted-foreground break-words">
                                                      • {detail}
                                                    </li>
                                                  ))}
                                                </ul>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setShowPhotoActionDetails(false);
                                                    setActivePhotoAction(null);
                                                  }}
                                                  className="text-caption text-muted-foreground transition-colors hover:text-foreground"
                                                >
                                                  Show summary
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="ph-detail-swap space-y-2">
                                                <div>
                                                  <p className="text-xs font-semibold text-foreground">Evidence requested</p>
                                                  <ul className="mt-1 space-y-1">
                                                    {activePhoto.aiEvidenceRequested.map((item) => (
                                                      <li key={item} className="flex items-start gap-1.5 text-[14px] leading-snug text-muted-foreground">
                                                        <span className="mt-0.5 h-3.5 w-3.5 rounded border border-success/45 bg-success/10" />
                                                        <span className="break-words">{item}</span>
                                                      </li>
                                                    ))}
                                                  </ul>
                                                </div>
                                                <div className="border-t border-border/50 pt-2">
                                                  <p className="text-xs font-semibold text-foreground">References</p>
                                                  <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                                                    {activePhoto.aiReferences.map((reference) => (
                                                      <span
                                                        key={reference}
                                                        className="rounded-pill border border-border bg-muted/70 px-2 py-0.5 text-caption text-muted-foreground"
                                                      >
                                                        {reference}
                                                      </span>
                                                    ))}
                                                  </div>
                                                </div>
                                              </div>
                                            )}
                                          </div>

                                          {photoInlineToast && (
                                            <div className="rounded-md border border-success/45 bg-success/12 px-2.5 py-1 text-caption text-foreground">
                                              {photoInlineToast}
                                            </div>
                                          )}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      ) : tab === "documents" ? (
                        <>
                          <style>{`
                            .doc-paper-noise {
                              background-image:
                                radial-gradient(circle at 15% 20%, rgba(120, 113, 108, 0.08) 0, rgba(120, 113, 108, 0.02) 28%, transparent 56%),
                                radial-gradient(circle at 85% 10%, rgba(120, 113, 108, 0.06) 0, transparent 45%),
                                linear-gradient(180deg, rgba(255, 255, 255, 0.42), rgba(244, 240, 233, 0.2));
                            }
                            .doc-scan-grid {
                              background-image:
                                linear-gradient(to right, rgba(100, 116, 139, 0.15) 1px, transparent 1px),
                                linear-gradient(to bottom, rgba(100, 116, 139, 0.15) 1px, transparent 1px);
                              background-size: 18px 18px;
                            }
                            @keyframes docScanLine {
                              0% { transform: translateY(-130%); }
                              100% { transform: translateY(430%); }
                            }
                            .doc-scanline {
                              animation: docScanLine 3.2s linear 1;
                            }
                            @keyframes docClausePulse {
                              0% { transform: scale(1); }
                              50% { transform: scale(1.01); }
                              100% { transform: scale(1); }
                            }
                            .doc-clause-pulse {
                              animation: docClausePulse 260ms ease-out;
                            }
                            @keyframes docClauseSwap {
                              0% { opacity: 0; transform: translateY(4px); }
                              100% { opacity: 1; transform: translateY(0); }
                            }
                            .doc-clause-copy {
                              animation: docClauseSwap 180ms ease-out;
                            }
                          `}</style>
                          <div
                            className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-stretch xl:h-[var(--doc-viewer-h)] xl:overflow-hidden"
                            style={
                              {
                                "--doc-viewer-h": docViewerHeightPx ? `${docViewerHeightPx}px` : undefined,
                              } as CSSProperties
                            }
                          >
                            <div className="min-w-0">
                              <div
                                ref={docViewerRef}
                                className="relative aspect-[1/1.414] w-full overflow-hidden rounded-md border border-border/40 bg-[#f8f7f4] shadow-[0_24px_40px_-30px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(255,255,255,0.45),inset_0_0_38px_rgba(120,113,108,0.12)]"
                              >
                                <div className="doc-paper-noise pointer-events-none absolute inset-0 opacity-90" />
                                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-stone-300/10" />

                                {isDocScanning && (
                                  <div className="pointer-events-none absolute inset-0 z-20">
                                    <div className="absolute inset-0 bg-slate-800/10" />
                                    <div className="doc-scan-grid absolute inset-0 opacity-70" />
                                    <div className="doc-scanline absolute left-0 right-0 h-14 bg-gradient-to-b from-sky-500/8 via-sky-500/35 to-sky-500/8" />
                                  </div>
                                )}

                                <div className="relative z-10 flex h-full min-h-0 flex-col px-4 pb-4 pt-5 sm:px-5 sm:pt-6">
                                  <div className="mb-3 flex items-start justify-between gap-2 border-b border-stone-300/60 pb-2">
                                    <div>
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-600">
                                        Renovation Agreement
                                      </p>
                                      <p className="mt-1 text-[11px] text-stone-500">Internal legal draft</p>
                                    </div>
                                    <p className="text-[11px] font-medium text-stone-600">{DOC_PAGE_LABELS[activeDocPage]}</p>
                                  </div>

                                  <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
                                    {docClausesForActivePage.map((clause) => {
                                      const finding = findingByClauseId[clause.id];
                                      const isFlagged = hasDocScanned && Boolean(finding);
                                      const isApplied = finding ? Boolean(appliedFixes[finding.id]) : false;
                                      const severityClass = finding ? DOC_SEVERITY_CLAUSE_CLASSES[finding.severity] : "";
                                      const toneClass = isFlagged
                                        ? isApplied
                                          ? DOC_APPLIED_CLAUSE_CLASS
                                          : severityClass
                                        : "bg-white/25";
                                      const clauseText =
                                        hasDocScanned && finding
                                          ? isApplied
                                            ? finding.suggestedText
                                            : finding.originalText
                                          : clause.text;

                                      return (
                                        <div
                                          key={clause.id}
                                          data-clause-id={clause.id}
                                          className={`rounded-sm border border-stone-300/40 px-3 py-2.5 transition-all transition-colors duration-200 ${
                                            toneClass
                                          } ${pulsingClauseId === clause.id ? "doc-clause-pulse" : ""}`}
                                        >
                                          <p
                                            key={`${clause.id}-${isApplied ? "suggested" : "original"}`}
                                            className="doc-clause-copy font-serif text-[13px] leading-[1.55] text-stone-800"
                                          >
                                            {clauseText}
                                          </p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border bg-background/40 p-3">
                              <div className="shrink-0 space-y-2 border-b border-border/60 pb-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <h3 className="text-body font-semibold text-foreground">Contract Risk Scan</h3>
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1">
                                      {DOC_PAGE_ORDER.map((pageId, index) => (
                                        <button
                                          key={pageId}
                                          type="button"
                                          onClick={() => setActiveDocPage(pageId)}
                                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-[11px] font-semibold transition-colors ${
                                            activeDocPage === pageId
                                              ? "border-accent bg-accent/15 text-foreground"
                                              : "border-border bg-background/45 text-muted-foreground hover:text-foreground"
                                          }`}
                                        >
                                          {index + 1}
                                        </button>
                                      ))}
                                    </div>
                                    <Button
                                      type="button"
                                      onClick={startDocScan}
                                      disabled={isDocScanning || hasDocScanned}
                                      className="h-9 gap-2 rounded-md bg-gradient-to-r from-accent via-info to-accent text-accent-foreground shadow-[0_8px_18px_-12px_rgba(56,189,248,0.85)] transition-all duration-200 hover:-translate-y-[1px] hover:brightness-105 disabled:translate-y-0 disabled:opacity-65"
                                    >
                                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                      <span className="flex flex-col items-start leading-none whitespace-nowrap">
                                        <span className="text-[9px] font-semibold uppercase tracking-[0.12em]">
                                          {hasDocScanned ? "Scan complete" : isDocScanning ? "Scanning..." : "AI"}
                                        </span>
                                        <span className="mt-0.5 text-[12px] font-semibold">Scan document</span>
                                      </span>
                                    </Button>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="inline-flex rounded-pill border border-border bg-muted/65 px-2 py-0.5 text-caption font-medium text-foreground">
                                    Safe Score: {displaySafeScore}/100
                                  </span>
                                  {isSafeToSign ? (
                                    <span className="inline-flex items-center gap-1 rounded-pill border border-success/45 bg-success/15 px-2 py-0.5 text-caption font-medium text-success">
                                      <ShieldCheck className="h-3.5 w-3.5" />
                                      Safe to sign
                                    </span>
                                  ) : (
                                    <span className="rounded-pill border border-warning/45 bg-warning/15 px-2 py-0.5 text-caption text-foreground">
                                      Risk remains
                                    </span>
                                  )}
                                </div>
                                <p className="text-caption text-muted-foreground">
                                  {isSafeToSign ? "All high-risk clauses are mitigated." : "Review and apply corrective edits."}
                                </p>
                              </div>

                              <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                                {isDocScanning && (
                                  <div className="rounded-md border border-info/35 bg-info/10 px-2.5 py-2">
                                    <p className="text-caption font-medium text-foreground">{DOC_SCAN_STEPS[docScanStepIndex]}</p>
                                  </div>
                                )}

                                {!hasDocScanned && !isDocScanning ? (
                                  <div className="rounded-md border border-border bg-background/35 px-2.5 py-2 text-caption text-muted-foreground">
                                    Run scan to detect risks and generate corrective edits.
                                  </div>
                                ) : null}

                                {hasDocScanned && (
                                  <div className="space-y-2">
                                    {DOC_PAGE_ORDER.map((pageId) => (
                                      <div key={pageId} className="space-y-1.5">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                          {DOC_PAGE_LABELS[pageId]}
                                        </p>
                                        <div className="space-y-1.5">
                                          {findingsByPage[pageId].map((finding) => {
                                            const isApplied = Boolean(appliedFixes[finding.id]);
                                            return (
                                              <div
                                                key={finding.id}
                                                className={`rounded-md border px-2.5 py-2 transition-colors duration-200 ${
                                                  isApplied ? "border-success/45 bg-success/10" : "border-border/75 bg-background/45"
                                                }`}
                                              >
                                                <div className="flex items-start justify-between gap-2">
                                                  <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                      <span className={`h-2 w-2 rounded-full ${DOC_SEVERITY_DOT_CLASSES[finding.severity]}`} />
                                                      <span
                                                        className={`inline-flex rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${DOC_SEVERITY_CHIP_CLASSES[finding.severity]}`}
                                                      >
                                                        {DOC_SEVERITY_LABELS[finding.severity]}
                                                      </span>
                                                      {isApplied && (
                                                        <span className="inline-flex rounded-pill border border-success/45 bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                                                          Applied
                                                        </span>
                                                      )}
                                                    </div>
                                                    <p className="mt-1 text-body-sm font-medium text-foreground">{finding.title}</p>
                                                    <p className="mt-0.5 text-caption text-muted-foreground">{finding.description}</p>
                                                  </div>
                                                  <div className="shrink-0">
                                                    <div className="flex min-w-[62px] flex-col items-end">
                                                      <Switch
                                                        checked={isApplied}
                                                        onCheckedChange={() => toggleFix(finding.id)}
                                                        aria-label={`Apply fix for ${finding.title}`}
                                                        disabled={!hasDocScanned || isDocScanning}
                                                      />
                                                      <span className="mt-1 text-xs text-muted-foreground">Apply fix</span>
                                                      <span className="text-[10px] font-medium text-success">+{finding.scoreImpact}</span>
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="mt-3 shrink-0 border-t border-border/60 pt-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={handlePrepareCleanVersion}
                                  disabled={!isSafeToSign}
                                  className="w-full"
                                >
                                  Prepare clean version
                                </Button>
                                {showCleanVersionPanel && isSafeToSign && (
                                  <div className="mt-2 rounded-md border border-success/45 bg-success/10 px-2.5 py-2">
                                    <p className="text-caption text-foreground">Renovation-Agreement_v2.pdf ready</p>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={handlePrepareEmail}
                                      className="mt-2 w-full"
                                    >
                                      Prepare email
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-caption text-muted-foreground">{content.title}</p>
                          <div className="mt-2 space-y-2">
                            {content.rows.map((row) => (
                              <div
                                key={row.label}
                                className="flex items-center justify-between rounded-md bg-background/60 px-2 py-1.5"
                              >
                                <span className="text-body-sm text-foreground">{row.label}</span>
                                <span className={`text-caption font-medium ${row.tone ?? "text-foreground"}`}>
                                  {row.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  </TabsContent>
                );
              })}
            </div>
          </Tabs>
        </section>

        <section className="mx-auto w-full max-w-6xl space-y-3 px-sp-3 py-sp-6">
          <div>
            <h2 className="text-h2 text-foreground">Trust and transparency</h2>
            <p className="mt-1 text-body text-muted-foreground">Built to be clear from day one, even in mock mode.</p>
          </div>
          <div className="grid grid-cols-1 gap-sp-2 md:grid-cols-3">
            {[
              {
                icon: ReceiptText,
                title: "Mock-first: no surprise costs",
                text: "We keep AI and cloud spend off until you are ready.",
              },
              {
                icon: Files,
                title: "Clear data ownership",
                text: "Exports and portability are part of the product direction.",
              },
              {
                icon: ShieldCheck,
                title: "Privacy by design",
                text: "Attachments stay local in demo and never leave your browser.",
              },
            ].map((item) => (
              <div key={item.title} className="glass rounded-card p-sp-3">
                <item.icon className="h-5 w-5 text-accent" />
                <h3 className="mt-2 text-body font-semibold text-foreground">{item.title}</h3>
                <p className="mt-1 text-body-sm text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl space-y-3 px-sp-3 py-sp-6">
          <div className="glass-elevated rounded-panel p-sp-4">
            <h2 className="text-h2 text-foreground">Pricing when you&rsquo;re ready</h2>
            <p className="mt-1 text-body text-muted-foreground">Start with demo. Upgrade later.</p>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { name: "Starter", value: "Mock + core workflow", meta: "For individual projects" },
                { name: "Team", value: "Shared workspace + roles", meta: "For active contractors" },
                { name: "Business", value: "Advanced controls + scale", meta: "For multi-project teams" },
              ].map((tier) => (
                <div key={tier.name} className="rounded-card border border-border bg-background/50 p-sp-2">
                  <p className="text-caption text-muted-foreground">{tier.name}</p>
                  <p className="mt-1 text-body font-semibold text-foreground">{tier.value}</p>
                  <p className="mt-1 text-caption text-muted-foreground">{tier.meta}</p>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <Button asChild variant="outline">
                <Link to="/pricing">
                  View pricing
                  <ArrowUpRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="community" className="mx-auto w-full max-w-6xl space-y-3 px-sp-3 py-sp-6">
          <div>
            <h2 className="text-h2 text-foreground">Join the community</h2>
            <p className="mt-1 text-body text-muted-foreground">Updates, templates, and best practices.</p>
          </div>
          <div className="grid gap-sp-2 md:grid-cols-2">
            <div className="glass rounded-card p-sp-3">
              <p className="text-body font-semibold text-foreground">Channels</p>
              <p className="mt-1 text-body-sm text-muted-foreground">Community links are placeholders while mock mode is active.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => toast({ title: "Telegram link (mock)" })}>
                  Telegram
                </Button>
                <Button type="button" variant="outline" onClick={() => toast({ title: "Discord link (mock)" })}>
                  Discord
                </Button>
              </div>
            </div>
            <form onSubmit={handleCommunitySubmit} className="glass rounded-card p-sp-3">
              <p className="text-body font-semibold text-foreground">Get updates</p>
              <p className="mt-1 text-body-sm text-muted-foreground">Receive product notes and new workspace templates.</p>
              <div className="mt-3 flex gap-2">
                <Input
                  type="email"
                  value={communityEmail}
                  onChange={(event) => setCommunityEmail(event.target.value)}
                  placeholder="you@company.com"
                />
                <Button type="submit">Subscribe</Button>
              </div>
            </form>
          </div>
        </section>
      </main>

      <footer className="mt-sp-6 border-t border-border px-sp-3 py-sp-3">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 text-caption text-muted-foreground sm:flex-row">
          <span>© 2026 СтройАгент</span>
          <div className="flex items-center gap-3">
            <button onClick={() => scrollToSection("resources")} className="hover:text-foreground">
              Resources
            </button>
            <Link to="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <button onClick={() => scrollToSection("community")} className="hover:text-foreground">
              Community
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
