import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { AuthorBio, AuthorLine } from "@/components/blog/AuthorByline";
import { isStickerAvatar, stickerWidth, STICKER_BIO_HEIGHT } from "./authorAvatarConfig.mjs";

describe("isStickerAvatar", () => {
  it("is true for Shurik's poses on any origin", () => {
    expect(isStickerAvatar("https://rovno.ai/shurik/avatar.png")).toBe(true);
    expect(isStickerAvatar("https://vladosda0-rovno-90e7.twc1.net/shurik/cool.png")).toBe(true);
    expect(isStickerAvatar("/shurik/avatar.png")).toBe(true);
  });

  it("is false for human avatars and junk", () => {
    expect(isStickerAvatar("https://api.rovno.ai/storage/v1/object/public/avatars/a.jpg")).toBe(false);
    expect(isStickerAvatar("https://rovno.ai/blog/shurik/x.png")).toBe(false);
    expect(isStickerAvatar("")).toBe(false);
    expect(isStickerAvatar(null)).toBe(false);
    expect(isStickerAvatar("http://[")).toBe(false);
  });
});

describe("author avatar shape", () => {
  it("draws Shurik whole and larger, a human round", () => {
    const shurik = render(
      <AuthorBio name="Шурик" bio="ИИ-эксперт" avatarUrl="https://rovno.ai/shurik/avatar.png" />,
    );
    const sticker = shurik.container.querySelector("img")!;
    expect(sticker.className).toBe("rv-author-bio__sticker");
    expect(sticker.getAttribute("height")).toBe(String(STICKER_BIO_HEIGHT));
    expect(sticker.getAttribute("width")).toBe(String(stickerWidth(STICKER_BIO_HEIGHT)));

    const human = render(
      <AuthorBio name="Влад" bio="Основатель" avatarUrl="https://api.rovno.ai/storage/v1/object/public/avatars/v.jpg" />,
    );
    expect(human.container.querySelector("img")!.className).toBe("");

    const line = render(<AuthorLine name="Шурик" avatarUrl="https://rovno.ai/shurik/avatar.png" />);
    const lineImg = line.container.querySelector("img")!;
    expect(lineImg.style.borderRadius).toBe("");
    expect(lineImg.style.objectFit).toBe("contain");
  });
});
