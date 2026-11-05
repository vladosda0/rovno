import { PageMotion } from '../../components/PageMotion';
import type { Metadata } from 'next';
import { SiteHeader } from '../../components/SiteHeader';
import { Footer } from '../../components/Footer';
import { RefundSections } from '../../components/RefundSections';
import '../landing.css';
import '../blog/blog.css';
import '../offer/legal.css';
export const metadata: Metadata = {title:'Возврат средств — Rovno',description:'Условия и порядок возврата средств за услуги Rovno.'};
export default function RefundPage(){return <div className="landing-shell legal-shell" id="top">
 <PageMotion/>
 <SiteHeader onLanding={false}/>
 <main className="legal-main" id="main-content">
  <nav className="blog-breadcrumbs legal-breadcrumbs" aria-label="Навигационная цепочка"><ol><li><a href="/">Главная</a></li><li aria-hidden="true">/</li><li><span aria-current="page">Возврат средств</span></li></ol></nav>
  <article className="legal-document" aria-labelledby="legal-title">
   <header className="legal-intro">
    <div className="legal-title-row"><h1 id="legal-title">Возврат средств</h1><p className="legal-date">Действует с <time dateTime="2026-05-14">14 мая 2026 г.</time></p></div>
    <p className="legal-caption">Настоящая Политика регулирует порядок возврата денежных средств, уплаченных Заказчиком за услуги сервиса «ровно», и является неотъемлемой частью <a href="/offer">Публичной оферты</a>.</p>
   </header>
   <RefundSections/>
  </article>
 </main>
 <Footer onLanding={false}/>
</div>}
