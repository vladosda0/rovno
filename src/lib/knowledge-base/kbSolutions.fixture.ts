// A «Решения» card as PostgREST returns it (kb_solutions with embedded facts and
// their documents), cut from rovno-db scripts/kb-solutions-theme-1.json. Shared
// by the slice-4 tests.

export const SOLUTION_ROW: Record<string, unknown> = {
  slug: "steny-v-sanuzle-pod-plitku",
  title: "Стены в санузле под плитку",
  checked_at: "2026-10-24T03:00:00+00:00",
  reviewed_at: "2026-10-25T09:00:00+00:00",
  updated_at: "2026-10-25T09:00:00+00:00",
  body: {
    summary: "Как подготовить стены ванной или душевой под облицовку плиткой.",
    conditions: [
      { key: "base", label: "Основание", options: [{ key: "gklv", label: "Гипсокартон ГКЛВ" }, { key: "mineral", label: "Бетон, кирпич, штукатурка" }] },
      { key: "zone", label: "Где стена", options: [{ key: "wet", label: "Вода попадает прямо на стену" }, { key: "dry", label: "Сухая стена" }] },
    ],
    steps: [
      { text: "Поверхности листов ГКЛВ покрыть гидроизолирующим составом.", facts: [1], when: { base: "gklv", zone: "wet" } },
      { text: "Под нижнюю направляющую уложить полосу рулонной гидроизоляции.", facts: [4], recommendation: true, when: { base: "gklv" } },
      { text: "Основание из бетона огрунтовать перед облицовкой.", facts: [5], when: { base: "mineral" } },
      { text: "Облицовку стен делать до устройства покрытия пола.", facts: [5] },
    ],
    numbers: [
      { what: "Заход полосы гидроизоляции на листы", value: "100 мм", facts: [4], recommendation: true, when: { base: "gklv" } },
      { what: "Толщина клеевого слоя", value: "по инструкции клея", facts: [6] },
    ],
    acceptance: [
      { text: "Гидроизоляция нанесена на все места, куда прямо попадает вода.", facts: [1], when: { base: "gklv", zone: "wet" } },
      { text: "Ровность облицовки в пределах таблицы 7.6.", facts: [6] },
    ],
    divergences: [{ text: "Толщину клеевого слоя СП 71 отдаёт производителю.", facts: [6] }],
  },
  kb_solution_facts: [
    {
      position: 4, fact: "Под нижней направляющей рекомендуется полоса гидроизоляции.", doc_id: "SP-155",
      clause_anchor: "p-7-1-5-16", quote: "рекомендуется под нижней направляющей предусматривать полосу",
      kb_documents: { slug: "sp-163-1325800", designation: "СП 163.1325800" },
    },
    {
      position: 1, fact: "Листы ГКЛВ под прямым воздействием влаги покрывают гидроизолирующим составом.", doc_id: "SP-155",
      clause_anchor: "p-6-4-2-8", quote: "должны быть покрыты гидроизолирующим составом",
      kb_documents: { slug: "sp-163-1325800", designation: "СП 163.1325800" },
    },
    {
      position: 5, fact: "Облицовку стен выполняют до устройства пола.", doc_id: "SP-012",
      clause_anchor: "p-7-4-2", quote: "облицовку стен следует выполнять до устройства покрытия пола",
      kb_documents: { slug: "sp-71-13330", designation: "СП 71.13330" },
    },
    {
      position: 6, fact: "Толщина клеевого слоя по инструкции производителя.", doc_id: "SP-012",
      clause_anchor: "p-pril-b", quote: "толщина слоя клея не должна превышать",
      kb_documents: { slug: "sp-71-13330", designation: "СП 71.13330" },
    },
  ],
};

export function solutionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...SOLUTION_ROW, ...overrides };
}

/**
 * «Облицовка плиткой: клей, швы, приёмка» cut to one number that cites facts 8
 * and 10, both from СП 71.13330 п. 7.4.13 (rovno-db kb-solutions-theme-1.json).
 */
export const SEAMS_ROW: Record<string, unknown> = {
  slug: "oblicovka-plitkoj-klej-shvy-priemka",
  title: "Облицовка плиткой: клей, швы, приёмка",
  checked_at: "2026-10-24T03:00:00+00:00",
  reviewed_at: null,
  updated_at: "2026-10-24T03:00:00+00:00",
  body: {
    numbers: [
      { what: "Пауза перед затиркой швов", value: "сутки после твердения клея, меньше по ПР или инструкции клея", facts: [8, 10] },
    ],
  },
  kb_solution_facts: [
    {
      position: 8, fact: "Через сутки после твердения клея швы заполняют шовными материалами.", doc_id: "SP-012",
      clause_anchor: "p-7-4-13", quote: "швы должны быть заполнены специальными шовными материалами",
      kb_documents: { slug: "sp-71-13330", designation: "СП 71.13330" },
    },
    {
      position: 10, fact: "Паузу перед заполнением швов можно сократить, если это предусмотрено ПР или требованием производителя клея.", doc_id: "SP-012",
      clause_anchor: "p-7-4-13",
      quote: "допускается сокращение технологической паузы, если это предусмотрено ПР или требованием производителя материала клеевой прослойки",
      kb_documents: { slug: "sp-71-13330", designation: "СП 71.13330" },
    },
  ],
};
