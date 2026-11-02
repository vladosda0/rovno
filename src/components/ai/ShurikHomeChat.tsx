import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, Send, X } from "lucide-react";
import { KbSourceLine } from "@/components/ai/KbSourceLine";
import { SaveLearnTargetDialog } from "@/components/ai/SaveLearnTargetDialog";
import { ShurikBubble } from "@/components/ai/ShurikBubble";
import { ShurikAnswerActions, ShurikAnswerTurn, ShurikUserTurn } from "@/components/ai/ShurikChatTurn";
import { SuggestionChips } from "@/components/ai/SuggestionChips";
import { AIQuotaGate, ShurikQuotaFigure, useAiQuotaExceeded } from "@/components/billing/AIQuotaGate";
import { AIQuotaWarning } from "@/components/billing/AIQuotaWarning";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ShurikSelectionAsk } from "@/components/ai/ShurikSelectionAsk";
import { useProjects } from "@/hooks/use-mock-data";
import { useWorkspaceProfilePreferences } from "@/hooks/use-workspace-source";
import { toast } from "@/hooks/use-toast";
import { TIER_QUOTA_QUERY_KEY, selectAiUsage, useTierQuota } from "@/hooks/useTierQuota";
import { invokeAssistantOutsideProject, resolveAiAssistantUiLanguage, userVisibleLiveTextAssistantError } from "@/lib/ai-assistant-client";
import {
  homeAnswerId,
  readHomeAnswerRatings,
  sendAiAnswerRating,
  toggledRating,
  writeHomeAnswerRating,
  type AiAnswerRating,
} from "@/lib/ai-answer-rating";
import { saveAnswerToDocuments, type SaveAnswerTarget } from "@/lib/ai-answer-save";
import { AI_LLM_PROVIDER } from "@/lib/ai-llm-provider";
import {
  exchangesToMessages,
  needsLaterHomeRead,
  readHomeAiChat,
  type HomeAiChatRead,
  finishHomeExchange,
  homeChatHistoryKey,
  homeTurnsToMessages,
  readHomeChatSession,
  settleHomeExchanges,
  subscribeHomeChatSessions,
  updateHomeChatSession,
} from "@/lib/home-ai-chat";
import { seedProjectComposer, shurikQuoteLine, subscribeShurikAsk, takeShurikAsk, type ShurikAsk } from "@/lib/shurik-ask";
import type { AIMessage } from "@/types/ai";

const USAGE_TYPE = "chat" as const;
/** The workspace lists projects by last change, so the head of the list is the recent ones. */
const RECENT_PROJECTS = 3;

let nextExchange = 0;

interface ShurikHomeChatProps {
  profileId: string;
  /** False while another tab of the panel is shown. */
  visible?: boolean;
  /** After a button here has sent the person to a page that is not a project's chat. */
  onPageOpened?: () => void;
}

