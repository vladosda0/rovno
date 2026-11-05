import { PageMotion } from '../../components/PageMotion';
import type { Metadata } from 'next';
import { OfferSections } from '../../components/OfferSections';
import { Footer } from '../../components/Footer';
import { SiteHeader } from '../../components/SiteHeader';
import '../landing.css';
import '../blog/blog.css';
import './legal.css';

export const metadata: Metadata = {title:'Публичная оферта — Rovno',description:'Условия использования сервиса Rovno.'};
const terms=[
 ['Сервис','программное обеспечение и связанные с ним онлайн-услуги, размещённые на доменах rovno.ai и стройагент.рф, предназначенные для управления строительными проектами, сметами, закупками, документами и сопутствующими операциями.'],
 ['Подписка','право доступа Заказчика к функционалу Сервиса в объёме выбранного тарифа в течение оплаченного периода.'],
 ['Учётная запись','персональный аккаунт Заказчика в Сервисе.'],
 ['Тариф','действующий план обслуживания, опубликованный на сайте Исполнителя, определяющий стоимость и объём функционала Подписки.'],
];
export default function OfferPage(){
 return <div className="landing-shell legal-shell" id="top">
  <PageMotion/>
 <SiteHeader onLanding={false}/>
  <main className="legal-main" id="main-content">
   <nav className="blog-breadcrumbs legal-breadcrumbs" aria-label="Навигационная цепочка"><ol><li><a href="/">Главная</a></li><li aria-hidden="true">/</li><li><span aria-current="page">Публичная оферта</span></li></ol></nav>
   <article className="legal-document" aria-labelledby="legal-title">
    <header className="legal-intro">
     <div className="legal-title-row"><h1 id="legal-title">Публичная оферта</h1><p className="legal-date">Действует с <time dateTime="2026-06-05">5 июня 2026 г.</time></p></div>
     <p className="legal-caption">Настоящий документ является официальным предложением (публичной офертой) Индивидуального предпринимателя Горлова Владислава Алексеевича (далее — «Исполнитель») любому дееспособному физическому лицу, юридическому лицу или индивидуальному предпринимателю (далее — «Заказчик») заключить договор возмездного оказания услуг на изложенных ниже условиях.</p>
    </header>
    <section className="legal-section" aria-labelledby="offer-terms"><h2 id="offer-terms">1. Термины и определения</h2><div className="legal-prose">{terms.map(([term,definition])=><p key={term}><strong>{term}</strong> — {definition}</p>)}</div></section>
    <OfferSections/>
   </article>
  </main>
  <Footer onLanding={false}/>
 </div>;
}
