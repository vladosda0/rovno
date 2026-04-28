import type {
  EstimateExecutionStatus,
  EstimateV2Project,
  EstimateV2ResourceLine,
  EstimateV2Stage,
  EstimateV2Work,
  EstimateV2WorkStatus,
  ResourceLineType,
} from "@/types/estimate-v2";

export const DEMO_ESTIMATE_V2_PROJECT_IDS = new Set(["project-1", "project-2", "project-3"]);

export interface DemoEstimateV2State {
  project: EstimateV2Project;
  stages: EstimateV2Stage[];
  works: EstimateV2Work[];
  lines: EstimateV2ResourceLine[];
  dependencies: [];
  versions: [];
  scheduleBaseline: null;
  operationalUpperBlock: null;
}

interface DemoLineSpec {
  id: string;
  stageId: string;
  workId: string;
  type: ResourceLineType;
  title: string;
  unit: string;
  qty: number;
  costRub: number;
  markupBps?: number;
  discountBpsOverride?: number | null;
}

interface DemoWorkSpec {
  id: string;
  stageId: string;
  title: string;
  order: number;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  status?: EstimateV2WorkStatus;
  discountBps?: number;
}

interface DemoStageSpec {
  id: string;
  title: string;
  order: number;
  discountBps?: number;
}

interface DemoProjectSpec {
  projectId: string;
  title: string;
  estimateStatus: EstimateExecutionStatus;
  markupBps: number;
  taxBps: number;
  discountBps?: number;
  receivedCents: number;
  stages: DemoStageSpec[];
  works: DemoWorkSpec[];
  lines: DemoLineSpec[];
}

const RUB_CURRENCY = "RUB";

// Default per-type markup (basis points) applied when a line doesn't override it.
const DEFAULT_MARKUP_BPS: Record<ResourceLineType, number> = {
  labor: 3000,
  material: 1500,
  tool: 2500,
  subcontractor: 1000,
  overhead: 0,
  other: 500,
};

