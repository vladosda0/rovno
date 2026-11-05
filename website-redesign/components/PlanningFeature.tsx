export function PlanningFeature() {
  return <section className="workspace-feature planning-feature" id="planning" aria-labelledby="planning-title">
    <div className="workspace-copy">
      <h2 id="planning-title"><span className="planning-first-line">Планируйте работы{' \u00a0'}</span><span>и контролируйте сроки</span></h2>
      <p>Создавайте задачи, назначайте исполнителей и следите за выполнением работ без постоянных уточнений в чатах.</p>
    </div>
    <div className="workspace-screen planning-screen">
      <div className="workspace-screen-crop"><img src="/images/features/tasks-screen.png" loading="lazy" alt="Задачи в Rovno: этапы работ и канбан-доска со статусами «Не начата», «В работе», «Готово» и «Заблокирована»." /></div>
    </div>
  </section>;
}
