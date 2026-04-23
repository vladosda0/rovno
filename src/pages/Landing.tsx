import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Bot,
  ChevronLeft,
  ChevronDown,
  CloudUpload,
  Download,
  Files,
  Menu,
  Printer,
  ReceiptText,
  Share2,
  ShieldCheck,
  Sparkles,
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
import { seedProjects } from "@/data/seed";
import { enterDemoSession, isAuthenticated } from "@/lib/auth-state";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

type Translator = (key: string, options?: Record<string, unknown>) => string;

const ACCEPTED_FILE_TYPES = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx";

const DEMO_COVER_IMAGE_MAP: Record<string, string> = {
  "project-1": "/demo/apt-demo.png",
  "project-2": "/demo/office-demo.png",
  "project-3": "/demo/landscape-work-cover.png",
};

type ControlTab = "tasks" | "estimate" | "procurement" | "photos" | "documents" | "activity";
type KanbanColumn = "todo" | "doing" | "done";

type ControlRow = { labelKey: string; valueKey: string; tone?: string };
type ControlPanelContent = {
  titleKey: string;
  rows: ControlRow[];
};
type KanbanTask = {
  id: string;
  titleKey: string;
  assignee: string;
  metaKey: string;
  linkedKey?: string;
};
type KanbanState = Record<KanbanColumn, KanbanTask[]>;
type EstimateVariance = "over" | "under" | "on-track" | "pending";
type EstimateLinkedTask = {
  titleKey: string;
  statusKey: string;
};
type EstimateItem = {
  id: string;
  itemKey: string;
  planned: string;
  actual: string;
  varianceAmount: string;
  varianceType: EstimateVariance;
  linkedTasks?: EstimateLinkedTask[];
  receiptsKey?: string;
  noteKey?: string;
  aiInsightKey?: string;
};
type ProcurementStatusKey = "toBuy" | "ordered" | "partial" | "inStock" | "delayed";
type ProcurementItem = {
  id: string;
  materialKey: string;
  neededQty: number;
  receivedQty: number;
  orderedQty: number;
  supplierKey: string;
  etaKey: string;
  committedCost: string;
  linkedTaskKey: string;
  linkedEstimateKey: string;
  delayed?: boolean;
};
type PhotosDemoId = "photo-tile" | "photo-crack" | "photo-insulation" | "photo-landscape";
type PhotoActionKind = "primary" | "secondary";
type PhotoActionType =
  | "create_task"
  | "order"
  | "reminder"
  | "create_project_landscape"
  | "materials"
  | "plan_30d"
  | "request_photo";
type PhotoAction = {
  labelKey: string;
  kind: PhotoActionKind;
  action: PhotoActionType;
};
type PhotosDemoItem = {
  id: PhotosDemoId;
  titleKey: string;
  src: string;
  submittedByKey: string;
  submittedAtKey: string;
  aiQuestionKey: string;
  aiVerdictKey: string;
  aiReasonKey: string;
  aiFindingsKeys: string[];
  aiEvidenceKeys: string[];
  aiReferenceKeys: string[];
  aiActionDetailKeys: Partial<Record<PhotoActionType, string[]>>;
  aiActions: PhotoAction[];
};
type DocPageId = "page-1" | "page-2" | "page-3";
type Severity = "critical" | "medium" | "low";
type Finding = {
  id: string;
  page: DocPageId;
  clauseId: string;
  severity: Severity;
  titleKey: string;
  descriptionKey: string;
  originalKey: string;
  suggestedKey: string;
  scoreImpact: number;
};
type ContractClause = {
  id: string;
  page: DocPageId;
  textKey: string;
};

const KANBAN_COLUMN_KEYS: Record<KanbanColumn, string> = {
  todo: "landing.kanban.columns.todo",
  doing: "landing.kanban.columns.doing",
  done: "landing.kanban.columns.done",
};

const INITIAL_KANBAN_STATE: KanbanState = {
  todo: [
    {
      id: "task-order-junction-boxes",
      titleKey: "landing.kanban.tasks.orderJunctionBoxes.title",
      assignee: "MK",
      metaKey: "landing.kanban.tasks.orderJunctionBoxes.meta",
      linkedKey: "landing.kanban.tasks.orderJunctionBoxes.linked",
    },
    {
      id: "task-confirm-tile-layout",
      titleKey: "landing.kanban.tasks.confirmTileLayout.title",
      assignee: "AV",
      metaKey: "landing.kanban.tasks.confirmTileLayout.meta",
    },
    {
      id: "task-approve-cabinet-finish",
      titleKey: "landing.kanban.tasks.approveCabinetFinish.title",
      assignee: "CL",
      metaKey: "landing.kanban.tasks.approveCabinetFinish.meta",
    },
  ],
  doing: [
    {
      id: "task-run-conduit",
      titleKey: "landing.kanban.tasks.runConduit.title",
      assignee: "AV",
      metaKey: "landing.kanban.tasks.runConduit.meta",
    },
    {
      id: "task-install-drywall",
      titleKey: "landing.kanban.tasks.installDrywall.title",
      assignee: "VV",
      metaKey: "landing.kanban.tasks.installDrywall.meta",
    },
  ],
  done: [
    {
      id: "task-mark-outlets",
      titleKey: "landing.kanban.tasks.markOutlets.title",
      assignee: "AV",
      metaKey: "landing.kanban.tasks.markOutlets.meta",
    },
    {
      id: "task-demolish-backsplash",
      titleKey: "landing.kanban.tasks.demolishBacksplash.title",
      assignee: "MK",
      metaKey: "landing.kanban.tasks.demolishBacksplash.meta",
    },
  ],
};

const ESTIMATE_ITEMS: EstimateItem[] = [
  {
    id: "estimate-drywall-finishing",
    itemKey: "landing.estimate.items.drywall.item",
    planned: "220k",
    actual: "245k",
    varianceAmount: "25k",
    varianceType: "over",
    linkedTasks: [
      { titleKey: "landing.estimate.linkedTasks.installDrywall", statusKey: "landing.estimate.taskStatus.inProgress" },
      { titleKey: "landing.estimate.linkedTasks.paintCeiling", statusKey: "landing.estimate.taskStatus.toDo" },
    ],
    receiptsKey: "landing.estimate.items.drywall.receipts",
    noteKey: "landing.estimate.items.drywall.note",
    aiInsightKey: "landing.estimate.items.drywall.aiInsight",
  },
  {
    id: "estimate-electrical-materials",
    itemKey: "landing.estimate.items.electrical.item",
    planned: "180k",
    actual: "165k",
    varianceAmount: "15k",
    varianceType: "under",
    linkedTasks: [{ titleKey: "landing.estimate.linkedTasks.runConduit", statusKey: "landing.estimate.taskStatus.inProgress" }],
    receiptsKey: "landing.estimate.items.electrical.receipts",
  },
  {
    id: "estimate-bathroom-tiles-labor",
    itemKey: "landing.estimate.items.tiles.item",
    planned: "310k",
    actual: "310k",
    varianceAmount: "0",
    varianceType: "on-track",
    linkedTasks: [{ titleKey: "landing.estimate.linkedTasks.confirmTile", statusKey: "landing.estimate.taskStatus.toDo" }],
    receiptsKey: "landing.estimate.items.tiles.receipts",
  },
  {
    id: "estimate-doors-installation",
    itemKey: "landing.estimate.items.doors.item",
    planned: "90k",
    actual: "0",
    varianceAmount: "",
    varianceType: "pending",
    linkedTasks: [{ titleKey: "landing.estimate.linkedTasks.approveCabinet", statusKey: "landing.estimate.taskStatus.toDo" }],
  },
];

const PROCUREMENT_ITEMS: ProcurementItem[] = [
  {
    id: "proc-drywall-sheets",
    materialKey: "landing.procurement.items.drywall.material",
    neededQty: 120,
    orderedQty: 120,
    receivedQty: 80,
    supplierKey: "landing.procurement.items.drywall.supplier",
    etaKey: "landing.procurement.items.drywall.eta",
    committedCost: "₽165,000",
    linkedTaskKey: "landing.procurement.items.drywall.linkedTask",
    linkedEstimateKey: "landing.procurement.items.drywall.linkedEstimate",
  },
  {
    id: "proc-tile-adhesive",
    materialKey: "landing.procurement.items.tileAdhesive.material",
    neededQty: 20,
    orderedQty: 0,
    receivedQty: 0,
    supplierKey: "landing.procurement.items.tileAdhesive.supplier",
    etaKey: "common.emptyDash",
    committedCost: "₽42,000",
    linkedTaskKey: "landing.procurement.items.tileAdhesive.linkedTask",
    linkedEstimateKey: "landing.procurement.items.tileAdhesive.linkedEstimate",
  },
  {
    id: "proc-electrical-cable-roll",
    materialKey: "landing.procurement.items.cable.material",
    neededQty: 6,
    orderedQty: 6,
    receivedQty: 6,
    supplierKey: "landing.procurement.items.cable.supplier",
    etaKey: "landing.procurement.items.cable.eta",
    committedCost: "₽55,000",
    linkedTaskKey: "landing.procurement.items.cable.linkedTask",
    linkedEstimateKey: "landing.procurement.items.cable.linkedEstimate",
  },
  {
    id: "proc-interior-doors",
    materialKey: "landing.procurement.items.doors.material",
    neededQty: 6,
    orderedQty: 6,
    receivedQty: 0,
    supplierKey: "landing.procurement.items.doors.supplier",
    etaKey: "landing.procurement.items.doors.eta",
    committedCost: "₽58,000",
    linkedTaskKey: "landing.procurement.items.doors.linkedTask",
    linkedEstimateKey: "landing.procurement.items.doors.linkedEstimate",
  },
];

