import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Privacy from "@/pages/legal/Privacy";

describe("Privacy", () => {
  it("names what VK ID passes and what is kept, right after the Yandex ID paragraph (frame 9)", () => {
    render(
      <MemoryRouter>
        <Privacy />
      </MemoryRouter>,
    );
    const vk = screen.getByText(/При входе через VK ID Оператор получает от ООО «ВК»/);
    expect(vk.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "При входе через VK ID Оператор получает от ООО «ВК» идентификатор аккаунта, имя, фамилию, фото профиля, пол, дату рождения " +
        "и статус подтверждения аккаунта, " +
        "а также адрес электронной почты, если пользователь разрешил его передачу, и хранит из них адрес, имя с фамилией " +
        "и идентификатор. Вход выполняется по выбору пользователя, данные используются только для входа и создания аккаунта.",
    );
    const yandex = screen.getByText(/При входе через Яндекс ID Оператор получает/);
    expect(yandex.nextElementSibling).toBe(vk);
  });

  it("lists the data received at sign-in with Yandex ID and VK ID among the processed categories (section 2)", () => {
    render(
      <MemoryRouter>
        <Privacy />
      </MemoryRouter>,
    );
    const item = screen.getByText(/данные, получаемые при входе через Яндекс ID и VK ID/);
    expect(item.tagName).toBe("LI");
    expect(item.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "данные, получаемые при входе через Яндекс ID и VK ID, в составе, указанном в разделе 5;",
    );
    expect(item.closest("section")?.querySelector("h2")?.textContent).toContain("2. Состав обрабатываемых данных");
  });
});
