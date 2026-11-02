import { describe, expect, it, vi } from "vitest";
import { askShurik, seedProjectComposer, shurikQuoteLine, subscribeShurikAsk, takeProjectComposerSeed, takeShurikAsk } from "@/lib/shurik-ask";

describe("shurik-ask", () => {
  it("hands a project question over once", () => {
    seedProjectComposer("p", "вопрос");
    expect(takeProjectComposerSeed("p")).toBe("вопрос");
    expect(takeProjectComposerSeed("p")).toBeUndefined();
  });

  it("keeps an ask until the chat takes it, and tells whoever opens the panel", () => {
    const listener = vi.fn();
    const off = subscribeShurikAsk(listener);
    askShurik({ label: "СП 29" });
    off();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(takeShurikAsk()).toEqual({ label: "СП 29" });
    expect(takeShurikAsk()).toBeNull();
  });

  it("writes a quote as the clause popover does", () => {
    expect(shurikQuoteLine("0,5 – 1 %", "СП 29, п. 4.5")).toBe("«0,5 – 1 %» · СП 29, п. 4.5\n");
    expect(shurikQuoteLine("текст")).toBe("«текст»\n");
  });
});
