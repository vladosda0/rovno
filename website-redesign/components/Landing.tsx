'use client';
import { ButtonLink } from './Button';
import { Problem } from './Problem';
import { Resources } from './Resources';
import { WorkspaceFeature } from './WorkspaceFeature';
import { PlanningFeature } from './PlanningFeature';
import { IssuesFeature } from './IssuesFeature';
import { BudgetFeature } from './BudgetFeature';
import { DocumentsFeature } from './DocumentsFeature';
import { TeamFeature } from './TeamFeature';
import { Shurik } from './Shurik';
import { Audience } from './Audience';
import { Pricing } from './Pricing';
import { Faq } from './Faq';
import { Blog } from './Blog';
import { FinalCta } from './FinalCta';
import { Footer } from './Footer';
import { PageMotion } from './PageMotion';
import { SiteHeader } from './SiteHeader';
export function Landing() {
  return <div className="landing-shell" id="top">
    <PageMotion />
    <SiteHeader />
    <main className="landing-page" id="main-content">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title"><span className="hero-title-first"><span>Управляйте</span>{" "}<span>стройкой,</span></span><span>а не хаосом.</span></h1>
          <div className="hero-description">
            <p>Rovno объединяет задачи, смету, документы, подрядчиков и ход работ в одном рабочем пространстве. Всё, что нужно для управления объектом, находится в одной системе.</p>
            <div className="hero-actions">
              <ButtonLink size="responsive" variant="secondary" href="https://rovno.ai/home">Начать бесплатно</ButtonLink>
              <ButtonLink  size="responsive" href="https://rovno.ai/project/project-1/dashboard"><span className="desktop-copy">Посмотреть демо</span><span className="compact-copy">Демо</span></ButtonLink>
            </div>
          </div>
        </div>
        <div className="hero-illustration">
          <picture className="hero-shadows" aria-hidden="true">
            <source media="(max-width: 743px)" srcSet="/images/hero/shadows-mobile.svg" />
            <source media="(max-width: 1279px)" srcSet="/images/hero/shadows-tablet.svg" />
            <img src="/images/hero/shadows-desktop.svg" alt="" />
          </picture>
          <div className="hero-screen"><img src="/images/hero/product-screen.png" width="3456" height="1938" fetchPriority="high" alt="Рабочее пространство Rovno: объект «Берёзки-1, дом 100 м²», задачи, бюджет, документы, галерея и участники." /></div>
        </div>
      </section>
      <Problem />
      <Resources />
      <WorkspaceFeature />
      <PlanningFeature />
      <IssuesFeature />
      <BudgetFeature />
      <DocumentsFeature />
      <TeamFeature />
      <Shurik />
      <Audience />
      <Pricing />
      <Faq />
      <Blog />
      <FinalCta />
    </main>
    <Footer />

  </div>;
}
