import { ButtonLink } from './Button';
import { BlogCard, blogPosts } from './BlogCard';

export function RelatedArticles() {
  return <section className="article-related" aria-labelledby="article-related-title">
    <div className="article-related-heading">
      <h2 id="article-related-title">Может быть интересно</h2>
      <ButtonLink href="/blog" variant="secondary" size="responsive">Смотреть все статьи</ButtonLink>
    </div>
    <div className="blog-posts article-related-posts" tabIndex={0} role="region" aria-label="Рекомендуемые статьи, на планшете доступна горизонтальная прокрутка">
      {blogPosts.map(post=><BlogCard post={post} key={post.href}/>)}
    </div>
  </section>;
}