const PHOTOS_ANALYSIS_STEP_KEYS = [
  "landing.photos.analysisSteps.analyzing",
  "landing.photos.analysisSteps.standards",
  "landing.photos.analysisSteps.plan",
];

const PHOTOS_DEMO: PhotosDemoItem[] = [
  {
    id: "photo-tile",
    titleKey: "landing.photos.items.tile.title",
    src: "/demo/photos/tile-defect-lippage.png",
    submittedByKey: "landing.photos.items.tile.submittedBy",
    submittedAtKey: "landing.photos.minutesAgo",
    aiQuestionKey: "landing.photos.items.tile.aiQuestion",
    aiVerdictKey: "landing.photos.items.tile.aiVerdict",
    aiReasonKey: "landing.photos.items.tile.aiReason",
    aiFindingsKeys: [
      "landing.photos.items.tile.finding1",
      "landing.photos.items.tile.finding2",
      "landing.photos.items.tile.finding3",
    ],
    aiEvidenceKeys: [
      "landing.photos.items.tile.evidence1",
      "landing.photos.items.tile.evidence2",
      "landing.photos.items.tile.evidence3",
    ],
    aiReferenceKeys: [
      "landing.photos.items.tile.ref1",
      "landing.photos.items.tile.ref2",
      "landing.photos.items.tile.ref3",
    ],
    aiActionDetailKeys: {
      create_task: [
        "landing.photos.items.tile.createTask1",
        "landing.photos.items.tile.createTask2",
        "landing.photos.items.tile.createTask3",
      ],
      order: [
        "landing.photos.items.tile.order1",
        "landing.photos.items.tile.order2",
        "landing.photos.items.tile.order3",
      ],
      reminder: [
        "landing.photos.items.tile.reminder1",
        "landing.photos.items.tile.reminder2",
        "landing.photos.items.tile.reminder3",
      ],
    },
    aiActions: [
      { labelKey: "landing.photos.items.tile.action1", kind: "primary", action: "create_task" },
      { labelKey: "landing.photos.items.tile.action2", kind: "secondary", action: "order" },
      { labelKey: "landing.photos.items.tile.action3", kind: "secondary", action: "reminder" },
    ],
  },
  {
    id: "photo-crack",
    titleKey: "landing.photos.items.crack.title",
    src: "/demo/photos/plaster-corner-crack.png",
    submittedByKey: "landing.photos.items.crack.submittedBy",
    submittedAtKey: "landing.photos.hoursAgo",
    aiQuestionKey: "landing.photos.items.crack.aiQuestion",
    aiVerdictKey: "landing.photos.items.crack.aiVerdict",
    aiReasonKey: "landing.photos.items.crack.aiReason",
    aiFindingsKeys: [
      "landing.photos.items.crack.finding1",
      "landing.photos.items.crack.finding2",
      "landing.photos.items.crack.finding3",
    ],
    aiEvidenceKeys: [
      "landing.photos.items.crack.evidence1",
      "landing.photos.items.crack.evidence2",
      "landing.photos.items.crack.evidence3",
    ],
    aiReferenceKeys: ["landing.photos.items.crack.ref1", "landing.photos.items.crack.ref2"],
    aiActionDetailKeys: {
      create_task: [
        "landing.photos.items.crack.createTask1",
        "landing.photos.items.crack.createTask2",
        "landing.photos.items.crack.createTask3",
      ],
      order: [
        "landing.photos.items.crack.order1",
        "landing.photos.items.crack.order2",
        "landing.photos.items.crack.order3",
      ],
      reminder: [
        "landing.photos.items.crack.reminder1",
        "landing.photos.items.crack.reminder2",
        "landing.photos.items.crack.reminder3",
      ],
    },
    aiActions: [
      { labelKey: "landing.photos.items.crack.action1", kind: "primary", action: "create_task" },
      { labelKey: "landing.photos.items.crack.action2", kind: "secondary", action: "order" },
      { labelKey: "landing.photos.items.crack.action3", kind: "secondary", action: "reminder" },
    ],
  },
  {
    id: "photo-insulation",
    titleKey: "landing.photos.items.insulation.title",
    src: "/demo/photos/insulation-vapor-barrier.png",
    submittedByKey: "landing.photos.client",
    submittedAtKey: "landing.photos.yesterday",
    aiQuestionKey: "landing.photos.items.insulation.aiQuestion",
    aiVerdictKey: "landing.photos.items.insulation.aiVerdict",
    aiReasonKey: "landing.photos.items.insulation.aiReason",
    aiFindingsKeys: [
      "landing.photos.items.insulation.finding1",
      "landing.photos.items.insulation.finding2",
      "landing.photos.items.insulation.finding3",
    ],
    aiEvidenceKeys: [
      "landing.photos.items.insulation.evidence1",
      "landing.photos.items.insulation.evidence2",
      "landing.photos.items.insulation.evidence3",
    ],
    aiReferenceKeys: [
      "landing.photos.items.insulation.ref1",
      "landing.photos.items.insulation.ref2",
    ],
    aiActionDetailKeys: {
      create_task: [
        "landing.photos.items.insulation.createTask1",
        "landing.photos.items.insulation.createTask2",
        "landing.photos.items.insulation.createTask3",
      ],
      order: [
        "landing.photos.items.insulation.order1",
        "landing.photos.items.insulation.order2",
        "landing.photos.items.insulation.order3",
      ],
      request_photo: [
        "landing.photos.items.insulation.photo1",
        "landing.photos.items.insulation.photo2",
        "landing.photos.items.insulation.photo3",
      ],
    },
    aiActions: [
      { labelKey: "landing.photos.items.insulation.action1", kind: "primary", action: "create_task" },
      { labelKey: "landing.photos.items.insulation.action2", kind: "secondary", action: "order" },
      { labelKey: "landing.photos.items.insulation.action3", kind: "secondary", action: "request_photo" },
    ],
  },
  {
    id: "photo-landscape",
    titleKey: "landing.photos.items.landscape.title",
    src: "/demo/photos/landscape-house.png",
    submittedByKey: "landing.photos.client",
    submittedAtKey: "landing.photos.today",
    aiQuestionKey: "landing.photos.items.landscape.aiQuestion",
    aiVerdictKey: "landing.photos.items.landscape.aiVerdict",
    aiReasonKey: "landing.photos.items.landscape.aiReason",
    aiFindingsKeys: [
      "landing.photos.items.landscape.finding1",
      "landing.photos.items.landscape.finding2",
      "landing.photos.items.landscape.finding3",
    ],
    aiEvidenceKeys: [
      "landing.photos.items.landscape.evidence1",
      "landing.photos.items.landscape.evidence2",
      "landing.photos.items.landscape.evidence3",
    ],
    aiReferenceKeys: [
      "landing.photos.items.landscape.ref1",
      "landing.photos.items.landscape.ref2",
      "landing.photos.items.landscape.ref3",
    ],
    aiActionDetailKeys: {
      create_project_landscape: [
        "landing.photos.items.landscape.project1",
        "landing.photos.items.landscape.project2",
        "landing.photos.items.landscape.project3",
      ],
      materials: [
        "landing.photos.items.landscape.materials1",
        "landing.photos.items.landscape.materials2",
        "landing.photos.items.landscape.materials3",
      ],
      plan_30d: [
        "landing.photos.items.landscape.plan1",
        "landing.photos.items.landscape.plan2",
        "landing.photos.items.landscape.plan3",
      ],
    },
    aiActions: [
      { labelKey: "landing.photos.items.landscape.action1", kind: "primary", action: "create_project_landscape" },
      { labelKey: "landing.photos.items.landscape.action2", kind: "secondary", action: "materials" },
      { labelKey: "landing.photos.items.landscape.action3", kind: "secondary", action: "plan_30d" },
    ],
  },
];

const DOC_SCAN_STEP_KEYS = [
  "landing.doc.scanSteps.reading",
  "landing.doc.scanSteps.checking",
  "landing.doc.scanSteps.drafting",
];
const BASE_SAFE_SCORE = 63;
const MAX_SAFE_SCORE = 100;
const DOC_PAGE_ORDER: DocPageId[] = ["page-1", "page-2", "page-3"];
const DOC_PAGE_NUMBERS: Record<DocPageId, number> = {
  "page-1": 1,
  "page-2": 2,
  "page-3": 3,
};
const DOC_SEVERITY_KEYS: Record<Severity, string> = {
  critical: "landing.doc.severity.critical",
  medium: "landing.doc.severity.medium",
  low: "landing.doc.severity.low",
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
  { id: "scope_vague", page: "page-1", textKey: "landing.doc.clauses.scope.original" },
  { id: "milestones_vague", page: "page-1", textKey: "landing.doc.clauses.milestones.original" },
  { id: "payment_terms_unbalanced", page: "page-1", textKey: "landing.doc.clauses.payment.original" },
  { id: "penalty_one_sided", page: "page-2", textKey: "landing.doc.clauses.penalty.original" },
  { id: "variation_missing", page: "page-2", textKey: "landing.doc.clauses.variation.original" },
  { id: "warranty_ambiguous", page: "page-2", textKey: "landing.doc.clauses.warranty.original" },
  { id: "termination_unilateral", page: "page-3", textKey: "landing.doc.clauses.termination.original" },
  { id: "dispute_jurisdiction_unfair", page: "page-3", textKey: "landing.doc.clauses.dispute.original" },
];

