import { PageMotion } from '../../components/PageMotion';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteHeader } from '../../components/SiteHeader';
import { Footer } from '../../components/Footer';
import '../landing.css';
import '../blog/blog.css';
import '../offer/legal.css';
import './contacts.css';
export const metadata: Metadata={title:'Контакты — Rovno',description:'Поддержка, контакты и реквизиты Rovno.'};
function Data({icon,value,children}:{icon:string;value:ReactNode;children:ReactNode}){return <div className="contact-data"><span className={`contact-icon${icon==='file-text'?' contact-icon--file':''}`} aria-hidden="true"><img src={`/images/contacts/${icon}.svg`} alt="" width={icon==='file-text'?32:24} height={icon==='file-text'?32:24}/></span><div className="contact-data-text"><div className="contact-value">{value}</div><div className="contact-caption">{children}</div></div></div>}
export default function ContactsPage(){return <div className="landing-shell legal-shell" id="top">
 <PageMotion/>
 <SiteHeader onLanding={false}/>
 <main className="legal-main" id="main-content">
  <nav className="blog-breadcrumbs legal-breadcrumbs" aria-label="Навигационная цепочка"><ol><li><a href="/">Главная</a></li><li aria-hidden="true">/</li><li><span aria-current="page">Контакты</span></li></ol></nav>
  <article className="legal-document contacts-document" aria-labelledby="legal-title">
   <header className="legal-intro"><div className="legal-title-row"><h1 id="legal-title">Контакты</h1></div><p className="legal-caption">Если у вас есть вопросы по работе сервиса «ровно», подписке, оплате или возврату средств, свяжитесь с нами любым удобным способом ниже.</p></header>
   <section className="legal-section" aria-labelledby="support-title"><h2 id="support-title">Служба поддержки</h2><div className="contact-data-list">
    <Data icon="at" value={<a href="mailto:vlad@rovno.ai">vlad@rovno.ai</a>}>Электронная почта</Data>
    <Data icon="telephone" value={<a href="tel:+79215599969">+7 (921) 559-99-69</a>}>Телефон</Data>
    <Data icon="clock-circle" value="Пн — Пт, 10:00–19:00 (МСК)">Часы работы</Data>
   </div></section>
   <section className="legal-section" id="requisites" aria-labelledby="requisites-title"><h2 id="requisites-title">Реквизиты</h2><div className="contact-data-list">
    <Data icon="file-text" value="Индивидуальный предприниматель Горлов Владислав Алексеевич"><p>ИНН 575309671587</p><p>ОГРНИП 326470400066950</p></Data>
    <Data icon="location-selected" value="188824, Россия, Ленинградская обл., Выборгский р-н, п. Поляны, ул. Харалужная, д. 1">Юридический адрес</Data>
   </div></section>
   <section className="legal-section" aria-labelledby="documents-title"><h2 id="documents-title">Юридические документы</h2><div className="legal-prose"><ul><li><a href="/offer">Публичная оферта</a></li><li><a href="/privacy">Политика конфиденциальности</a></li><li><a href="/refund">Политика возврата средств</a></li></ul></div></section>
   <section className="legal-section" aria-labelledby="payments-title"><h2 id="payments-title">Платежи</h2><p className="legal-prose">Приём платежей на сайте осуществляется через сервис интернет-эквайринга <a href="https://www.tbank.ru/">АО «ТБанк»</a>. Принимаются карты Visa, Mastercard, МИР, оплата через Систему быстрых платежей (СБП) и T-Pay. Кассовые чеки направляются на электронную почту в соответствии с Федеральным законом № 54-ФЗ.</p></section>
  </article>
 </main><Footer onLanding={false}/>
</div>}
