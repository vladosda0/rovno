export function WorkspaceFeature() {
  return <section className="workspace-feature" id="features" aria-labelledby="workspace-title">
    <div className="workspace-copy">
      <h2 id="workspace-title">Один объект, одно рабочее пространство</h2>
      <p>Каждый проект начинается с единого центра управления. Вся информация об объекте собирается в одном месте: прогресс, задачи, бюджет, документы, фотографии и команда.</p>
    </div>
    <div className="workspace-screen">
      <div className="workspace-screen-crop"><img src="/images/hero/product-screen.png" width="3456" height="1938" loading="lazy" alt="Обзор объекта в Rovno: прогресс строительства, быстрые действия, список задач и бюджет проекта." /></div>
    </div>
  </section>;
}
