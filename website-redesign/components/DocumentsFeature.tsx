export function DocumentsFeature() {
  return <section className="workspace-feature documents-feature" id="documents" aria-labelledby="documents-title">
    <div className="workspace-copy">
      <h2 id="documents-title">Все документы в одном месте</h2>
      <p>Чертежи, договоры, акты и инструкции всегда доступны команде. Больше не нужно искать актуальную версию в переписках.</p>
    </div>
    <div className="workspace-screen documents-screen">
      <div className="workspace-screen-crop"><img src="/images/features/documents-screen.png" loading="lazy" alt="Документы проекта в Rovno: договор, смета, чертёж, платёжное поручение, акт и технические условия." /></div>
    </div>
  </section>;
}
