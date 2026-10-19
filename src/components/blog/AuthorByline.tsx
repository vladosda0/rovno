// Byline pieces shared by the public article page (BlogPostPage) and the
// draft preview behind a review link (pages/share/ShareBlogDraft). Both render
// the same article chrome, so the byline lives in one place. The prerenderer
// (scripts/prerender-blog.mjs) emits the same "Об авторе" markup as a string.

import {
  isStickerAvatar,
  stickerWidth,
  STICKER_BIO_HEIGHT,
  STICKER_LINE_HEIGHT,
} from "@/lib/blog/authorAvatarConfig.mjs";

export function AuthorLine({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {avatarUrl && isStickerAvatar(avatarUrl) ? (
        <img
          src={avatarUrl}
          alt={name}
          width={stickerWidth(STICKER_LINE_HEIGHT)}
          height={STICKER_LINE_HEIGHT}
          style={{ width: "auto", height: STICKER_LINE_HEIGHT, objectFit: "contain" }}
        />
      ) : avatarUrl ? (
        <img src={avatarUrl} alt={name} style={{ width: 36, height: 36, borderRadius: 999, objectFit: "cover" }} />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 36, height: 36, borderRadius: 999, background: "rgba(30,92,203,0.1)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-display)", fontSize: 16, color: "var(--rv-blue)",
          }}
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--rv-blue)" }}>{name}</span>
    </div>
  );
}

/** "Об авторе" card. E-E-A-T: bio and avatar have existed on blog_authors since
 *  the blog shipped and were never rendered anywhere. Nothing shows when the
 *  author has no bio — an empty card is worse than no card. */
export function AuthorBio({ name, bio, avatarUrl }: { name: string; bio: string | null; avatarUrl: string | null }) {
  if (!bio) return null;
  return (
    <aside className="rv-author-bio">
      {avatarUrl && isStickerAvatar(avatarUrl) ? (
        <img
          className="rv-author-bio__sticker"
          src={avatarUrl}
          alt=""
          width={stickerWidth(STICKER_BIO_HEIGHT)}
          height={STICKER_BIO_HEIGHT}
          loading="lazy"
          decoding="async"
        />
      ) : avatarUrl ? (
        <img src={avatarUrl} alt="" width={56} height={56} loading="lazy" decoding="async" />
      ) : (
        <span className="rv-author-bio__initial" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
      )}
      <div>
        <p className="rv-author-bio__label">Об авторе</p>
        <p className="rv-author-bio__name">{name}</p>
        <p className="rv-author-bio__text">{bio}</p>
      </div>
    </aside>
  );
}
