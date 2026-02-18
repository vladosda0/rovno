import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bot, Send } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ChatMessage } from "@/components/ai/ChatMessage";
import { SuggestionChips } from "@/components/ai/SuggestionChips";
import { CreditDisplay } from "@/components/ai/CreditDisplay";
import { useCurrentUser } from "@/hooks/use-mock-data";
import { usePermission } from "@/lib/permissions";
import { generateProposal, getTextResponse } from "@/lib/ai-engine";
import { commitProposal } from "@/lib/commit-proposal";
import { toast } from "@/hooks/use-toast";
import type { AIMessage, AIProposal } from "@/types/ai";

const PROJECT_SUGGESTIONS = ["Add tasks", "Update estimate", "Generate contract", "Buy materials"];
const GLOBAL_SUGGESTIONS = ["Create project", "Compare estimates", "Best tile adhesive?"];

export function AISidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isProjectContext = location.pathname.startsWith("/project/");
  const projectId = isProjectContext ? location.pathname.split("/")[2] : "";
  const title = isProjectContext ? "Project AI" : "Global AI";

  const user = useCurrentUser();
  const perm = isProjectContext ? usePermission(projectId) : null;

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
  }, [location.pathname]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const totalCredits = user.credits_free + user.credits_paid;

  function handleSend(text?: string) {
    const content = (text ?? inputValue).trim();
    if (!content) return;
    setInputValue("");

    if (totalCredits <= 0) {
      setLimitModalOpen(true);
      return;
    }

    if (isProjectContext && perm && !perm.can("ai.generate")) {
      toast({ title: "Access denied", description: "You don't have permission to use AI generation.", variant: "destructive" });
      return;
    }

    const userMsg: AIMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };

    let proposal: AIProposal | null = null;
    let assistantContent: string;

    if (isProjectContext) {
      proposal = generateProposal(content, projectId);
    }

    if (proposal) {
      assistantContent = `Here's what I'd do:`;
    } else {
      assistantContent = getTextResponse();
    }

    const assistantMsg: AIMessage = {
      id: `msg-${Date.now() + 1}`,
      role: "assistant",
      content: assistantContent,
      timestamp: new Date().toISOString(),
      proposal: proposal ?? undefined,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
  }

  function handleConfirm(msgId: string) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.proposal) return m;
        const result = commitProposal(m.proposal);
        if (result.success) {
          toast({ title: "Changes applied", description: `${result.count} change${(result.count ?? 0) !== 1 ? "s" : ""} committed.` });
          return { ...m, proposal: { ...m.proposal, status: "confirmed" as const } };
        } else {
          toast({ title: "Failed", description: result.error, variant: "destructive" });
          return m;
        }
      })
    );
  }

  function handleCancel(msgId: string) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.proposal) return m;
        toast({ title: "Proposal cancelled", description: "No changes were made." });
        return { ...m, proposal: { ...m.proposal, status: "cancelled" as const } };
      })
    );
  }

  const suggestions = isProjectContext ? PROJECT_SUGGESTIONS : GLOBAL_SUGGESTIONS;

  return (
    <>
      <Sidebar collapsible="icon" className="glass-sidebar border-r-0 top-12 h-[calc(100svh-48px)]">
        <SidebarHeader className="p-sp-2 space-y-2">
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
              <Bot className="h-4 w-4 text-accent" />
            </div>
            <span className="text-body-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              {title}
            </span>
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <CreditDisplay onLimitReached={() => setLimitModalOpen(true)} />
          </div>
        </SidebarHeader>

        <SidebarContent className="p-0 group-data-[collapsible=icon]:hidden flex flex-col flex-1 overflow-hidden">
          <ScrollArea className="flex-1 px-sp-1">
            <div ref={scrollRef} className="space-y-3 py-sp-1">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center px-sp-2 py-sp-4">
                  <Bot className="mb-sp-2 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-body-sm text-muted-foreground">
                    {isProjectContext
                      ? "Ask about this project — tasks, estimates, documents..."
                      : "Create a project, get recommendations, or ask anything."}
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    onConfirm={() => handleConfirm(msg.id)}
                    onCancel={() => handleCancel(msg.id)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </SidebarContent>

        <SidebarFooter className="p-sp-1 space-y-1.5 group-data-[collapsible=icon]:hidden">
          {messages.length === 0 && (
            <SuggestionChips suggestions={suggestions} onSelect={(s) => handleSend(s)} />
          )}
          <div className="flex gap-1.5">
            <Input
              placeholder="Ask AI..."
              className="h-9 text-body-sm bg-sidebar-accent/50 border-sidebar-border"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <Button
              size="icon"
              className="h-9 w-9 shrink-0 bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => handleSend()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <ConfirmModal
        open={limitModalOpen}
        onOpenChange={setLimitModalOpen}
        title="Credit limit reached"
        description="You've used all available credits. Upgrade your plan to continue using AI features."
        confirmLabel="Upgrade"
        onConfirm={() => {
          setLimitModalOpen(false);
          navigate("/pricing");
        }}
        onCancel={() => setLimitModalOpen(false)}
      />
    </>
  );
}
