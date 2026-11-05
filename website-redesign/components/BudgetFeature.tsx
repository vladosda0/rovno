export function BudgetFeature() {
  return <section className="workspace-feature budget-feature" id="budget" aria-labelledby="budget-title">
    <div className="workspace-copy">
      <h2 id="budget-title">Бюджет всегда перед глазами</h2>
      <p>Контролируйте бюджет проекта, отслеживайте расходы и анализируйте прибыль без дополнительных таблиц.</p>
    </div>
    <div className="workspace-screen budget-screen">
      <div className="workspace-screen-crop"><img src="/images/features/budget-screen.png" loading="lazy" alt="Бюджет проекта в Rovno: смета, доходы, расходы и маржинальность." /></div>
    </div>
  </section>;
}
