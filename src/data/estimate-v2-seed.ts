import type {
  EstimateExecutionStatus,
  EstimateV2Project,
  EstimateV2ResourceLine,
  EstimateV2Stage,
  EstimateV2Work,
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
}

interface DemoWorkSpec {
  id: string;
  stageId: string;
  title: string;
  order: number;
}

interface DemoStageSpec {
  id: string;
  title: string;
  order: number;
}

interface DemoProjectSpec {
  projectId: string;
  title: string;
  estimateStatus: EstimateExecutionStatus;
  markupBps: number;
  taxBps: number;
  receivedCents: number;
  stages: DemoStageSpec[];
  works: DemoWorkSpec[];
  lines: DemoLineSpec[];
}

const RUB_CURRENCY = "RUB";

const projectSpecs: DemoProjectSpec[] = [
  {
    projectId: "project-1",
    title: "Ремонт квартиры",
    estimateStatus: "in_work",
    markupBps: 2000,
    taxBps: 2200,
    receivedCents: 4_500_000,
    stages: [
      { id: "stage-v2-1-1", title: "Снос и демонтаж", order: 1 },
      { id: "stage-v2-1-2", title: "Электрика и сантехника", order: 2 },
      { id: "stage-v2-1-3", title: "Чистовая отделка", order: 3 },
    ],
    works: [
      { id: "work-v2-1-1", stageId: "stage-v2-1-1", title: "Демонтаж покрытий", order: 1 },
      { id: "work-v2-1-2", stageId: "stage-v2-1-1", title: "Демонтаж плитки", order: 2 },
      { id: "work-v2-1-3", stageId: "stage-v2-1-2", title: "Электромонтаж", order: 1 },
      { id: "work-v2-1-4", stageId: "stage-v2-1-2", title: "Монтаж сантехники", order: 2 },
      { id: "work-v2-1-5", stageId: "stage-v2-1-3", title: "Стены и потолки", order: 1 },
      { id: "work-v2-1-6", stageId: "stage-v2-1-3", title: "Укладка плитки", order: 2 },
    ],
    lines: [
      { id: "line-v2-1-1-1", stageId: "stage-v2-1-1", workId: "work-v2-1-1", type: "labor", title: "Снятие ламината", unit: "м²", qty: 65, costRub: 300 },
      { id: "line-v2-1-1-2", stageId: "stage-v2-1-1", workId: "work-v2-1-1", type: "material", title: "Мешки для строительного мусора", unit: "шт", qty: 20, costRub: 50 },
      { id: "line-v2-1-2-1", stageId: "stage-v2-1-1", workId: "work-v2-1-2", type: "labor", title: "Снятие плитки в ванной", unit: "м²", qty: 12, costRub: 450 },
      { id: "line-v2-1-3-1", stageId: "stage-v2-1-2", workId: "work-v2-1-3", type: "labor", title: "Прокладка кабеля", unit: "точка", qty: 24, costRub: 2000 },
      { id: "line-v2-1-3-2", stageId: "stage-v2-1-2", workId: "work-v2-1-3", type: "material", title: "Кабель ВВГнг 3×2.5", unit: "м", qty: 200, costRub: 80 },
      { id: "line-v2-1-4-1", stageId: "stage-v2-1-2", workId: "work-v2-1-4", type: "labor", title: "Разводка труб", unit: "точка", qty: 8, costRub: 4000 },
      { id: "line-v2-1-4-2", stageId: "stage-v2-1-2", workId: "work-v2-1-4", type: "material", title: "Трубы ПП 20мм", unit: "м", qty: 50, costRub: 120 },
      { id: "line-v2-1-5-1", stageId: "stage-v2-1-3", workId: "work-v2-1-5", type: "material", title: "Гипсокартон КНАУФ 12.5мм", unit: "шт", qty: 40, costRub: 650 },
      { id: "line-v2-1-5-2", stageId: "stage-v2-1-3", workId: "work-v2-1-5", type: "labor", title: "Монтаж гипсокартона", unit: "м²", qty: 80, costRub: 350 },
      { id: "line-v2-1-6-1", stageId: "stage-v2-1-3", workId: "work-v2-1-6", type: "material", title: "Плитка керамогранит 60×60", unit: "м²", qty: 18, costRub: 2200 },
      { id: "line-v2-1-6-2", stageId: "stage-v2-1-3", workId: "work-v2-1-6", type: "labor", title: "Укладка плитки", unit: "м²", qty: 18, costRub: 1500 },
    ],
  },
  {
    projectId: "project-2",
    title: "Отделка офиса",
    estimateStatus: "planning",
    markupBps: 1500,
    taxBps: 2200,
    receivedCents: 0,
    stages: [
      { id: "stage-v2-2-1", title: "Планировка пространства", order: 1 },
      { id: "stage-v2-2-2", title: "Строительство", order: 2 },
    ],
    works: [
      { id: "work-v2-2-1", stageId: "stage-v2-2-1", title: "Проектирование и дизайн", order: 1 },
      { id: "work-v2-2-2", stageId: "stage-v2-2-2", title: "Перегородки", order: 1 },
      { id: "work-v2-2-3", stageId: "stage-v2-2-2", title: "Климатическое оборудование", order: 2 },
    ],
    lines: [
      { id: "line-v2-2-1-1", stageId: "stage-v2-2-1", workId: "work-v2-2-1", type: "labor", title: "Разработка планировки", unit: "проект", qty: 1, costRub: 80000 },
      { id: "line-v2-2-2-1", stageId: "stage-v2-2-2", workId: "work-v2-2-2", type: "material", title: "Стеклянные перегородки", unit: "м²", qty: 30, costRub: 8000 },
      { id: "line-v2-2-2-2", stageId: "stage-v2-2-2", workId: "work-v2-2-2", type: "labor", title: "Монтаж перегородок", unit: "м²", qty: 30, costRub: 2500 },
      { id: "line-v2-2-3-1", stageId: "stage-v2-2-2", workId: "work-v2-2-3", type: "material", title: "Сплит-системы 7 BTU", unit: "шт", qty: 6, costRub: 45000 },
      { id: "line-v2-2-3-2", stageId: "stage-v2-2-2", workId: "work-v2-2-3", type: "labor", title: "Монтаж кондиционеров", unit: "шт", qty: 6, costRub: 8000 },
    ],
  },
  {
    projectId: "project-3",
    title: "Благоустройство участка",
    estimateStatus: "in_work",
    markupBps: 1800,
    taxBps: 2200,
    receivedCents: 16_000_000,
    stages: [
      { id: "stage-v2-3-1", title: "Подготовка участка", order: 1 },
      { id: "stage-v2-3-2", title: "Дренаж и выравнивание", order: 2 },
      { id: "stage-v2-3-3", title: "Укладка мощения", order: 3 },
      { id: "stage-v2-3-4", title: "Озеленение и финиш", order: 4 },
    ],
    works: [
      { id: "work-v2-3-1", stageId: "stage-v2-3-1", title: "Расчистка территории", order: 1 },
      { id: "work-v2-3-2", stageId: "stage-v2-3-2", title: "Дренажная система", order: 1 },
      { id: "work-v2-3-3", stageId: "stage-v2-3-3", title: "Основание и мощение", order: 1 },
      { id: "work-v2-3-4", stageId: "stage-v2-3-4", title: "Посадки и финишные работы", order: 1 },
    ],
    lines: [
      { id: "line-v2-3-1-1", stageId: "stage-v2-3-1", workId: "work-v2-3-1", type: "labor", title: "Снятие газона и корчевание", unit: "м²", qty: 200, costRub: 180 },
      { id: "line-v2-3-1-2", stageId: "stage-v2-3-1", workId: "work-v2-3-1", type: "labor", title: "Планировка и уплотнение грунта", unit: "м²", qty: 200, costRub: 120 },
      { id: "line-v2-3-2-1", stageId: "stage-v2-3-2", workId: "work-v2-3-2", type: "material", title: "Щебень дренажный фр. 20–40", unit: "м³", qty: 8, costRub: 3200 },
      { id: "line-v2-3-2-2", stageId: "stage-v2-3-2", workId: "work-v2-3-2", type: "material", title: "Геотекстиль дорнит 150г/м²", unit: "м²", qty: 150, costRub: 45 },
      { id: "line-v2-3-2-3", stageId: "stage-v2-3-2", workId: "work-v2-3-2", type: "material", title: "Бордюр газонный алюминиевый", unit: "м", qty: 60, costRub: 380 },
      { id: "line-v2-3-2-4", stageId: "stage-v2-3-2", workId: "work-v2-3-2", type: "labor", title: "Монтаж дренажа", unit: "м", qty: 40, costRub: 800 },
      { id: "line-v2-3-3-1", stageId: "stage-v2-3-3", workId: "work-v2-3-3", type: "material", title: "Брусчатка бетонная 20×10×6", unit: "м²", qty: 120, costRub: 1400 },
      { id: "line-v2-3-3-2", stageId: "stage-v2-3-3", workId: "work-v2-3-3", type: "labor", title: "Укладка брусчатки", unit: "м²", qty: 120, costRub: 700 },
      { id: "line-v2-3-3-3", stageId: "stage-v2-3-3", workId: "work-v2-3-3", type: "material", title: "Ирригационные материалы", unit: "комплект", qty: 1, costRub: 28000 },
      { id: "line-v2-3-4-1", stageId: "stage-v2-3-4", workId: "work-v2-3-4", type: "material", title: "Декоративный гравий", unit: "м³", qty: 3, costRub: 5500 },
      { id: "line-v2-3-4-2", stageId: "stage-v2-3-4", workId: "work-v2-3-4", type: "labor", title: "Посадка растений и финишные работы", unit: "проект", qty: 1, costRub: 35000 },
    ],
  },
];

function buildStages(spec: DemoProjectSpec, createdAt: string): EstimateV2Stage[] {
  return spec.stages.map((stage) => ({
    id: stage.id,
    projectId: spec.projectId,
    title: stage.title,
    order: stage.order,
    discountBps: 0,
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
    discountBps: 0,
    plannedStart: null,
    plannedEnd: null,
    taskId: null,
    status: "not_started",
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
    markupBps: 0,
    discountBpsOverride: null,
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
    discountBps: 0,
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
