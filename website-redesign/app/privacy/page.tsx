import { PageMotion } from '../../components/PageMotion';
import type { Metadata } from 'next';
import { SiteHeader } from '../../components/SiteHeader';
import { Footer } from '../../components/Footer';
import { PrivacySections } from '../../components/PrivacySections';
import '../landing.css';
import '../blog/blog.css';
import '../offer/legal.css';
export const metadata: Metadata = {title:'Политика конфиденциальности — Rovno',description:'Порядок обработки персональных данных в сервисе Rovno.'};
export default function PrivacyPage(){return <div className="landing-shell legal-shell" id="top">
 <PageMotion/>
 <SiteHeader onLanding={false}/>
 <main className="legal-main" id="main-content">
  <nav className="blog-breadcrumbs legal-breadcrumbs" aria-label="Навигационная цепочка"><ol><li><a href="/">Главная</a></li><li aria-hidden="true">/</li><li><span aria-current="page">Политика конфиденциальности</span></li></ol></nav>
  <article className="legal-document" aria-labelledby="legal-title">
   <header className="legal-intro">
    <div className="legal-title-row legal-title-row--long"><h1 id="legal-title">Политика конфиденциальности</h1><p className="legal-date">Действует с <time dateTime="2026-05-23">23 мая 2026 г.</time></p></div>
    <p className="legal-caption">Настоящая Политика разработана в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных» и описывает порядок обработки персональных данных и обеспечения информационной безопасности в сервисе «ровно».</p>
   </header>
   <PrivacySections/>
  </article>
 </main>
 <Footer onLanding={false}/>
</div>}