const FINDINGS: Finding[] = [
  {
    id: "finding-scope-vague",
    page: "page-1",
    clauseId: "scope_vague",
    severity: "critical",
    titleKey: "landing.doc.findings.scope.title",
    descriptionKey: "landing.doc.findings.scope.description",
    originalKey: "landing.doc.clauses.scope.original",
    suggestedKey: "landing.doc.clauses.scope.suggested",
    scoreImpact: 8,
  },
  {
    id: "finding-milestones-vague",
    page: "page-1",
    clauseId: "milestones_vague",
    severity: "medium",
    titleKey: "landing.doc.findings.milestones.title",
    descriptionKey: "landing.doc.findings.milestones.description",
    originalKey: "landing.doc.clauses.milestones.original",
    suggestedKey: "landing.doc.clauses.milestones.suggested",
    scoreImpact: 4,
  },
  {
    id: "finding-penalty-one-sided",
    page: "page-2",
    clauseId: "penalty_one_sided",
    severity: "critical",
    titleKey: "landing.doc.findings.penalty.title",
    descriptionKey: "landing.doc.findings.penalty.description",
    originalKey: "landing.doc.clauses.penalty.original",
    suggestedKey: "landing.doc.clauses.penalty.suggested",
    scoreImpact: 4,
  },
  {
    id: "finding-payment-unbalanced",
    page: "page-1",
    clauseId: "payment_terms_unbalanced",
    severity: "medium",
    titleKey: "landing.doc.findings.payment.title",
    descriptionKey: "landing.doc.findings.payment.description",
    originalKey: "landing.doc.clauses.payment.original",
    suggestedKey: "landing.doc.clauses.payment.suggested",
    scoreImpact: 8,
  },
  {
    id: "finding-variation-missing",
    page: "page-2",
    clauseId: "variation_missing",
    severity: "medium",
    titleKey: "landing.doc.findings.variation.title",
    descriptionKey: "landing.doc.findings.variation.description",
    originalKey: "landing.doc.clauses.variation.original",
    suggestedKey: "landing.doc.clauses.variation.suggested",
    scoreImpact: 4,
  },
  {
    id: "finding-warranty-ambiguous",
    page: "page-2",
    clauseId: "warranty_ambiguous",
    severity: "low",
    titleKey: "landing.doc.findings.warranty.title",
    descriptionKey: "landing.doc.findings.warranty.description",
    originalKey: "landing.doc.clauses.warranty.original",
    suggestedKey: "landing.doc.clauses.warranty.suggested",
    scoreImpact: 2,
  },
  {
    id: "finding-termination-unilateral",
    page: "page-3",
    clauseId: "termination_unilateral",
    severity: "critical",
    titleKey: "landing.doc.findings.termination.title",
    descriptionKey: "landing.doc.findings.termination.description",
    originalKey: "landing.doc.clauses.termination.original",
    suggestedKey: "landing.doc.clauses.termination.suggested",
    scoreImpact: 5,
  },
  {
    id: "finding-dispute-jurisdiction",
    page: "page-3",
    clauseId: "dispute_jurisdiction_unfair",
    severity: "medium",
    titleKey: "landing.doc.findings.dispute.title",
    descriptionKey: "landing.doc.findings.dispute.description",
    originalKey: "landing.doc.clauses.dispute.original",
    suggestedKey: "landing.doc.clauses.dispute.suggested",
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
  statusInsightKey?: string;
  riskLabelKey?: string;
  riskClass?: string;
};

const ESTIMATE_EXPANDED_OVERRIDES: Partial<Record<EstimateItem["id"], EstimateExpandedOverride>> = {
  "estimate-drywall-finishing": {
    statusInsightKey: "landing.estimate.items.drywall.statusInsight",
  },
  "estimate-electrical-materials": {
    statusInsightKey: "landing.estimate.items.electrical.statusInsight",
  },
  "estimate-bathroom-tiles-labor": {
    statusInsightKey: "landing.estimate.items.tiles.statusInsight",
    riskLabelKey: "landing.estimate.risk.blockedByClient",
    riskClass: "bg-warning/20 text-foreground border-warning/45",
  },
  "estimate-doors-installation": {
    statusInsightKey: "landing.estimate.items.doors.statusInsight",
    riskLabelKey: "landing.estimate.risk.paymentRequired",
    riskClass: "bg-warning/15 text-foreground border-warning/40",
  },
};

const CONTROL_CONTENT: Record<ControlTab, ControlPanelContent> = {
  tasks: {
    titleKey: "landing.controlContent.tasks.title",
    rows: [
      { labelKey: "landing.controlContent.tasks.rows.electrical", valueKey: "landing.controlContent.tasks.values.inProgress", tone: "text-info" },
      { labelKey: "landing.controlContent.tasks.rows.plumbing", valueKey: "landing.controlContent.tasks.values.notStarted", tone: "text-muted-foreground" },
      { labelKey: "landing.controlContent.tasks.rows.tile", valueKey: "landing.controlContent.tasks.values.blocked", tone: "text-warning-foreground" },
    ],
  },
  estimate: {
    titleKey: "landing.controlContent.estimate.title",
    rows: [
      { labelKey: "landing.controlContent.estimate.rows.v2", valueKey: "landing.controlContent.estimate.values.approved", tone: "text-success" },
      { labelKey: "landing.controlContent.estimate.rows.planned", valueKey: "landing.controlContent.estimate.values.planned", tone: "text-foreground" },
      { labelKey: "landing.controlContent.estimate.rows.paid", valueKey: "landing.controlContent.estimate.values.paid", tone: "text-info" },
    ],
  },
  procurement: {
    titleKey: "landing.controlContent.procurement.title",
    rows: [
      { labelKey: "landing.controlContent.procurement.rows.toBuy", valueKey: "landing.controlContent.procurement.values.toBuy", tone: "text-warning-foreground" },
      { labelKey: "landing.controlContent.procurement.rows.ordered", valueKey: "landing.controlContent.procurement.values.ordered", tone: "text-info" },
      { labelKey: "landing.controlContent.procurement.rows.inStock", valueKey: "landing.controlContent.procurement.values.inStock", tone: "text-success" },
    ],
  },
  photos: {
    titleKey: "landing.controlContent.photos.title",
    rows: [
      { labelKey: "landing.controlContent.photos.rows.finalPhotos", valueKey: "landing.controlContent.photos.values.finalPhotos", tone: "text-success" },
      { labelKey: "landing.controlContent.photos.rows.openReviews", valueKey: "landing.controlContent.photos.values.openReviews", tone: "text-warning-foreground" },
      { labelKey: "landing.controlContent.photos.rows.linkedTasks", valueKey: "landing.controlContent.photos.values.linkedTasks", tone: "text-info" },
    ],
  },
  documents: {
    titleKey: "landing.controlContent.documents.title",
    rows: [
      { labelKey: "landing.controlContent.documents.rows.contracts", valueKey: "landing.controlContent.documents.values.contracts", tone: "text-foreground" },
      { labelKey: "landing.controlContent.documents.rows.specs", valueKey: "landing.controlContent.documents.values.specs", tone: "text-info" },
      { labelKey: "landing.controlContent.documents.rows.approvals", valueKey: "landing.controlContent.documents.values.approvals", tone: "text-warning-foreground" },
    ],
  },
  activity: {
    titleKey: "landing.controlContent.activity.title",
    rows: [
      { labelKey: "landing.controlContent.activity.rows.taskCompleted", valueKey: "landing.controlContent.activity.values.taskCompleted", tone: "text-success" },
      { labelKey: "landing.controlContent.activity.rows.photoUploaded", valueKey: "landing.controlContent.activity.values.photoUploaded", tone: "text-info" },
      { labelKey: "landing.controlContent.activity.rows.commentAdded", valueKey: "landing.controlContent.activity.values.commentAdded", tone: "text-foreground" },
    ],
  },
};

function getProgressLabel(t: Translator, progress: number): string {
  if (progress >= 100) return t("landing.demos.progress.done");
  if (progress > 0) return t("landing.demos.progress.inProgress");
  return t("landing.demos.progress.draft");
}

function getEstimateVarianceLabel(t: Translator, row: EstimateItem): string {
  if (row.varianceType === "over") return t("landing.estimate.variance.over", { amount: row.varianceAmount });
  if (row.varianceType === "under") return t("landing.estimate.variance.under", { amount: row.varianceAmount });
  if (row.varianceType === "on-track") return t("landing.estimate.variance.onTrack");
  return t("landing.estimate.variance.toBePaid");
}

function getDefaultRiskKeyFromVariance(varianceType: EstimateVariance): string {
  if (varianceType === "over") return "landing.estimate.risk.overBudget";
  if (varianceType === "under") return "landing.estimate.risk.withinBudget";
  if (varianceType === "on-track") return "landing.estimate.risk.onTrack";
  return "landing.estimate.risk.paymentRequired";
}

function getDefaultRiskClassFromVariance(varianceType: EstimateVariance): string {
  if (varianceType === "over") return "bg-warning/20 text-foreground border-warning/45";
  if (varianceType === "under") return "bg-success/20 text-foreground border-success/45";
  if (varianceType === "on-track") return "bg-info/20 text-foreground border-info/45";
  return "bg-warning/15 text-foreground border-warning/40";
}

function getExpandedDetails(
  t: Translator,
  row: EstimateItem,
): { statusInsight: string; riskLabel: string; riskClass: string } {
  const override = ESTIMATE_EXPANDED_OVERRIDES[row.id] ?? {};
  return {
    statusInsight: override.statusInsightKey
      ? t(override.statusInsightKey)
      : t("landing.estimate.defaultStatusInsight"),
    riskLabel: override.riskLabelKey
      ? t(override.riskLabelKey)
      : t(getDefaultRiskKeyFromVariance(row.varianceType)),
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
}): { labelKey: ProcurementStatusKey; className: string } {
  if (delayed) {
    return { labelKey: "delayed", className: "border-warning/50 bg-warning/20 text-foreground transition-colors duration-300" };
  }
  if (ordered === 0 && received === 0) {
    return { labelKey: "toBuy", className: "border-border bg-muted/70 text-muted-foreground transition-colors duration-300" };
  }
  if (ordered > 0 && received === 0) {
    return { labelKey: "ordered", className: "border-info/45 bg-info/20 text-foreground transition-colors duration-300" };
  }
  if (received >= needed) {
    return { labelKey: "inStock", className: "border-success/45 bg-success/20 text-foreground transition-colors duration-300" };
  }
  return { labelKey: "partial", className: "border-warning/45 bg-warning/20 text-foreground transition-colors duration-300" };
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
  const { t } = useTranslation();
  const { status: runtimeAuthStatus } = useRuntimeAuth();
  const isLoggedIn = runtimeAuthStatus === "authenticated" || isAuthenticated();
  const isGuest = !isLoggedIn;
  const getStartedPath = isLoggedIn ? "/home" : "/auth/signup";
  const createProjectTo = isGuest ? "/auth/signup" : "/home";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);

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
  const [skippedFindings, setSkippedFindings] = useState<Record<string, boolean>>({});
  const [displaySafeScore, setDisplaySafeScore] = useState(BASE_SAFE_SCORE);
  const [showCleanVersionPanel, setShowCleanVersionPanel] = useState(false);
  const [isPreparingCleanDocument, setIsPreparingCleanDocument] = useState(false);
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
  const prepareCleanDocTimerRef = useRef<number | null>(null);

  const demoProjects = useMemo(() => seedProjects.slice(0, 3), []);

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
      partialCount: procurementView.filter((item) => item.status.labelKey === "partial").length,
      waitingCount: procurementView.filter((item) => !item.isReady).length,
    }),
    [procurementView],
  );

  const activePhoto = useMemo(() => PHOTOS_DEMO.find((photo) => photo.id === activePhotoId) ?? null, [activePhotoId]);
  const activePhotoActionDetailKeys = useMemo(() => {
    if (!activePhoto || !activePhotoAction) return [];
    return activePhoto.aiActionDetailKeys[activePhotoAction] ?? [];
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
  const allFindingsApproved = useMemo(
    () => FINDINGS.every((finding) => Boolean(appliedFixes[finding.id])),
    [appliedFixes],
  );

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
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    if (activeControlTab !== "documents") return;
    const node = docViewerRef.current;
    if (!node) return;

    const updateHeight = () => {
      const rect = node.getBoundingClientRect();
      const measuredHeight = rect.height > 0 ? rect.height : rect.width * 1.414;
      const nextHeight = Math.round(measuredHeight);
      if (nextHeight > 0) setDocViewerHeightPx(nextHeight);
    };

    updateHeight();
    const rafId = window.requestAnimationFrame(updateHeight);
    window.addEventListener("resize", updateHeight);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => updateHeight());
      observer.observe(node);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateHeight);
      observer?.disconnect();
    };
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
      if (prepareCleanDocTimerRef.current) window.clearTimeout(prepareCleanDocTimerRef.current);
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
    toast({ title: t("landing.community.savedToast") });
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

    setDropMessage(t("landing.kanban.movedTo", { column: t(KANBAN_COLUMN_KEYS[targetColumn]) }));
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
      setWowToast(t("landing.procurement.materialsCompleteToast"));

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
      setAnalysisStepIndex((prev) => (prev + 1) % PHOTOS_ANALYSIS_STEP_KEYS.length);
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

    let toastMessage = t("landing.photos.toast.actionSaved");
    if (action.action === "create_task") toastMessage = t("landing.photos.toast.taskCreated", { title: t(photo.titleKey) });
    if (action.action === "order") toastMessage = t("landing.photos.toast.orderDraft");
    if (action.action === "reminder") toastMessage = t("landing.photos.toast.reminderAdded");
    if (action.action === "request_photo") toastMessage = t("landing.photos.toast.photoRequested");
    if (action.action === "materials") toastMessage = t("landing.photos.toast.materialsDraft");
    if (action.action === "plan_30d") toastMessage = t("landing.photos.toast.plan30d");

    if (action.action === "create_project_landscape") {
      setPromptText(t("landing.photos.landscapePrompt"));
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (promptTextareaRef.current) {
        window.setTimeout(() => promptTextareaRef.current?.focus(), 350);
        toastMessage = t("landing.photos.toast.projectDraft");
      } else {
        toastMessage = t("landing.photos.toast.prefilled");
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
    setIsPreparingCleanDocument(false);

    docScanStepTimerRef.current = window.setInterval(() => {
      setDocScanStepIndex((prev) => (prev + 1) % DOC_SCAN_STEP_KEYS.length);
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
    setSkippedFindings((prev) => ({ ...prev, [findingId]: false }));
    setPulsingClauseId(finding.clauseId);
    setShowCleanVersionPanel(false);
    setIsPreparingCleanDocument(false);

    if (docClausePulseTimerRef.current) window.clearTimeout(docClausePulseTimerRef.current);
    docClausePulseTimerRef.current = window.setTimeout(() => {
      setPulsingClauseId((prev) => (prev === finding.clauseId ? null : prev));
      docClausePulseTimerRef.current = null;
    }, 480);
  };

  const skipFinding = (findingId: string) => {
    if (!hasDocScanned || isDocScanning) return;
    setSkippedFindings((prev) => ({ ...prev, [findingId]: !prev[findingId] }));
    setAppliedFixes((prev) => ({ ...prev, [findingId]: false }));
    setShowCleanVersionPanel(false);
    setIsPreparingCleanDocument(false);
  };

  const handleCleanDocumentAction = () => {
    if (!hasDocScanned || isDocScanning || isPreparingCleanDocument) return;

    if (!allFindingsApproved) {
      const nextApplied = FINDINGS.reduce<Record<string, boolean>>((acc, finding) => {
        acc[finding.id] = true;
        return acc;
      }, {});
      setAppliedFixes(nextApplied);
      setSkippedFindings({});
      setShowCleanVersionPanel(false);
      return;
    }

    setIsPreparingCleanDocument(true);
    setShowCleanVersionPanel(false);
    if (prepareCleanDocTimerRef.current) window.clearTimeout(prepareCleanDocTimerRef.current);
    prepareCleanDocTimerRef.current = window.setTimeout(() => {
      setIsPreparingCleanDocument(false);
      setShowCleanVersionPanel(true);
      prepareCleanDocTimerRef.current = null;
    }, 1400);
  };

  const handleShareCleanDocument = async () => {
    const sharePayload = {
      title: t("landing.doc.shareTitle"),
      text: t("landing.doc.shareText"),
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(sharePayload);
      } catch {
        // user cancelled share
      }
      return;
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast({ title: t("landing.doc.toastLinkCopied") });
        return;
      } catch {
        toast({ title: t("landing.doc.toastShareAction") });
        return;
      }
    }

    toast({ title: t("landing.doc.toastShareAction") });
  };

  const handlePrintCleanDocument = () => {
    window.print();
  };

  const handleDownloadCleanDocument = () => {
    const blob = new Blob([t("landing.doc.downloadContent")], {
      type: "application/pdf",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Renovation-Agreement_v2.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleTaskDragEnd = () => {
    setDraggingTaskId(null);
    setDragSourceColumn(null);
    setDragOverColumn(null);
  };

  const howItWorksSteps = [
    {
      icon: Bot,
      titleKey: "landing.howItWorks.steps.describe.title",
      line1Key: "landing.howItWorks.steps.describe.line1",
      line2Key: "landing.howItWorks.steps.describe.line2",
    },
    {
      icon: CloudUpload,
      titleKey: "landing.howItWorks.steps.attach.title",
      line1Key: "landing.howItWorks.steps.attach.line1",
      line2Key: "landing.howItWorks.steps.attach.line2",
    },
    {
      icon: Timer,
      titleKey: "landing.howItWorks.steps.control.title",
      line1Key: "landing.howItWorks.steps.control.line1",
      line2Key: "landing.howItWorks.steps.control.line2",
    },
  ];

  const trustItems = [
    { icon: ReceiptText, titleKey: "landing.trust.items.mock.title", textKey: "landing.trust.items.mock.text" },
    { icon: Files, titleKey: "landing.trust.items.data.title", textKey: "landing.trust.items.data.text" },
    { icon: ShieldCheck, titleKey: "landing.trust.items.privacy.title", textKey: "landing.trust.items.privacy.text" },
  ];

  const pricingTiers = [
    { nameKey: "landing.pricingTeaser.tiers.starter.name", valueKey: "landing.pricingTeaser.tiers.starter.value", metaKey: "landing.pricingTeaser.tiers.starter.meta" },
    { nameKey: "landing.pricingTeaser.tiers.team.name", valueKey: "landing.pricingTeaser.tiers.team.value", metaKey: "landing.pricingTeaser.tiers.team.meta" },
    { nameKey: "landing.pricingTeaser.tiers.business.name", valueKey: "landing.pricingTeaser.tiers.business.value", metaKey: "landing.pricingTeaser.tiers.business.meta" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header
        className={`sticky top-0 z-50 border-b border-border transition-all duration-200 ${
          isScrolled ? "bg-background/90 py-2 backdrop-blur-xl" : "bg-background/70 py-3 backdrop-blur-md"
        }`}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-sp-3">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/logo.svg"
              alt={t("landing.brand.name")}
              className="h-8 w-auto"
            />
            <span className="hidden text-caption text-muted-foreground sm:inline leading-tight">
              {t("landing.brand.tagline")}
            </span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            <button onClick={() => scrollToSection("resources")} className="rounded-md px-3 py-2 text-body-sm text-muted-foreground transition-colors hover:text-foreground">
              {t("landing.nav.resources")}
            </button>
            <Link to="/pricing" className="rounded-md px-3 py-2 text-body-sm text-muted-foreground transition-colors hover:text-foreground">
              {t("landing.nav.pricing")}
            </Link>
            <button onClick={() => scrollToSection("community")} className="rounded-md px-3 py-2 text-body-sm text-muted-foreground transition-colors hover:text-foreground">
              {t("landing.nav.community")}
            </button>
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Button variant="outline" asChild>
              <Link to="/auth/login">{t("landing.nav.login")}</Link>
            </Button>
            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to={getStartedPath}>{t("landing.nav.getStarted")}</Link>
            </Button>
          </div>

          <div className="flex items-center gap-1 md:hidden">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">{t("landing.nav.openMenu")}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="glass-sidebar">
                <SheetHeader>
                  <SheetTitle>{t("landing.nav.navigation")}</SheetTitle>
                </SheetHeader>
                <div className="mt-8 space-y-2">
                  <Button variant="ghost" className="w-full justify-start" onClick={() => handleMobileScroll("resources")}>
                    {t("landing.nav.resources")}
                  </Button>
                  <Button variant="ghost" asChild className="w-full justify-start">
                    <Link to="/pricing" onClick={() => setMobileMenuOpen(false)}>
                      {t("landing.nav.pricing")}
                    </Link>
                  </Button>
                  <Button variant="ghost" className="w-full justify-start" onClick={() => handleMobileScroll("community")}>
                    {t("landing.nav.community")}
                  </Button>
                </div>
                <div className="mt-8 space-y-2">
                  <Button variant="outline" asChild className="w-full">
                    <Link to="/auth/login" onClick={() => setMobileMenuOpen(false)}>
                      {t("landing.nav.login")}
                    </Link>
                  </Button>
                  <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                    <Link to={getStartedPath} onClick={() => setMobileMenuOpen(false)}>
                      {t("landing.nav.getStarted")}
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
            <p className="text-caption font-medium text-accent">{t("landing.hero.eyebrow")}</p>
            <h1 className="mt-2 text-h1 text-foreground">{t("landing.hero.title")}</h1>
            <p className="mt-2 max-w-2xl text-body text-muted-foreground">
              {t("landing.hero.subtitle")}
            </p>

            <div className="mt-4 space-y-3">
              <div className="rounded-card border border-border bg-background/60 p-sp-2">
                <Textarea
                  ref={promptTextareaRef}
                  value={promptText}
                  onChange={(event) => setPromptText(event.target.value)}
                  className="min-h-[140px] resize-none border-0 bg-transparent p-0 text-body focus-visible:ring-0"
                  placeholder={t("landing.hero.promptPlaceholder")}
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
                        {t("landing.hero.dropzoneTitle")}
                      </p>
                      <p className="text-caption leading-relaxed text-muted-foreground">{t("landing.hero.dropzoneSubtitle")}</p>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={handleBrowseFiles}>
                    {t("landing.hero.browseFiles")}
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
                          <span className="sr-only">{t("landing.hero.removeFile")}</span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <Link to={createProjectTo}>
                    {t("landing.hero.createProject")}
                    <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section id="demos" className="mx-auto w-full max-w-6xl space-y-3 px-sp-3 py-sp-6">
          <div>
            <h2 className="text-h2 text-foreground">{t("landing.demos.title")}</h2>
            <p className="mt-1 text-body text-muted-foreground">
              {t("landing.demos.subtitle")}
            </p>
          </div>

          {demoProjects.length === 0 ? (
            <div className="glass rounded-panel p-sp-3">
              <p className="text-body text-muted-foreground">{t("landing.demos.loading")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-sp-2 md:grid-cols-2 lg:grid-cols-3">
              {demoProjects.map((project) => (
                <Link
                  key={project.id}
                  to={`/project/${project.id}/dashboard`}
                  onClick={() => enterDemoSession(project.id)}
                  className="group overflow-hidden rounded-card border border-border bg-card/50 transition-all duration-150 hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <div className="relative h-40 overflow-hidden rounded-t-card isolate bg-muted">
                    <div className="absolute inset-0 transform-gpu will-change-transform [transform:translateZ(0)] [backface-visibility:hidden] transition-transform duration-300 ease-out group-hover:scale-105">
                      <img
                        src={DEMO_COVER_IMAGE_MAP[project.id] ?? "/placeholder.svg"}
                        onError={(event) => {
                          event.currentTarget.src = "/placeholder.svg";
                        }}
                        alt={t("landing.demos.coverAlt", { title: project.title })}
                        className="h-full w-full object-cover object-center"
                      />
                    </div>
                    <span className="absolute left-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/80 text-foreground backdrop-blur">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <span className="absolute right-3 top-3 z-20 rounded-pill bg-background/85 px-2 py-0.5 text-caption font-medium text-foreground">
                      {t("landing.demos.demoBadge")}
                    </span>
                  </div>
                  <div className="space-y-2 p-sp-3">
                    <h3 className="truncate text-body font-semibold text-foreground">{project.title}</h3>
                    <div className="flex items-center justify-between text-caption">
                      <span className="rounded-pill bg-muted px-2 py-0.5 text-muted-foreground">{project.type}</span>
                      <span className="text-muted-foreground">{getProgressLabel(t, project.progress_pct)}</span>
                    </div>
                    <Progress value={project.progress_pct} className="h-1.5" />
                    <p className="text-caption text-muted-foreground">{t("landing.demos.percentComplete", { pct: project.progress_pct })}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section id="resources" className="mx-auto w-full max-w-6xl space-y-3 px-sp-3 py-sp-6">
          <div>
            <h2 className="text-h2 text-foreground">{t("landing.howItWorks.title")}</h2>
            <p className="mt-1 text-body text-muted-foreground">{t("landing.howItWorks.subtitle")}</p>
          </div>
          <div className="grid grid-cols-1 gap-sp-2 md:grid-cols-3">
            {howItWorksSteps.map((step, index) => (
              <div key={step.titleKey} className="glass rounded-card p-sp-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent transition-colors group-hover:bg-accent/20">
                    <step.icon className="h-4 w-4" />
                  </span>
                  <span className="text-caption text-muted-foreground">{t("landing.howItWorks.step", { number: index + 1 })}</span>
                </div>
                <h3 className="text-body font-semibold text-foreground">{t(step.titleKey)}</h3>
                <p className="mt-1 text-body-sm text-muted-foreground">{t(step.line1Key)}</p>
                <p className="mt-1 text-caption text-muted-foreground">{t(step.line2Key)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl space-y-3 px-sp-3 py-sp-6">
          <div>
            <h2 className="text-h2 text-foreground">{t("landing.control.title")}</h2>
            <p className="mt-1 text-body text-muted-foreground">
              {t("landing.control.subtitle")}
            </p>
          </div>

          <Tabs value={activeControlTab} onValueChange={(value) => setActiveControlTab(value as ControlTab)}>
            <div className="rounded-panel border border-border bg-card/50">
              <div className="border-b border-border px-sp-3 py-1.5">
                <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                  <TabsTrigger value="tasks">{t("landing.control.tabs.tasks")}</TabsTrigger>
                  <TabsTrigger value="estimate">{t("landing.control.tabs.estimate")}</TabsTrigger>
                  <TabsTrigger value="procurement">{t("landing.control.tabs.procurement")}</TabsTrigger>
                  <TabsTrigger value="photos">{t("landing.control.tabs.photos")}</TabsTrigger>
                  <TabsTrigger value="documents">{t("landing.control.tabs.documents")}</TabsTrigger>
                  <TabsTrigger value="activity">{t("landing.control.tabs.activity")}</TabsTrigger>
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
                          <p className="text-caption text-muted-foreground">{t(content.titleKey)}</p>
                          {dropMessage && <p className="mt-2 text-caption text-accent">{dropMessage}</p>}
                          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                            {(Object.keys(KANBAN_COLUMN_KEYS) as KanbanColumn[]).map((column) => (
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
                                    {t(KANBAN_COLUMN_KEYS[column])}
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
                                      <p className="pr-5 text-body-sm font-medium text-foreground">{t(task.titleKey)}</p>
                                      <div className="mt-2 flex items-center gap-2">
                                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-foreground">
                                          {task.assignee}
                                        </span>
                                        <span className="truncate text-caption text-muted-foreground">{t(task.metaKey)}</span>
                                      </div>
                                      {task.linkedKey && (
                                        <p className="mt-1 truncate text-caption text-info">{t("landing.kanban.linked", { title: t(task.linkedKey) })}</p>
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
                            <h3 className="text-body font-semibold text-foreground">{t("landing.estimate.heading")}</h3>
                            <span className="rounded-pill border border-success/30 bg-success/10 px-2 py-0.5 text-caption text-success">
                              {t("landing.estimate.versionBadge")}
                            </span>
                          </div>
                          <p className="mt-1 text-caption text-muted-foreground">{t("landing.estimate.lastUpdated")}</p>

                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <div className="rounded-md border border-border bg-background/55 px-2.5 py-2">
                              <p className="text-caption text-muted-foreground">{t("landing.estimate.summary.planned")}</p>
                              <p className="mt-0.5 text-body-sm font-semibold text-foreground">₽ 1,240,000</p>
                            </div>
                            <div className="rounded-md border border-border bg-background/55 px-2.5 py-2">
                              <p className="text-caption text-muted-foreground">{t("landing.estimate.summary.paid")}</p>
                              <p className="mt-0.5 text-body-sm font-semibold text-foreground">₽ 468,000</p>
                            </div>
                            <div className="rounded-md border border-border bg-background/55 px-2.5 py-2">
                              <p className="text-caption text-muted-foreground">{t("landing.estimate.summary.remaining")}</p>
                              <p className="mt-0.5 text-body-sm font-semibold text-foreground">₽ 772,000</p>
                            </div>
                          </div>

                          <div className="mt-3">
                            <p className="mb-1 text-caption text-muted-foreground">{t("landing.estimate.paidLabel")}</p>
                            <Progress value={38} className="h-1.5" />
                          </div>

                          <div className="mt-3 w-full min-w-0">
                            <div className="w-full min-w-0 rounded-md border border-border bg-background/35">
                              <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_28px] border-b border-border px-3 py-2 text-caption font-medium text-muted-foreground">
                                <span>{t("landing.estimate.columns.item")}</span>
                                <span>{t("landing.estimate.columns.planned")}</span>
                                <span>{t("landing.estimate.columns.actual")}</span>
                                <span>{t("landing.estimate.columns.variance")}</span>
                                <span />
                              </div>
                              {ESTIMATE_ITEMS.map((row) => {
                                const isExpanded = expandedEstimateItemId === row.id;
                                const expandedDetails = getExpandedDetails(t, row);
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
                                      <span className="truncate text-body-sm text-foreground">{t(row.itemKey)}</span>
                                      <span className="text-body-sm text-muted-foreground">{row.planned}</span>
                                      <span className="text-body-sm text-muted-foreground">{row.actual}</span>
                                      <span className="justify-self-start">
                                        <span
                                          className={`inline-flex rounded-pill border px-2 py-0.5 text-caption font-medium ${ESTIMATE_VARIANCE_BADGE_CLASSES[row.varianceType]}`}
                                        >
                                          {getEstimateVarianceLabel(t, row)}
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
                                            {t("landing.estimate.expanded.linkedTasks")}
                                          </p>
                                          <div className="mt-1 flex flex-wrap gap-1.5">
                                            {row.linkedTasks?.map((task) => (
                                              <span
                                                key={`${row.id}-${task.titleKey}`}
                                                className="inline-flex items-center gap-1 rounded-pill border border-border bg-muted/60 px-2 py-0.5 text-caption text-foreground"
                                              >
                                                {t(task.titleKey)}
                                                <span className="text-muted-foreground">({t(task.statusKey)})</span>
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                                            {t("landing.estimate.expanded.receipts")}
                                          </p>
                                          <p className="text-caption text-muted-foreground">
                                            {row.receiptsKey ? t(row.receiptsKey) : t("landing.estimate.noReceipts")}
                                          </p>
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                                            {t("landing.estimate.expanded.statusInsight")}
                                          </p>
                                          <p className="text-caption text-muted-foreground">{expandedDetails.statusInsight}</p>
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                                            {t("landing.estimate.expanded.riskNext")}
                                          </p>
                                          <span
                                            className={`inline-flex rounded-pill border px-2 py-0.5 text-caption font-medium ${expandedDetails.riskClass}`}
                                          >
                                            {expandedDetails.riskLabel}
                                          </span>
                                        </div>
                                        {row.varianceType === "over" && row.aiInsightKey && (
                                          <div className="rounded-md border border-info/30 bg-info/10 px-2 py-1.5">
                                            <p className="text-caption text-foreground">{t(row.aiInsightKey)}</p>
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
                          <p className="text-caption text-muted-foreground">{t(content.titleKey)}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="rounded-pill border border-border bg-muted/70 px-2 py-0.5 text-caption text-foreground">
                              {t("landing.procurement.itemsCount", { count: procurementSummary.totalItems })}
                            </span>
                            <span className="rounded-pill border border-warning/45 bg-warning/20 px-2 py-0.5 text-caption text-foreground">
                              {t("landing.procurement.partialCount", { count: procurementSummary.partialCount })}
                            </span>
                            <span className="rounded-pill border border-border bg-muted/70 px-2 py-0.5 text-caption text-muted-foreground">
                              {t("landing.procurement.waitingCount", { count: procurementSummary.waitingCount })}
                            </span>
                            <span className="rounded-pill border border-info/45 bg-info/20 px-2 py-0.5 text-caption text-foreground">
                              {t("landing.procurement.committed")}
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
                                        <p className="truncate text-body-sm font-medium text-foreground">{t(item.materialKey)}</p>
                                        <p className="truncate text-caption text-muted-foreground">
                                          {t("landing.procurement.receivedNeeded", { received: item.received, needed: item.neededQty })}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span
                                          className={`inline-flex rounded-pill border px-2 py-0.5 text-caption font-medium ${item.status.className}`}
                                        >
                                          {t(`landing.procurement.status.${item.status.labelKey}`)}
                                        </span>
                                        <ChevronDown
                                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                                            isExpanded ? "rotate-180" : "rotate-0"
                                          }`}
                                        />
                                      </div>
                                    </div>
                                    <p className="mt-1 truncate text-caption text-muted-foreground">
                                      {t("landing.procurement.linkedTask", { name: t(item.linkedTaskKey) })}
                                    </p>
                                  </button>

                                  {isExpanded && (
                                    <div className="space-y-2 border-t border-border/60 bg-background/60 px-2.5 py-2">
                                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                        <p className="text-caption text-muted-foreground">
                                          {t("landing.procurement.supplier")}: <span className="text-foreground">{t(item.supplierKey)}</span>
                                        </p>
                                        <p className="text-caption text-muted-foreground">
                                          {t("landing.procurement.eta")}: <span className="text-foreground">{t(item.etaKey)}</span>
                                        </p>
                                        <p className="truncate text-caption text-muted-foreground">
                                          {t("landing.procurement.supplier") && t("landing.procurement.linkedTask", { name: "" }).split(":")[0]}: <span className="text-foreground">{t(item.linkedTaskKey)}</span>
                                        </p>
                                        <p className="truncate text-caption text-muted-foreground">
                                          {t("landing.procurement.linkedEstimate")}: <span className="text-foreground">{t(item.linkedEstimateKey)}</span>
                                        </p>
                                        <p className="text-caption text-muted-foreground">
                                          {t("landing.procurement.committedCost")}: <span className="text-foreground">{item.committedCost}</span>
                                        </p>
                                      </div>

                                      <div className="space-y-1.5">
                                        <div className="flex items-center justify-between gap-2 text-caption">
                                          <span className="text-muted-foreground">
                                            {t("landing.procurement.received", { received: item.received, needed: item.neededQty })}
                                          </span>
                                          <span
                                            className={`transition-colors duration-300 ${
                                              item.remaining === 0 ? "text-success" : "text-muted-foreground"
                                            }`}
                                          >
                                            {t("landing.procurement.remaining", { count: item.remaining })}
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
                                        <span className="truncate text-caption text-muted-foreground">{t("landing.procurement.taskReadiness")}</span>
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
                                          {item.isReady ? t("landing.procurement.ready") : t("landing.procurement.waiting")}
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
                              {PHOTOS_DEMO.map((photo) => {
                                const photoTitle = t(photo.titleKey);
                                const submittedAt =
                                  photo.submittedAtKey === "landing.photos.minutesAgo"
                                    ? t("landing.photos.minutesAgo", { count: 8 })
                                    : photo.submittedAtKey === "landing.photos.hoursAgo"
                                      ? t("landing.photos.hoursAgo", { count: 2 })
                                      : t(photo.submittedAtKey);
                                return (
                                  <div key={photo.id} className="min-w-0 rounded-md border border-border bg-background/45 p-2">
                                    <div className="overflow-hidden rounded-md">
                                      <img
                                        src={photo.src}
                                        alt={photoTitle}
                                        className="h-36 w-full transform-gpu object-cover object-center transition-transform duration-300 will-change-transform hover:scale-[1.03] sm:h-40"
                                      />
                                    </div>
                                    <div className="mt-2 rounded-md bg-gradient-to-r from-warning/50 via-accent/45 to-info/45 p-[1px] transition-all duration-200 hover:shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_8px_18px_-12px_rgba(251,191,36,0.5)]">
                                      <button
                                        type="button"
                                        onClick={() => startPhotoAnalysis(photo.id)}
                                        aria-label={t("landing.photos.consultAria", { title: photoTitle })}
                                        className="flex w-full items-center justify-center gap-1.5 rounded-[7px] bg-background/90 px-3 py-2 text-caption font-semibold tracking-tight text-foreground drop-shadow-[0_1px_0_rgba(0,0,0,0.45)] shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-background/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                      >
                                        <Sparkles className="h-3.5 w-3.5" />
                                        {t("landing.photos.consultAi")}
                                      </button>
                                    </div>
                                    <p className="mt-1 text-center text-caption text-muted-foreground">
                                      {t(photo.submittedByKey)} · {submittedAt}
                                    </p>
                                  </div>
                                );
                              })}
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
                                    aria-label={t("landing.photos.backAria")}
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
                                        alt={t(activePhoto.titleKey)}
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
                                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/85">{t("landing.photos.youLabel")}</p>
                                      <p className="text-[14px] leading-snug text-foreground break-words">
                                        {t(activePhoto.aiQuestionKey)}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 mx-auto w-full max-w-[900px] min-w-0 flex-1 min-h-0">
                                  <div className="flex h-full min-h-0 flex-col rounded-md border border-border bg-background/60 p-3">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                        <Sparkles className="h-3.5 w-3.5 text-accent" />
                                        {t("landing.photos.inspectorTitle")}
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
                                          {t("landing.photos.aiGenerated")}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex-1 min-h-0 min-w-0 overflow-y-auto pr-1 text-[14px] leading-snug">
                                      {isAnalyzing ? (
                                        <div className="space-y-2">
                                          <p className="text-sm text-muted-foreground">{t(PHOTOS_ANALYSIS_STEP_KEYS[analysisStepIndex])}</p>
                                          <div className="space-y-1.5">
                                            <div className="ph-skeleton h-2 rounded-md" />
                                            <div className="ph-skeleton h-2 w-4/5 rounded-md" />
                                          </div>
                                        </div>
                                      ) : showPhotoAnswer ? (
                                        <div className="ph-inspector-reveal min-w-0 break-words space-y-2.5">
                                          <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div className="min-w-0">
                                              <p className="text-xs font-semibold text-foreground">{t("landing.photos.verdictHeading")}</p>
                                              <p className="mt-0.5 text-[14px] leading-snug text-muted-foreground">{t(activePhoto.aiReasonKey)}</p>
                                            </div>
                                            <span className="rounded-pill border border-warning/50 bg-warning/20 px-2 py-0.5 text-caption font-medium text-foreground">
                                              {t(activePhoto.aiVerdictKey)}
                                            </span>
                                          </div>

                                          <div className="border-t border-border/50 pt-2">
                                            <p className="text-xs font-semibold text-foreground">{t("landing.photos.findingsHeading")}</p>
                                            <ul className="mt-1 space-y-1">
                                              {activePhoto.aiFindingsKeys.slice(0, 3).map((findingKey) => (
                                                <li key={findingKey} className="flex items-start gap-1.5 text-[14px] leading-snug text-foreground">
                                                  <span className="mt-1 h-1 w-1 rounded-full bg-warning/80" />
                                                  <span className="break-words">{t(findingKey)}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>

                                          <div className="border-t border-border/50 pt-2">
                                            <p className="mb-1 text-xs font-semibold text-foreground">{t("landing.photos.actionsHeading")}</p>
                                            <div className="flex flex-wrap gap-2">
                                              {activePhoto.aiActions.map((action) => (
                                                <button
                                                  key={`${activePhoto.id}-${action.labelKey}`}
                                                  type="button"
                                                  onClick={() => handlePhotoAction(action, activePhoto)}
                                                  className={getPhotoActionClasses(action.kind, activePhotoAction === action.action)}
                                                >
                                                  {t(action.labelKey)}
                                                </button>
                                              ))}
                                            </div>
                                          </div>

                                          <div className="border-t border-border/50 pt-2">
                                            {showPhotoActionDetails && activePhotoAction ? (
                                              <div className="ph-detail-swap space-y-1.5">
                                                <div className="flex flex-wrap items-center gap-2">
                                                  <span className="h-4 w-1 rounded-full bg-success/70" />
                                                  <span className="text-xs font-semibold text-success">{t("landing.photos.selectedAction")}</span>
                                                  <span className="text-[14px] leading-snug text-foreground">
                                                    {(() => {
                                                      const found = activePhoto.aiActions.find((action) => action.action === activePhotoAction);
                                                      return found ? t(found.labelKey) : "";
                                                    })()}
                                                  </span>
                                                </div>
                                                <ul className="space-y-1">
                                                  {activePhotoActionDetailKeys.map((detailKey) => (
                                                    <li key={detailKey} className="text-[14px] leading-snug text-muted-foreground break-words">
                                                      • {t(detailKey)}
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
                                                  {t("landing.photos.showSummary")}
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="ph-detail-swap space-y-2">
                                                <div>
                                                  <p className="text-xs font-semibold text-foreground">{t("landing.photos.evidenceRequested")}</p>
                                                  <ul className="mt-1 space-y-1">
                                                    {activePhoto.aiEvidenceKeys.map((evidenceKey) => (
                                                      <li key={evidenceKey} className="flex items-start gap-1.5 text-[14px] leading-snug text-muted-foreground">
                                                        <span className="mt-0.5 h-3.5 w-3.5 rounded border border-success/45 bg-success/10" />
                                                        <span className="break-words">{t(evidenceKey)}</span>
                                                      </li>
                                                    ))}
                                                  </ul>
                                                </div>
                                                <div className="border-t border-border/50 pt-2">
                                                  <p className="text-xs font-semibold text-foreground">{t("landing.photos.referencesHeading")}</p>
                                                  <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                                                    {activePhoto.aiReferenceKeys.map((referenceKey) => (
                                                      <span
                                                        key={referenceKey}
                                                        className="rounded-pill border border-border bg-muted/70 px-2 py-0.5 text-caption text-muted-foreground"
                                                      >
                                                        {t(referenceKey)}
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
                            className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-stretch xl:h-[var(--doc-viewer-h)] xl:min-h-[var(--doc-viewer-h)] xl:max-h-[var(--doc-viewer-h)] xl:overflow-hidden"
                            style={
                              {
                                "--doc-viewer-h": docViewerHeightPx ? `${docViewerHeightPx}px` : undefined,
                                height: docViewerHeightPx ? `${docViewerHeightPx}px` : undefined,
                                minHeight: docViewerHeightPx ? `${docViewerHeightPx}px` : undefined,
                                maxHeight: docViewerHeightPx ? `${docViewerHeightPx}px` : undefined,
                              } as CSSProperties
                            }
                          >
                            <div className="min-w-0 xl:h-full xl:min-h-0">
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
                                        {t("landing.doc.renovationAgreement")}
                                      </p>
                                      <p className="mt-1 text-[11px] text-stone-500">{t("landing.doc.internalDraft")}</p>
                                    </div>
                                    <p className="text-[11px] font-medium text-stone-600">{t("landing.doc.page", { number: DOC_PAGE_NUMBERS[activeDocPage] })}</p>
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
                                            ? t(finding.suggestedKey)
                                            : t(finding.originalKey)
                                          : t(clause.textKey);

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

                            <div className="flex h-full max-h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden rounded-md border border-border bg-background/40 p-3 xl:h-full xl:max-h-full xl:min-h-0">
                              <div className="shrink-0 space-y-2 border-b border-border/60 pb-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <h3 className="text-body font-semibold text-foreground">{t("landing.doc.scanTitle")}</h3>
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
                                      <span className="inline-flex min-w-[116px] items-center justify-center text-[12px] font-semibold leading-none whitespace-nowrap">
                                        {hasDocScanned ? t("landing.doc.scanButton.done") : isDocScanning ? t("landing.doc.scanButton.scanning") : t("landing.doc.scanButton.idle")}
                                      </span>
                                    </Button>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="inline-flex rounded-pill border border-border bg-muted/65 px-2 py-0.5 text-caption font-medium text-foreground">
                                    {t("landing.doc.safeScore", { score: displaySafeScore })}
                                  </span>
                                  {isSafeToSign ? (
                                    <span className="inline-flex items-center gap-1 rounded-pill border border-success/45 bg-success/15 px-2 py-0.5 text-caption font-medium text-success">
                                      <ShieldCheck className="h-3.5 w-3.5" />
                                      {t("landing.doc.safeToSign")}
                                    </span>
                                  ) : (
                                    <span className="rounded-pill border border-warning/45 bg-warning/15 px-2 py-0.5 text-caption text-foreground">
                                      {t("landing.doc.riskRemains")}
                                    </span>
                                  )}
                                </div>
                                <p className="text-caption text-muted-foreground">
                                  {isSafeToSign ? t("landing.doc.safeHint") : t("landing.doc.reviewHint")}
                                </p>
                              </div>

                              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
                                {isDocScanning && (
                                  <div className="rounded-md border border-info/35 bg-info/10 px-2.5 py-2">
                                    <p className="text-caption font-medium text-foreground">{t(DOC_SCAN_STEP_KEYS[docScanStepIndex])}</p>
                                  </div>
                                )}

                                {!hasDocScanned && !isDocScanning ? (
                                  <div className="rounded-md border border-border bg-background/35 px-2.5 py-2 text-caption text-muted-foreground">
                                    {t("landing.doc.runScanHint")}
                                  </div>
                                ) : null}

                                {hasDocScanned && (
                                  <div className="space-y-2">
                                    {DOC_PAGE_ORDER.map((pageId) => (
                                      <div key={pageId} className="space-y-1.5">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                          {t("landing.doc.page", { number: DOC_PAGE_NUMBERS[pageId] })}
                                        </p>
                                        <div className="space-y-1.5">
                                          {findingsByPage[pageId].map((finding) => {
                                            const isApplied = Boolean(appliedFixes[finding.id]);
                                            const isSkipped = Boolean(skippedFindings[finding.id]);
                                            return (
                                              <div
                                                key={finding.id}
                                                className={`rounded-md border px-2.5 py-2 transition-colors duration-200 ${
                                                  isApplied
                                                    ? "border-success/45 bg-success/10"
                                                    : isSkipped
                                                      ? "border-muted bg-muted/25"
                                                      : "border-border/75 bg-background/45"
                                                }`}
                                              >
                                                <div className="flex items-start justify-between gap-2">
                                                  <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                      <span className={`h-2 w-2 rounded-full ${DOC_SEVERITY_DOT_CLASSES[finding.severity]}`} />
                                                      <span
                                                        className={`inline-flex rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${DOC_SEVERITY_CHIP_CLASSES[finding.severity]}`}
                                                      >
                                                        {t(DOC_SEVERITY_KEYS[finding.severity])}
                                                      </span>
                                                      {isApplied && (
                                                        <span className="inline-flex rounded-pill border border-success/45 bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                                                          {t("landing.doc.applied")}
                                                        </span>
                                                      )}
                                                      {isSkipped && (
                                                        <span className="inline-flex rounded-pill border border-muted-foreground/35 bg-muted/35 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                                          {t("landing.doc.ignored")}
                                                        </span>
                                                      )}
                                                    </div>
                                                    <p className="mt-1 text-body-sm font-medium text-foreground">{t(finding.titleKey)}</p>
                                                    <p className="mt-0.5 text-caption text-muted-foreground">{t(finding.descriptionKey)}</p>
                                                  </div>
                                                  <div className="shrink-0">
                                                    <div className="flex min-w-[62px] flex-col items-end">
                                                      <Switch
                                                        checked={isApplied}
                                                        onCheckedChange={() => toggleFix(finding.id)}
                                                        aria-label={t("landing.doc.applyFixAria", { title: t(finding.titleKey) })}
                                                        disabled={!hasDocScanned || isDocScanning}
                                                      />
                                                      <span className="mt-1 text-xs text-muted-foreground">{t("landing.doc.applyFix")}</span>
                                                      <span className="text-[10px] font-medium text-success">+{finding.scoreImpact}</span>
                                                      <button
                                                        type="button"
                                                        onClick={() => skipFinding(finding.id)}
                                                        className="mt-1 text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
                                                        disabled={!hasDocScanned || isDocScanning}
                                                      >
                                                        {t("landing.doc.skip")}
                                                      </button>
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

                              <div className="shrink-0 border-t border-border/60 pt-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={handleCleanDocumentAction}
                                  disabled={!hasDocScanned || isDocScanning || isPreparingCleanDocument}
                                  className="w-full"
                                >
                                  {allFindingsApproved ? t("landing.doc.prepareClean") : t("landing.doc.applyAll")}
                                </Button>
                                {isPreparingCleanDocument && (
                                  <div className="mt-2 rounded-md border border-info/35 bg-info/10 px-2.5 py-2">
                                    <p className="text-caption font-medium text-foreground">{t("landing.doc.applyingChanges")}</p>
                                  </div>
                                )}
                                {showCleanVersionPanel && allFindingsApproved && (
                                  <div className="mt-2 rounded-md border border-success/45 bg-success/10 px-2.5 py-2">
                                    <p className="text-caption text-foreground">{t("landing.doc.cleanReady")}</p>
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          void handleShareCleanDocument();
                                        }}
                                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background/65 px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-background/85"
                                      >
                                        <Share2 className="h-3.5 w-3.5" />
                                        {t("landing.doc.share")}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handlePrintCleanDocument}
                                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background/65 px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-background/85"
                                      >
                                        <Printer className="h-3.5 w-3.5" />
                                        {t("landing.doc.print")}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleDownloadCleanDocument}
                                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background/65 px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-background/85"
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                        {t("landing.doc.download")}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-caption text-muted-foreground">{t(content.titleKey)}</p>
                          <div className="mt-2 space-y-2">
                            {content.rows.map((row) => (
                              <div
                                key={row.labelKey}
                                className="flex items-center justify-between rounded-md bg-background/60 px-2 py-1.5"
                              >
                                <span className="text-body-sm text-foreground">{t(row.labelKey)}</span>
                                <span className={`text-caption font-medium ${row.tone ?? "text-foreground"}`}>
                                  {t(row.valueKey)}
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
            <h2 className="text-h2 text-foreground">{t("landing.trust.title")}</h2>
            <p className="mt-1 text-body text-muted-foreground">{t("landing.trust.subtitle")}</p>
          </div>
          <div className="grid grid-cols-1 gap-sp-2 md:grid-cols-3">
            {trustItems.map((item) => (
              <div key={item.titleKey} className="glass rounded-card p-sp-3">
                <item.icon className="h-5 w-5 text-accent" />
                <h3 className="mt-2 text-body font-semibold text-foreground">{t(item.titleKey)}</h3>
                <p className="mt-1 text-body-sm text-muted-foreground">{t(item.textKey)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl space-y-3 px-sp-3 py-sp-6">
          <div className="glass-elevated rounded-panel p-sp-4">
            <h2 className="text-h2 text-foreground">{t("landing.pricingTeaser.title")}</h2>
            <p className="mt-1 text-body text-muted-foreground">{t("landing.pricingTeaser.subtitle")}</p>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {pricingTiers.map((tier) => (
                <div key={tier.nameKey} className="rounded-card border border-border bg-background/50 p-sp-2">
                  <p className="text-caption text-muted-foreground">{t(tier.nameKey)}</p>
                  <p className="mt-1 text-body font-semibold text-foreground">{t(tier.valueKey)}</p>
                  <p className="mt-1 text-caption text-muted-foreground">{t(tier.metaKey)}</p>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <Button asChild variant="outline">
                <Link to="/pricing">
                  {t("landing.pricingTeaser.viewPricing")}
                  <ArrowUpRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="community" className="mx-auto w-full max-w-6xl space-y-3 px-sp-3 py-sp-6">
          <div>
            <h2 className="text-h2 text-foreground">{t("landing.community.title")}</h2>
            <p className="mt-1 text-body text-muted-foreground">{t("landing.community.subtitle")}</p>
          </div>
          <div className="grid gap-sp-2 md:grid-cols-2">
            <div className="glass rounded-card p-sp-3">
              <p className="text-body font-semibold text-foreground">{t("landing.community.channels")}</p>
              <p className="mt-1 text-body-sm text-muted-foreground">{t("landing.community.channelsHint")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => toast({ title: t("landing.community.telegramToast") })}>
                  {t("landing.community.telegram")}
                </Button>
                <Button type="button" variant="outline" onClick={() => toast({ title: t("landing.community.discordToast") })}>
                  {t("landing.community.discord")}
                </Button>
              </div>
            </div>
            <form onSubmit={handleCommunitySubmit} className="glass rounded-card p-sp-3">
              <p className="text-body font-semibold text-foreground">{t("landing.community.getUpdates")}</p>
              <p className="mt-1 text-body-sm text-muted-foreground">{t("landing.community.getUpdatesHint")}</p>
              <div className="mt-3 flex gap-2">
                <Input
                  type="email"
                  value={communityEmail}
                  onChange={(event) => setCommunityEmail(event.target.value)}
                  placeholder={t("landing.community.emailPlaceholder")}
                />
                <Button type="submit">{t("landing.community.subscribe")}</Button>
              </div>
            </form>
          </div>
        </section>
      </main>

      <footer className="mt-sp-6 border-t border-border px-sp-3 py-sp-3">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 text-caption text-muted-foreground sm:flex-row">
          <span>{t("landing.footer.copyright", { year: 2026 })}</span>
          <div className="flex items-center gap-3">
            <button onClick={() => scrollToSection("resources")} className="hover:text-foreground">
              {t("landing.nav.resources")}
            </button>
            <Link to="/pricing" className="hover:text-foreground">
              {t("landing.nav.pricing")}
            </Link>
            <button onClick={() => scrollToSection("community")} className="hover:text-foreground">
              {t("landing.nav.community")}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