const projectSpecs: DemoProjectSpec[] = [
  {
    projectId: "project-1",
    title: "Ремонт квартиры",
    estimateStatus: "in_work",
    markupBps: 2000,
    taxBps: 2200,
    discountBps: 0,
    receivedCents: 4_500_000,
    stages: [
      { id: "stage-v2-1-1", title: "Снос и демонтаж", order: 1, discountBps: 0 },
      { id: "stage-v2-1-2", title: "Электрика и сантехника", order: 2, discountBps: 300 },
      { id: "stage-v2-1-3", title: "Чистовая отделка", order: 3, discountBps: 0 },
    ],
    works: [
      { id: "work-v2-1-1", stageId: "stage-v2-1-1", title: "Демонтаж покрытий", order: 1, plannedStart: "2026-03-10", plannedEnd: "2026-03-15", status: "done" },
      { id: "work-v2-1-2", stageId: "stage-v2-1-1", title: "Демонтаж плитки", order: 2, plannedStart: "2026-03-16", plannedEnd: "2026-03-20", status: "done" },
      { id: "work-v2-1-3", stageId: "stage-v2-1-2", title: "Электромонтаж", order: 1, plannedStart: "2026-03-23", plannedEnd: "2026-04-05", status: "in_progress", discountBps: 200 },
      { id: "work-v2-1-4", stageId: "stage-v2-1-2", title: "Монтаж сантехники", order: 2, plannedStart: "2026-04-06", plannedEnd: "2026-04-17", status: "in_progress" },
      { id: "work-v2-1-5", stageId: "stage-v2-1-3", title: "Стены и потолки", order: 1, plannedStart: "2026-04-20", plannedEnd: "2026-05-08", status: "not_started" },
      { id: "work-v2-1-6", stageId: "stage-v2-1-3", title: "Укладка плитки", order: 2, plannedStart: "2026-05-11", plannedEnd: "2026-05-29", status: "not_started" },
    ],
    lines: [
      { id: "line-v2-1-1-1", stageId: "stage-v2-1-1", workId: "work-v2-1-1", type: "labor", title: "Снятие ламината", unit: "м²", qty: 65, costRub: 300 },
      { id: "line-v2-1-1-2", stageId: "stage-v2-1-1", workId: "work-v2-1-1", type: "material", title: "Мешки для строительного мусора", unit: "шт", qty: 20, costRub: 50 },
      { id: "line-v2-1-1-3", stageId: "stage-v2-1-1", workId: "work-v2-1-1", type: "other", title: "Вывоз строительного мусора", unit: "контейнер", qty: 2, costRub: 9500 },
      { id: "line-v2-1-2-1", stageId: "stage-v2-1-1", workId: "work-v2-1-2", type: "labor", title: "Снятие плитки в ванной", unit: "м²", qty: 12, costRub: 450 },
      { id: "line-v2-1-2-2", stageId: "stage-v2-1-2", workId: "work-v2-1-2", type: "tool", title: "Аренда перфоратора", unit: "сутки", qty: 3, costRub: 900 },
      { id: "line-v2-1-3-1", stageId: "stage-v2-1-2", workId: "work-v2-1-3", type: "labor", title: "Прокладка кабеля", unit: "точка", qty: 24, costRub: 2000 },
      { id: "line-v2-1-3-2", stageId: "stage-v2-1-2", workId: "work-v2-1-3", type: "material", title: "Кабель ВВГнг 3×2.5", unit: "м", qty: 200, costRub: 80, discountBpsOverride: 500 },
      { id: "line-v2-1-3-3", stageId: "stage-v2-1-2", workId: "work-v2-1-3", type: "subcontractor", title: "Подрядчик: щиток и автоматика под ключ", unit: "комплект", qty: 1, costRub: 42000 },
      { id: "line-v2-1-4-1", stageId: "stage-v2-1-2", workId: "work-v2-1-4", type: "labor", title: "Разводка труб", unit: "точка", qty: 8, costRub: 4000 },
      { id: "line-v2-1-4-2", stageId: "stage-v2-1-2", workId: "work-v2-1-4", type: "material", title: "Трубы ПП 20мм", unit: "м", qty: 50, costRub: 120 },
      { id: "line-v2-1-4-3", stageId: "stage-v2-1-2", workId: "work-v2-1-4", type: "material", title: "Фитинги и крепёж", unit: "комплект", qty: 1, costRub: 6400 },
      { id: "line-v2-1-5-1", stageId: "stage-v2-1-3", workId: "work-v2-1-5", type: "material", title: "Гипсокартон КНАУФ 12.5мм", unit: "шт", qty: 40, costRub: 650 },
      { id: "line-v2-1-5-2", stageId: "stage-v2-1-3", workId: "work-v2-1-5", type: "labor", title: "Монтаж гипсокартона", unit: "м²", qty: 80, costRub: 350 },
      { id: "line-v2-1-5-3", stageId: "stage-v2-1-3", workId: "work-v2-1-5", type: "tool", title: "Аренда строительных лесов", unit: "неделя", qty: 2, costRub: 3500 },
      { id: "line-v2-1-6-1", stageId: "stage-v2-1-3", workId: "work-v2-1-6", type: "material", title: "Плитка керамогранит 60×60", unit: "м²", qty: 18, costRub: 2200, discountBpsOverride: 700 },
      { id: "line-v2-1-6-2", stageId: "stage-v2-1-3", workId: "work-v2-1-6", type: "labor", title: "Укладка плитки", unit: "м²", qty: 18, costRub: 1500 },
      { id: "line-v2-1-6-3", stageId: "stage-v2-1-3", workId: "work-v2-1-6", type: "other", title: "Доставка материалов", unit: "рейс", qty: 3, costRub: 2500 },
      { id: "line-v2-1-6-4", stageId: "stage-v2-1-3", workId: "work-v2-1-6", type: "overhead", title: "Накладные расходы по объекту", unit: "pct_of_cost", qty: 5, costRub: 0 },
    ],
  },
  {
    projectId: "project-2",
    title: "Отделка офиса",
    estimateStatus: "planning",
    markupBps: 1500,
    taxBps: 2200,
    discountBps: 0,
    receivedCents: 0,
    stages: [
      { id: "stage-v2-2-1", title: "Планировка пространства", order: 1, discountBps: 0 },
      { id: "stage-v2-2-2", title: "Строительство", order: 2, discountBps: 500 },
    ],
    works: [
      { id: "work-v2-2-1", stageId: "stage-v2-2-1", title: "Проектирование и дизайн", order: 1 },
      { id: "work-v2-2-2", stageId: "stage-v2-2-2", title: "Перегородки", order: 1 },
      { id: "work-v2-2-3", stageId: "stage-v2-2-2", title: "Климатическое оборудование", order: 2, discountBps: 300 },
    ],
    lines: [
      { id: "line-v2-2-1-1", stageId: "stage-v2-2-1", workId: "work-v2-2-1", type: "labor", title: "Разработка планировки", unit: "проект", qty: 1, costRub: 80000 },
      { id: "line-v2-2-1-2", stageId: "stage-v2-2-1", workId: "work-v2-2-1", type: "subcontractor", title: "3D-визуализация (подряд)", unit: "проект", qty: 1, costRub: 35000 },
      { id: "line-v2-2-2-1", stageId: "stage-v2-2-2", workId: "work-v2-2-2", type: "material", title: "Стеклянные перегородки", unit: "м²", qty: 30, costRub: 8000, discountBpsOverride: 500 },
      { id: "line-v2-2-2-2", stageId: "stage-v2-2-2", workId: "work-v2-2-2", type: "labor", title: "Монтаж перегородок", unit: "м²", qty: 30, costRub: 2500 },
      { id: "line-v2-2-2-3", stageId: "stage-v2-2-2", workId: "work-v2-2-2", type: "tool", title: "Аренда подъёмника", unit: "сутки", qty: 4, costRub: 4500 },
      { id: "line-v2-2-3-1", stageId: "stage-v2-2-2", workId: "work-v2-2-3", type: "material", title: "Сплит-системы 7 BTU", unit: "шт", qty: 6, costRub: 45000 },
      { id: "line-v2-2-3-2", stageId: "stage-v2-2-2", workId: "work-v2-2-3", type: "labor", title: "Монтаж кондиционеров", unit: "шт", qty: 6, costRub: 8000 },
      { id: "line-v2-2-3-3", stageId: "stage-v2-2-2", workId: "work-v2-2-3", type: "other", title: "Пусконаладка и сертификация", unit: "услуга", qty: 1, costRub: 12000 },
    ],
  },
  {
    projectId: "project-3",
    title: "Благоустройство участка",
    estimateStatus: "in_work",
    markupBps: 1800,
    taxBps: 2200,
    discountBps: 200,
    receivedCents: 16_000_000,
    stages: [
      { id: "stage-v2-3-1", title: "Подготовка участка", order: 1, discountBps: 0 },
      { id: "stage-v2-3-2", title: "Дренаж и выравнивание", order: 2, discountBps: 400 },
      { id: "stage-v2-3-3", title: "Укладка мощения", order: 3, discountBps: 0 },
      { id: "stage-v2-3-4", title: "Озеленение и финиш", order: 4, discountBps: 0 },
    ],
    works: [
      { id: "work-v2-3-1", stageId: "stage-v2-3-1", title: "Расчистка территории", order: 1, plannedStart: "2026-03-18", plannedEnd: "2026-03-27", status: "done" },
      { id: "work-v2-3-2", stageId: "stage-v2-3-2", title: "Дренажная система", order: 1, plannedStart: "2026-03-30", plannedEnd: "2026-04-17", status: "in_progress" },
      { id: "work-v2-3-3", stageId: "stage-v2-3-3", title: "Основание и мощение", order: 1, plannedStart: "2026-04-20", plannedEnd: "2026-05-22", status: "in_progress" },
      { id: "work-v2-3-4", stageId: "stage-v2-3-4", title: "Посадки и финишные работы", order: 1, plannedStart: "2026-05-25", plannedEnd: "2026-06-19", status: "not_started" },
    ],
    lines: [
      { id: "line-v2-3-1-1", stageId: "stage-v2-3-1", workId: "work-v2-3-1", type: "labor", title: "Снятие газона и корчевание", unit: "м²", qty: 200, costRub: 180 },
      { id: "line-v2-3-1-2", stageId: "stage-v2-3-1", workId: "work-v2-3-1", type: "labor", title: "Планировка и уплотнение грунта", unit: "м²", qty: 200, costRub: 120 },
      { id: "line-v2-3-1-3", stageId: "stage-v2-3-1", workId: "work-v2-3-1", type: "tool", title: "Аренда мини-экскаватора", unit: "сутки", qty: 3, costRub: 12000 },
      { id: "line-v2-3-2-1", stageId: "stage-v2-3-2", workId: "work-v2-3-2", type: "material", title: "Щебень дренажный фр. 20–40", unit: "м³", qty: 8, costRub: 3200 },
      { id: "line-v2-3-2-2", stageId: "stage-v2-3-2", workId: "work-v2-3-2", type: "material", title: "Геотекстиль дорнит 150г/м²", unit: "м²", qty: 150, costRub: 45 },
      { id: "line-v2-3-2-3", stageId: "stage-v2-3-2", workId: "work-v2-3-2", type: "material", title: "Бордюр газонный алюминиевый", unit: "м", qty: 60, costRub: 380 },
      { id: "line-v2-3-2-4", stageId: "stage-v2-3-2", workId: "work-v2-3-2", type: "labor", title: "Монтаж дренажа", unit: "м", qty: 40, costRub: 800 },
      { id: "line-v2-3-2-5", stageId: "stage-v2-3-2", workId: "work-v2-3-2", type: "other", title: "Геодезическая разбивка", unit: "услуга", qty: 1, costRub: 18000 },
      { id: "line-v2-3-3-1", stageId: "stage-v2-3-3", workId: "work-v2-3-3", type: "material", title: "Брусчатка бетонная 20×10×6", unit: "м²", qty: 120, costRub: 1400, discountBpsOverride: 500 },
      { id: "line-v2-3-3-2", stageId: "stage-v2-3-3", workId: "work-v2-3-3", type: "labor", title: "Укладка брусчатки", unit: "м²", qty: 120, costRub: 700 },
      { id: "line-v2-3-3-3", stageId: "stage-v2-3-3", workId: "work-v2-3-3", type: "material", title: "Ирригационные материалы", unit: "комплект", qty: 1, costRub: 28000 },
      { id: "line-v2-3-3-4", stageId: "stage-v2-3-3", workId: "work-v2-3-3", type: "subcontractor", title: "Автоматика полива (подряд)", unit: "проект", qty: 1, costRub: 55000 },
      { id: "line-v2-3-4-1", stageId: "stage-v2-3-4", workId: "work-v2-3-4", type: "material", title: "Декоративный гравий", unit: "м³", qty: 3, costRub: 5500 },
      { id: "line-v2-3-4-2", stageId: "stage-v2-3-4", workId: "work-v2-3-4", type: "labor", title: "Посадка растений и финишные работы", unit: "проект", qty: 1, costRub: 35000 },
      { id: "line-v2-3-4-3", stageId: "stage-v2-3-4", workId: "work-v2-3-4", type: "tool", title: "Аренда газонокосилки и триммера", unit: "неделя", qty: 2, costRub: 3800 },
    ],
  },
];

