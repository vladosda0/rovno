export function TeamFeature() {
  return <section className="workspace-feature team-feature" id="team" aria-labelledby="team-title">
    <div className="workspace-copy">
      <h2 id="team-title">Вся команда работает с одной информацией</h2>
      <p>Прораб, инженер, подрядчик и заказчик видят актуальные данные по объекту и работают в едином рабочем пространстве.</p>
    </div>
    <div className="workspace-screen team-screen">
      <div className="workspace-screen-crop"><img src="/images/features/team-screen.png" loading="lazy" alt="Участники проекта в Rovno: команда, приглашения, роли и права доступа." /></div>
    </div>
  </section>;
}
