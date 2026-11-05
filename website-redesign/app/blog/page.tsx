import { PageMotion } from '../../components/PageMotion';
import type { Metadata } from 'next';
import { BlogCard, blogPosts } from '../../components/BlogCard';
import { FinalCta } from '../../components/FinalCta';
import { Footer } from '../../components/Footer';
import { SiteHeader } from '../../components/SiteHeader';
import '../landing.css';
import './blog.css';
export const metadata:Metadata={title:'Блог Rovno — материалы для строительных команд',description:'Практические статьи о цифровизации строительства, управлении проектами и организации работы на объектах.'};
export default function BlogPage(){return <div className="landing-shell blog-index-shell" id="top"><PageMotion/>
      <SiteHeader onLanding={false}/><main className="blog-index-main" id="main-content"><section className="blog-index-intro" aria-labelledby="blog-index-title"><nav className="blog-breadcrumbs" aria-label="Навигационная цепочка"><ol><li><a href="/">Главная</a></li><li aria-hidden="true">/</li><li><span aria-current="page">Блог</span></li></ol></nav><div className="blog-index-heading"><h1 id="blog-index-title">Полезные материалы для строительных команд</h1><p>Практические статьи о цифровизации строительства, управлении проектами и организации работы на объектах.</p></div></section><section className="blog-index-articles" aria-label="Статьи блога"><div className="blog-index-grid">{blogPosts.map(post=><BlogCard post={post} key={post.href}/>)}</div></section><FinalCta/></main><Footer onLanding={false}/></div>}
