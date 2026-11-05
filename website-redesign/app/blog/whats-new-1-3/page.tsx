import { PageMotion } from '../../../components/PageMotion';
import type { Metadata } from 'next';
import { FinalCta } from '../../../components/FinalCta';
import { Footer } from '../../../components/Footer';
import { RelatedArticles } from '../../../components/RelatedArticles';
import { ArticleBody } from '../../../components/ArticleBody';
import { SiteHeader } from '../../../components/SiteHeader';
import '../../landing.css';
import '../blog.css';
import './article.css';

export const metadata: Metadata = {
  title: 'Что нового в Rovno? — Блог Rovno',
  description: 'В версии 1.3 мы включили мгновенную синхронизацию между устройствами, запустили телеграм-бота и переделали экран управления доступами.',
};

export default function ArticlePage() {
  return (
    <div className="landing-shell article-shell" id="top">
      <PageMotion/>
      <SiteHeader onLanding={false}/>
      <main className="article-main" id="main-content">
        <nav className="blog-breadcrumbs article-breadcrumbs" aria-label="Навигационная цепочка">
          <ol>
            <li><a href="/">Главная</a></li>
            <li aria-hidden="true">/</li>
            <li><a href="/blog">Блог</a></li>
            <li aria-hidden="true">/</li>
            <li><span aria-current="page">Что нового в Rovno?</span></li>
          </ol>
        </nav>
        <article aria-labelledby="article-title">
          <header className="article-intro">
            <h1 id="article-title">Что нового в Rovno?</h1>
            <p>{metadata.description}</p>
            <div className="article-labels">
              <time dateTime="2026-07-24">24 июля 2026</time>
              <span>2 мин чтения</span>
            </div>
          </header>
          {/* The approved Figma cover is an empty color placeholder. */}
          <div className="article-cover" aria-hidden="true"/>
          <ArticleBody/>
        </article>
        <RelatedArticles/>
        <FinalCta/>
      </main>
      <Footer onLanding={false}/>
    </div>
  );
}