/** The conversation outside a project: the shared thread from the server, then this visit's turns. */
export function ShurikHomeChat({ profileId, visible = true, onPageOpened }: ShurikHomeChatProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const aiOutputLanguage = useWorkspaceProfilePreferences()?.aiOutputLanguage;
  const { data: tierQuota } = useTierQuota();
  const quotaExceeded = useAiQuotaExceeded(USAGE_TYPE);
  const navigate = useNavigate();
  const projects = useProjects();

  // Read fresh on every open, for the bot writes here too, and after each answer, which is what
  // takes that exchange off this side.
  const history = useQuery({
    queryKey: homeChatHistoryKey(profileId),
    queryFn: readHomeAiChat,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const [ratings, setRatings] = useState(() => readHomeAnswerRatings(profileId));
  const { exchanges, pending } = useSyncExternalStore(subscribeHomeChatSessions, () => readHomeChatSession(profileId));
  const [draft, setDraft] = useState("");
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [toSave, setToSave] = useState<AIMessage | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [attached, setAttached] = useState<Pick<ShurikAsk, "label" | "quote"> | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!history.data) return;
    const { turns, startedAt } = history.data;
    updateHomeChatSession(profileId, (session) => ({ exchanges: settleHomeExchanges(session.exchanges, turns, startedAt) }));
    if (needsLaterHomeRead(readHomeChatSession(profileId).exchanges, startedAt)) {
      void queryClient.invalidateQueries({ queryKey: homeChatHistoryKey(profileId) });
    }
  }, [history.data, profileId, queryClient]);

  const messages = useMemo(() => {
    const all = [...homeTurnsToMessages(history.data?.turns ?? []), ...exchangesToMessages(exchanges)];
    return all.map((message) => (ratings[message.id] ? { ...message, rating: ratings[message.id] } : message));
  }, [history.data, exchanges, ratings]);

  useEffect(() => {
    if (visible) bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, pending, visible]);

  const quotaBlocked = useCallback(() => {
    if (!tierQuota) return false;
    const { used, limit } = selectAiUsage(tierQuota, USAGE_TYPE);
    if (limit <= 0 || used < limit) return false;
    const periodEnd = new Date(tierQuota.period_end).toLocaleDateString(i18n.language);
    toast({ title: t(`quota.gate.${USAGE_TYPE}.title`), description: t(`quota.gate.${USAGE_TYPE}.body`, { periodEnd }) });
    return true;
  }, [tierQuota, i18n.language, t]);

  const ask = useCallback(async (content: string, exchangeId: string) => {
    updateHomeChatSession(profileId, () => ({ pending: true }));
    try {
      const result = await invokeAssistantOutsideProject({
        userMessage: content,
        aiOutputLanguage,
        llmProvider: AI_LLM_PROVIDER,
      });
      const answer: AIMessage = {
        id: homeAnswerId(result.explanation),
        role: "assistant",
        content: result.explanation,
        timestamp: new Date().toISOString(),
        ...(result.needsProject ? { needsProjectQuestion: content } : {}),
        liveTextAssistantV1: {
          version: 1,
          grounding: result.grounding,
          assistantUiLanguage: result.assistantUiLanguage,
          knowledgeBase: result.knowledgeBase,
          followUps: result.followUps,
        },
      };
      updateHomeChatSession(profileId, (session) => ({
        exchanges: finishHomeExchange(session.exchanges, exchangeId, answer, performance.now()),
      }));
      // The server wrote the turn before it answered, so this read holds it. With the panel
      // closed there is nothing to refetch, and the next open reads anew.
      void queryClient.invalidateQueries({ queryKey: homeChatHistoryKey(profileId) });
    } catch (err) {
      const failure: AIMessage = {
        id: `${exchangeId}:failure`,
        role: "assistant",
        content: userVisibleLiveTextAssistantError(err, resolveAiAssistantUiLanguage(aiOutputLanguage, content)),
        timestamp: new Date().toISOString(),
        failed: true,
      };
      updateHomeChatSession(profileId, (session) => ({
        exchanges: session.exchanges.map((exchange) => (
          exchange.id === exchangeId
            ? { ...exchange, status: "failed" as const, answer: failure, finishedAt: performance.now() }
            : exchange
        )),
      }));
      void queryClient.invalidateQueries({ queryKey: homeChatHistoryKey(profileId) });
    } finally {
      updateHomeChatSession(profileId, () => ({ pending: false }));
      setRegeneratingId(null);
      queryClient.invalidateQueries({ queryKey: TIER_QUOTA_QUERY_KEY });
    }
  }, [aiOutputLanguage, profileId, queryClient]);

  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const attachedRef = useRef(attached);
  attachedRef.current = attached;

  // Sends apart from the composer: what lies in the field stays. False when it cannot go now.
  const deliver = useCallback((content: string, hideQuestion = false) => {
    if (pendingRef.current) {
      toast({ title: t("ai.sidebar.toast.aiBusy.title") });
      return false;
    }
    if (quotaBlocked()) return false;
    pendingRef.current = true;
    nextExchange += 1;
    const id = `home-exchange:${nextExchange}`;
    updateHomeChatSession(profileId, (session) => ({ exchanges: [
      ...session.exchanges,
      {
        id,
        question: content,
        timestamp: new Date().toISOString(),
        status: "pending",
        lastAnswerAtSend: queryClient
          .getQueryData<HomeAiChatRead>(homeChatHistoryKey(profileId))
          ?.turns.filter((turn) => turn.role === "assistant").at(-1)?.text,
        ...(hideQuestion ? { hideQuestion: true } : {}),
      },
    ] }));
    void ask(content, id);
    return true;
  }, [ask, profileId, queryClient, quotaBlocked, t]);

  // What a page of the base attached goes up inside the message: the server takes no
  // context outside a project, and the search under the answer reads the message.
  const withContext = useCallback((context: Pick<ShurikAsk, "label" | "quote">, typed: string) => (
    context.quote
      ? `${shurikQuoteLine(context.quote, context.label)}${typed}`
      : `${t("ai.home.aboutPrefix", { label: context.label })}${typed}`
  ), [t]);

  function sendComposer() {
    const typed = draft.trim();
    if (!typed) return;
    if (deliver(attached ? withContext(attached, typed) : typed)) {
      setDraft("");
      setAttached(null);
    }
  }

  const deliverRef = useRef(deliver);
  deliverRef.current = deliver;

  // A selection with a question goes at once; the header button and a bare selection wait for one.
  // What cannot go or be attached now lands in the field, in front of a draft.
  const takeAsk = useCallback(() => {
    const incoming = takeShurikAsk();
    if (!incoming) return;
    const { question, ...context } = incoming;
    if (question) {
      const content = withContext(context, question);
      if (deliverRef.current(content)) return;
      setDraft((prev) => (prev.trim() ? `${content}\n${prev}` : content));
    } else if (attachedRef.current) {
      const line = withContext(context, "");
      setDraft((prev) => `${line}${prev}`);
    } else {
      setAttached(context);
    }
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [withContext]);

  useEffect(() => {
    takeAsk();
    return subscribeShurikAsk(takeAsk);
  }, [takeAsk]);

  // By position and not by id: a fixed answer given twice has one id.
  function questionBefore(index: number): AIMessage | undefined {
    return messages.slice(0, index).reverse().find((item) => item.role === "user");
  }

  function rate(message: AIMessage, index: number, pressed: AiAnswerRating) {
    const rating = toggledRating(message.rating, pressed);
    setRatings((prev) => {
      const { [message.id]: _previous, ...rest } = prev;
      return rating ? { ...rest, [message.id]: rating } : rest;
    });
    writeHomeAnswerRating(profileId, message.id, rating);
    void sendAiAnswerRating({
      messageId: message.id,
      rating,
      projectId: null,
      question: questionBefore(index)?.content ?? "",
      answer: message.content,
    });
  }

  async function copy(message: AIMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      toast({ title: t("ai.sidebar.toast.copy.title"), description: t("ai.sidebar.toast.copy.description") });
    } catch {
      toast({ title: t("ai.sidebar.toast.copyFailed.title"), description: t("ai.sidebar.toast.copyFailed.description"), variant: "destructive" });
    }
  }

  function regenerate(message: AIMessage, index: number) {
    const question = questionBefore(index);
    if (!question) {
      toast({ title: t("ai.sidebar.toast.nothingToRegenerate.title"), description: t("ai.sidebar.toast.nothingToRegenerate.description"), variant: "destructive" });
      return;
    }
    if (pendingRef.current) {
      toast({ title: t("ai.sidebar.toast.aiBusy.title"), description: t("ai.sidebar.toast.aiBusy.description"), variant: "destructive" });
      return;
    }
    if (deliver(question.content, true)) setRegeneratingId(message.id);
  }

  async function save(target: SaveAnswerTarget) {
    if (!toSave) return;
    const message = toSave;
    setSaving(true);
    try {
      await saveAnswerToDocuments(target, message.content, profileId, t("ai.sidebar.learnNote.defaultTitle"));
      const prefix = target.kind === "personal" ? "ai.sidebar.toast.saved" : "ai.sidebar.toast.savedToProject";
      toast({ title: t(`${prefix}.title`), description: t(`${prefix}.description`) });
      setSavedIds((prev) => new Set(prev).add(message.id));
      setToSave(null);
    } catch (error) {
      toast({
        title: t("ai.sidebar.toast.saveError.title"),
        description: error instanceof Error ? error.message : t("ai.sidebar.toast.saveError.description"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function intoComposer(text: string) {
    // Keep a draft the person already typed: the quote goes in front of it.
    setDraft((prev) => (prev.trim() ? `${text}${prev}` : text));
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  const empty = !history.isLoading && !history.isError && messages.length === 0;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div ref={conversationRef} className="flex min-h-full flex-col px-3 py-2">
          {history.isLoading && messages.length === 0 && <Skeleton data-testid="shurik-chat-loading" className="h-16 w-full rounded-card" />}
          {history.isError && <p className="text-caption text-muted-foreground">{t("ai.home.historyError")}</p>}
          {empty && quotaExceeded && <ShurikQuotaFigure />}
          {empty && !quotaExceeded && <p className="text-caption text-muted-foreground">{t("ai.home.intro")}</p>}
          {messages.map((message, index) =>
            message.role === "user" ? (
              <ShurikUserTurn key={`${index}:${message.id}`} content={message.content} />
            ) : (
              <ShurikAnswerTurn
                key={`${index}:${message.id}`}
                message={message.needsProjectQuestion === undefined ? message : { ...message, content: t("ai.home.needsProject") }}
              >
                {message.needsProjectQuestion === undefined ? null : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {projects.slice(0, RECENT_PROJECTS).map((project) => (
                      <Button
                        key={project.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 max-w-full rounded-pill px-2.5 text-caption"
                        onClick={() => {
                          seedProjectComposer(project.id, message.needsProjectQuestion ?? "");
                          navigate(`/project/${project.id}/dashboard`);
                        }}
                      >
                        <span className="truncate">{project.title}</span>
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-pill px-2.5 text-caption"
                      onClick={() => {
                        navigate("/home?tab=projects");
                        onPageOpened?.();
                      }}
                    >
                      {projects.length > 0 ? t("ai.home.allProjects") : t("ai.home.createProject")}
                    </Button>
                  </div>
                )}
                {message.liveTextAssistantV1?.knowledgeBase ? (
                  <KbSourceLine knowledgeBase={message.liveTextAssistantV1.knowledgeBase} onAskAboutClause={intoComposer} />
                ) : null}
                {message.liveTextAssistantV1?.followUps?.length ? (
                  <div className="mt-1.5 min-w-0 max-w-full">
                    <p className="mb-1 text-[10px] font-medium text-muted-foreground">{t("ai.sidebar.chat.suggestedFollowUps")}</p>
                    <SuggestionChips
                      suggestions={message.liveTextAssistantV1.followUps.map((f) => f.prompt)}
                      onSelect={setDraft}
                      singleLineScrollable
                    />
                  </div>
                ) : null}
                {!message.failed && (
                  <ShurikAnswerActions
                    rating={message.rating}
                    saved={savedIds.has(message.id)}
                    regenerating={regeneratingId === message.id}
                    onCopy={() => { void copy(message); }}
                    onRate={(rating) => rate(message, index, rating)}
                    onSave={() => setToSave(message)}
                    onRegenerate={() => regenerate(message, index)}
                  />
                )}
              </ShurikAnswerTurn>
            ),
          )}
          {pending && (
            <div className="py-1.5">
              <ShurikBubble pose="thinking">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
              </ShurikBubble>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 px-3 pb-2 pt-1.5">
        <AIQuotaWarning usageType={USAGE_TYPE} />
        {attached && (
          <div className="flex flex-col gap-1" data-testid="shurik-attached">
            <div className="flex items-center gap-1">
              <p className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
                {t("ai.home.inConversation", { label: attached.label })}
              </p>
              <button
                type="button"
                aria-label={t("ai.home.detachContext")}
                title={t("ai.home.detachContext")}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                onClick={() => setAttached(null)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {attached.quote && (
              <blockquote className="max-h-24 overflow-y-auto rounded-r-lg border-l-[3px] border-accent bg-background px-2.5 py-1.5 text-caption text-foreground">
                {attached.quote}
              </blockquote>
            )}
          </div>
        )}
        {empty && !quotaExceeded && (
          <SuggestionChips
            suggestions={[t("ai.home.suggestion.walls"), t("ai.home.suggestion.slope")]}
            onSelect={setDraft}
            singleLineScrollable
          />
        )}
        <AIQuotaGate usageType={USAGE_TYPE}>
          <div className="flex w-full min-w-0 items-end gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/50 px-2 py-1.5 shadow-sm transition-[box-shadow,border-color] focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/25">
            <Textarea
              ref={composerRef}
              placeholder={t("ai.sidebar.composer.placeholderDefault")}
              aria-label={t("ai.sidebar.composer.placeholderDefault")}
              className="block max-h-[160px] min-h-[38px] w-full flex-1 resize-none border-0 bg-transparent px-1 py-2 text-body-sm shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendComposer();
                }
              }}
            />
            <Button
              size="icon"
              aria-label={t("ai.home.send")}
              className="h-9 w-9 shrink-0 rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={pending}
              onClick={sendComposer}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </AIQuotaGate>
        <p className="w-full min-w-0 px-1 text-[10px] leading-snug text-muted-foreground" data-testid="shurik-disclaimer">
          {t("ai.sidebar.composer.disclaimer")}
          <span className="ml-1 whitespace-nowrap rounded-pill bg-accent/15 px-1.5 py-0.5 font-medium text-accent">
            {t("ai.sidebar.composer.beta")}
          </span>
        </p>
      </div>

      <ShurikSelectionAsk
        containerRef={conversationRef}
        within="[data-shurik-answer-text]"
        onSubmit={(quote, _label, question) => {
          if (question) return deliver(`${shurikQuoteLine(quote)}${question}`);
          intoComposer(shurikQuoteLine(quote));
          return true;
        }}
      />

      <SaveLearnTargetDialog
        open={toSave !== null}
        onOpenChange={(open) => { if (!open) setToSave(null); }}
        projects={projects.map((project) => ({ id: project.id, title: project.title }))}
        onConfirm={save}
        saving={saving}
      />
    </>
  );
}