function buildStages(spec: DemoProjectSpec, createdAt: string): EstimateV2Stage[] {
  return spec.stages.map((stage) => ({
    id: stage.id,
    projectId: spec.projectId,
    title: stage.title,
    order: stage.order,
    discountBps: stage.discountBps ?? 0,
    createdAt,
    updatedAt: createdAt,
  }));
}

function buildWorks(spec: DemoProjectSpec, createdAt: string): EstimateV2Work[] {
  return spec.works.map((work) => ({
    id: work.id,
    projectId: spec.projectId,
    stageId: work.stageId,
    title: work.title,
    order: work.order,
    discountBps: work.discountBps ?? 0,
    plannedStart: work.plannedStart ?? null,
    plannedEnd: work.plannedEnd ?? null,
    taskId: null,
    status: work.status ?? "not_started",
    createdAt,
    updatedAt: createdAt,
  }));
}

function buildLines(spec: DemoProjectSpec, createdAt: string): EstimateV2ResourceLine[] {
  return spec.lines.map((line) => ({
    id: line.id,
    projectId: spec.projectId,
    stageId: line.stageId,
    workId: line.workId,
    title: line.title,
    type: line.type,
    unit: line.unit,
    qtyMilli: Math.round(line.qty * 1000),
    costUnitCents: Math.round(line.costRub * 100),
    summaryClientUnitCents: null,
    summaryClientTotalCents: null,
    summaryDiscountedClientTotalCents: null,
    markupBps: line.markupBps ?? DEFAULT_MARKUP_BPS[line.type],
    discountBpsOverride: line.discountBpsOverride ?? null,
    taxBpsOverride: null,
    assigneeId: null,
    assigneeName: null,
    assigneeEmail: null,
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt,
    updatedAt: createdAt,
  }));
}

function buildProject(spec: DemoProjectSpec, createdAt: string): EstimateV2Project {
  return {
    id: `estimate-v2-${spec.projectId}`,
    projectId: spec.projectId,
    title: spec.title,
    projectMode: "contractor",
    currency: RUB_CURRENCY,
    taxBps: spec.taxBps,
    discountBps: spec.discountBps ?? 0,
    markupBps: spec.markupBps,
    estimateStatus: spec.estimateStatus,
    receivedCents: spec.receivedCents,
    pnlPlaceholderCents: 0,
    createdAt,
    updatedAt: createdAt,
  };
}

export function getDemoEstimateV2State(
  projectId: string,
  createdAt: string,
): DemoEstimateV2State | null {
  const spec = projectSpecs.find((entry) => entry.projectId === projectId);
  if (!spec) return null;
  return {
    project: buildProject(spec, createdAt),
    stages: buildStages(spec, createdAt),
    works: buildWorks(spec, createdAt),
    lines: buildLines(spec, createdAt),
    dependencies: [],
    versions: [],
    scheduleBaseline: null,
    operationalUpperBlock: null,
  };
}
