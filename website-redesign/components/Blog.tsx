import { ButtonLink } from './Button';
import { BlogCard, blogPosts } from './BlogCard';
export function Blog(){return <section className="blog-section" id="blog" aria-labelledby="blog-title">
 <div className="blog-heading"><h2 id="blog-title">Полезные материалы для строительных команд</h2><div className="blog-intro"><p>Практические статьи о цифровизации строительства, управлении проектами и организации работы на объектах.</p><ButtonLink href="/blog" variant="secondary" size="responsive">Смотреть все статьи</ButtonLink></div></div>
 <div className="blog-posts" tabIndex={0} role="region" aria-label="Статьи блога, горизонтальная прокрутка">{blogPosts.map(post=><BlogCard post={post} key={post.href}/>)}</div>
 </section>}
