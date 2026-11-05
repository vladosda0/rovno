export const blogPosts=[
 {title:'Что нового в Rovno?',href:'/blog/whats-new-1-3/'},
 {title:'Как не терять деньги на закупках: снабжение с rovno.ai',href:'https://rovno.ai/blog/upravlenie-zakupkami-stroitelstvo/'},
 {title:'Гид по строительной смете',href:'https://rovno.ai/blog/gid-po-stroitelnoy-smete/'},
];
export function BlogCard({post}:{post:typeof blogPosts[number]}){return <article className="blog-card"><a className="blog-card-link" href={post.href}><div className="blog-cover-frame" aria-hidden="true"><div className="blog-cover"/></div><div className="blog-card-copy"><div className="blog-labels"><time dateTime="2026-07-24">24 июля 2026</time><span>2 мин чтения</span></div><div className="blog-text"><h3>{post.title}</h3><p>В версии 1.3 мы включили мгновенную синхронизацию между устройствами, запустили телеграм-бота и переделали экран управления доступами.</p></div></div></a></article>}
