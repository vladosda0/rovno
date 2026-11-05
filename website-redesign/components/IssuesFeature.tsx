export function IssuesFeature() {
  return <section className="workspace-feature issues-feature" id="issues" aria-labelledby="issues-title">
    <div className="workspace-copy">
      <h2 id="issues-title">Каждое замечание находится под контролем</h2>
      <p>Фиксируйте замечания, прикладывайте фотографии, назначайте ответственных и отслеживайте выполнение прямо внутри проекта.</p>
    </div>
    <div className="workspace-screen issues-screen">
      <div className="workspace-screen-crop"><img src="/images/features/issues-screen.png" loading="lazy" alt="Карточка задачи в Rovno: статус, описание, исполнитель, даты, чек-лист, фотографии и комментарии." /></div>
    </div>
  </section>;
}
