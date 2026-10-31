import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  compactAmendmentNumbers,
  kbClauseHref,
  kbClauseLabel,
  KbSourceLine,
} from "@/components/ai/KbSourceLine";
import { mapKnowledgeBase } from "@/lib/ai-assistant-client";
import type { KbAnswerSource } from "@/lib/ai-assistant-contract";

const CARD_FACT: KbAnswerSource = {
  docId: "SP-155",
  docSlug: "sp-163-1325800",
  docLabel: "СП 163.1325800",
  clause: "6.4.2.8",
  anchor: "p-6-4-2-8",
  solutionSlug: "steny-v-sanuzle-pod-plitku",
  solutionTitle: "Стены в санузле под плитку",
  checking: false,
  pendingAmendments: [],
  quote: "должны быть покрыты гидроизолирующим составом",
};

const CHECKING: KbAnswerSource = {
  docId: "SP-012",
  docSlug: "sp-71-13330",
  docLabel: "СП 71.13330",
  clause: "7.4.15",
  anchor: "p-7-4-15",
  checking: true,
  pendingAmendments: [1, 2, 3, 4],
};

describe("KbSourceLine", () => {
  it("collapsed: the first clause and «and N more»; open: the card, then clauses with the checking note", () => {
    render(<KbSourceLine knowledgeBase={{ sources: [CARD_FACT, CHECKING], missing: false }} />);
    const trigger = screen.getByRole("button", { name: /Based on: СП 163\.1325800, cl\. 6\.4\.2\.8 and 2 more/ });
    fireEvent.click(trigger);
    const card = screen.getByRole("link", { name: "Solution «Стены в санузле под плитку»" });
    expect(card).toHaveAttribute("href", "/home?tab=documents&docTab=knowledge-base&kbSolution=steny-v-sanuzle-pod-plitku");
    expect(screen.getByText("(being checked, amendments No. 1–4 not in the text yet)")).toBeInTheDocument();
  });

  it("a clause opens its quote, the document link and «Ask about this clause» filling the composer", () => {
    const onAsk = vi.fn();
    render(<KbSourceLine knowledgeBase={{ sources: [CARD_FACT], missing: false }} onAskAboutClause={onAsk} />);
    fireEvent.click(screen.getByRole("button", { name: /Based on:/ }));
    fireEvent.click(screen.getByRole("button", { name: "СП 163.1325800, cl. 6.4.2.8" }));
    expect(screen.getByText("«…должны быть покрыты гидроизолирующим составом…»")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the clause in the document" })).toHaveAttribute(
      "href",
      "/home?tab=documents&docTab=knowledge-base&kbDoc=sp-163-1325800#p-6-4-2-8",
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask about this clause" }));
    expect(onAsk).toHaveBeenCalledWith("«должны быть покрыты гидроизолирующим составом» · СП 163.1325800, cl. 6.4.2.8\n");
  });

  it("a quote clipped by the server keeps one closing ellipsis; a repeated amendment number counts once", () => {
    const clipped = { ...CARD_FACT, quote: "должны быть покрыты…", checking: true, pendingAmendments: [3, 3] };
    render(<KbSourceLine knowledgeBase={{ sources: [clipped], missing: false }} />);
    fireEvent.click(screen.getByRole("button", { name: /Based on:/ }));
    expect(screen.getByText(/amendment No\. 3 not in the text yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "СП 163.1325800, cl. 6.4.2.8" }));
    expect(screen.getByText("«…должны быть покрыты…»")).toBeInTheDocument();
  });

  it("not in the base: the general-guidance mark instead of the line", () => {
    render(<KbSourceLine knowledgeBase={{ sources: [], missing: true }} />);
    expect(screen.getByTestId("kb-missing")).toHaveTextContent("General guidance: this is not in the knowledge base yet");
  });

  it("nothing to show when the base was searched, the answer used none and it is not a gap", () => {
    const { container } = render(<KbSourceLine knowledgeBase={{ sources: [], missing: false }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("knowledge-base helpers", () => {
  it("compactAmendmentNumbers folds runs", () => {
    expect(compactAmendmentNumbers([4, 1, 2, 3, 7, 9, 10])).toBe("1–4, 7, 9–10");
  });

  it("kbClauseHref is null without a document address", () => {
    expect(kbClauseHref({ ...CHECKING, docSlug: undefined })).toBeNull();
  });

  it("mapKnowledgeBase keeps the address and clause, drops junk, and is undefined when not searched", () => {
    expect(mapKnowledgeBase(undefined, undefined)).toBeUndefined();
    const kb = mapKnowledgeBase(
      [
        { kind: "knowledge_base", docId: "SP-155", docSlug: "sp-163", docLabel: "СП 163.1325800", clause: "6.4.2.8", anchor: "p-6-4-2-8", checking: true, pendingAmendments: [3, "x"] },
        { kind: "server_verified_tasks", docId: "x", docLabel: "y" },
        { kind: "knowledge_base", docLabel: "без id" },
      ],
      false,
    );
    expect(kb?.sources).toEqual([
      expect.objectContaining({ docId: "SP-155", anchor: "p-6-4-2-8", clause: "6.4.2.8", checking: true, pendingAmendments: [3] }),
    ]);
    expect(kb?.missing).toBe(false);
    expect(mapKnowledgeBase([], true)).toEqual({ sources: [], missing: true });
  });
});

describe("kbClauseLabel", () => {
  it("prints the prefix only before a clause number", () => {
    expect(kbClauseLabel(CARD_FACT)).toBe("СП 163.1325800, п. 6.4.2.8");
    expect(kbClauseLabel({ ...CARD_FACT, clause: "Приложение Ж" })).toBe("СП 163.1325800, Приложение Ж");
    expect(kbClauseLabel({ ...CARD_FACT, clause: undefined })).toBe("СП 163.1325800");
  });
});
