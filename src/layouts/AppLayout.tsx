import { Outlet, useLocation, useSearchParams } from "react-router-dom";
import { Suspense, lazy, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/TopBar";
import { ShurikFloat } from "@/components/ai/ShurikFloat";
import { ShurikOutsidePanel } from "@/components/ai/ShurikOutsidePanel";
import { outsidePanelOpeningTab, type ShurikPanelTab } from "@/components/ai/ShurikPanelTabs";
import { DemoSignupCta } from "@/components/system/DemoSignupCta";
import { ClientReportDialogHost } from "@/components/client-report/ClientReportDialogHost";
import { useWorkspaceMode } from "@/hooks/use-mock-data";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import { subscribePhotoConsult } from "@/lib/photo-consult-store";
import { subscribeShurikAsk } from "@/lib/shurik-ask";
import { useBrowserTimezoneSync } from "@/hooks/use-browser-timezone-sync";
import { useProfileGenderHint } from "@/hooks/use-profile-gender-hint";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { useShurikMessages, useShurikMessagesLiveUpdates } from "@/hooks/use-shurik-messages";
import { useShurikHintOfDay, useShurikHintRenderable } from "@/hooks/use-shurik-hint";
import {
  SHURIK_HINT_QUERY_PARAM,
  SHURIK_HINT_QUERY_VALUE,
  shurikHintTextKey,
  shurikHintTextValues,
} from "@/lib/shurik-hints";
import { useTranslation } from "react-i18next";
import { setAnalyticsUserId } from "@/lib/analytics";
import { setSentryUser } from "@/lib/observability/sentry";
import { getAuthStateSnapshot, isAuthenticated, subscribeAuthState } from "@/lib/auth-state";
import {
  readAiSidebarSessionPreference,
  writeAiSidebarSessionPreference,
} from "@/lib/ai-sidebar-session";

const AISidebar = lazy(() =>
  import("@/components/AISidebar").then((module) => ({ default: module.AISidebar })),
);

/**
 * The project AI sidebar appears ONLY on project pages (`/project/:id/...`). Every
 * other AppLayout route — Home, Settings, Profile, Demo, and the full T-Bank
 * billing flow (checkout / success / fail) — has Shurik in the same corner, and his
 * panel there stands on the right with its own chat and notifications.
 * Matched by pathname prefix, so query strings are irrelevant.
 */
const AI_SIDEBAR_ROUTE_PREFIX = "/project/";

const MOBILE_BREAKPOINT_PX = 768;

export default function AppLayout() {
  const [aiSidebarCollapsed, setAiSidebarCollapsed] = useState(() => {
    const stored = readAiSidebarSessionPreference();
    if (stored !== null) return stored;
    if (typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_PX) return true;
    return false;
  });
  const [panelTab, setPanelTab] = useState<ShurikPanelTab>("chat");
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  useShurikMessagesLiveUpdates();
  useBrowserTimezoneSync();
  useProfileGenderHint();
  const { messages: shurikMessages, unreadCount: shurikUnreadCount, markRead: markShurikMessagesRead } = useShurikMessages();
  const [outsidePanelOpen, setOutsidePanelOpen] = useState(false);
  const [outsideTab, setOutsideTab] = useState<ShurikPanelTab>("chat");
  const currentPage = location.pathname + location.search;
  // On a computer the panel stays open across pages, or a source pressed in an answer would
  // close the conversation. On a phone it is the whole screen, so a new page closes it.
  useEffect(() => {
    if (window.innerWidth < MOBILE_BREAKPOINT_PX) setOutsidePanelOpen(false);
  }, [currentPage]);
  useSyncExternalStore(subscribeAuthState, getAuthStateSnapshot);

  const hideAi = !location.pathname.startsWith(AI_SIDEBAR_ROUTE_PREFIX);
  // The hint of the day belongs to the project on screen; the collapsed panel shows its first words.
  const { t, i18n } = useTranslation();
  const hintProjectId = hideAi ? null : location.pathname.slice(AI_SIDEBAR_ROUTE_PREFIX.length).split("/")[0] || null;
  const { hint } = useShurikHintOfDay(hintProjectId);
  const hintRenderable = useShurikHintRenderable(hint, hintProjectId);
  const hintText = hint && hintRenderable && hint.status === "active"
    ? t(shurikHintTextKey(hint.hint_key), shurikHintTextValues(hint.params, i18n.language))
    : null;
  const runtimeAuth = useRuntimeAuth();
  const workspaceMode = useWorkspaceMode();
  const isDemo = workspaceMode.kind === "demo";
  // A guest has neither messages to receive nor anyone to talk to him as.
  const hasShurikOutsideProject = workspaceMode.kind === "supabase"
    || workspaceMode.kind === "demo"
    || (workspaceMode.kind === "local" && isAuthenticated());
  const showOutsidePanel = hideAi && hasShurikOutsideProject && outsidePanelOpen;
  const showOutsideFloat = hideAi && hasShurikOutsideProject && !outsidePanelOpen;
  const panelOpen = hideAi ? showOutsidePanel : !aiSidebarCollapsed;
  const floatShown = hideAi ? showOutsideFloat : aiSidebarCollapsed;

  // Entering a project closes this panel and opens the project's chat in its place.
  const outsidePanelWasOpen = useRef(false);
  outsidePanelWasOpen.current = showOutsidePanel || (outsidePanelWasOpen.current && !hideAi);
  useEffect(() => {
    if (hideAi || !outsidePanelWasOpen.current) return;
    outsidePanelWasOpen.current = false;
    setOutsidePanelOpen(false);
    setPanelTab("chat");
    setAiSidebarCollapsed(false);
  }, [hideAi]);

  // A page of the base asked Shurik: the panel opens on the chat, which takes the question.
  useEffect(() => subscribeShurikAsk(() => {
    setOutsideTab("chat");
    setOutsidePanelOpen(true);
  }), []);

  useEffect(() => {
    return subscribePhotoConsult(({ context }) => {
      if (context && !hideAi) {
        setPanelTab("chat");
        setAiSidebarCollapsed(false);
      }
    });
  }, [hideAi]);

  // The button of the hint sent to Telegram: open the chat, where the card of the day stands, and
  // take the mark out of the address. Like the photo consult, the person's own choice is not rewritten.
  const hintRequested = !hideAi && searchParams.get(SHURIK_HINT_QUERY_PARAM) === SHURIK_HINT_QUERY_VALUE;
  useEffect(() => {
    if (!hintRequested) return;
    setPanelTab("chat");
    setAiSidebarCollapsed(false);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(SHURIK_HINT_QUERY_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [hintRequested, setSearchParams]);

  useEffect(() => {
    if (runtimeAuth.status === "authenticated") {
      setAnalyticsUserId(runtimeAuth.profileId);
      setSentryUser(runtimeAuth.profileId);
    } else {
      setAnalyticsUserId(null);
      setSentryUser(null);
    }
  }, [runtimeAuth.status, runtimeAuth.profileId]);

  const setSidebarCollapsedByUser = (collapsed: boolean) => {
    setAiSidebarCollapsed(collapsed);
    writeAiSidebarSessionPreference(collapsed);
  };

  // With no tab named: unread messages first, otherwise the chat (the answer to question 3 of slice 6).
  const openOutsidePanel = (tab?: ShurikPanelTab) => {
    setOutsideTab(tab ?? outsidePanelOpeningTab(shurikUnreadCount));
    setOutsidePanelOpen(true);
  };

  const openShurikFromTopBar = () => {
    if (hideAi) {
      openOutsidePanel();
      return;
    }
    setPanelTab("notifications");
    setSidebarCollapsedByUser(false);
  };

  return (
    <div className="flex flex-col min-h-screen w-full">
      <TopBar
        aiSidebarCollapsed={hideAi ? true : aiSidebarCollapsed}
        onToggleAiSidebar={() => {
          if (!hideAi) setSidebarCollapsedByUser(!aiSidebarCollapsed);
        }}
        onSetAiSidebarOpen={(open) => {
          if (hideAi) return;
          if (open) setPanelTab("chat");
          setSidebarCollapsedByUser(!open);
        }}
        hideAi={hideAi}
        onOpenShurikNotifications={hideAi && !hasShurikOutsideProject ? undefined : openShurikFromTopBar}
        shurikUnreadCount={shurikUnreadCount}
      />
      {/* pt reserves the fixed TopBar (3rem) plus the demo strip when a demo
          session is active (--demo-banner-h is 0px otherwise). */}
      <div className="flex flex-1 pt-[calc(3rem+var(--demo-banner-h,0px))]">
        {/* One position for both cases, so crossing the project boundary keeps him mounted. */}
        {floatShown && (
          <ShurikFloat
            messages={shurikMessages}
            hintText={hintText}
            onOpen={(tab) => {
              if (hideAi) {
                openOutsidePanel(tab);
                return;
              }
              if (tab) setPanelTab(tab);
              setSidebarCollapsedByUser(false);
            }}
          />
        )}
        {!hideAi && !aiSidebarCollapsed && (
          <Suspense fallback={<div className="w-[420px] max-w-[45vw] shrink-0" />}>
            <AISidebar
              collapsed={aiSidebarCollapsed}
              onCollapsedChange={setSidebarCollapsedByUser}
              panelTab={panelTab}
              onPanelTabChange={setPanelTab}
            />
          </Suspense>
        )}
        <main
          className={cn(
            "flex-1 min-w-0",
            panelOpen && "hidden md:block",
            floatShown && "md:pb-24",
          )}
        >
          <Outlet />
          {/* Demo→signup bridge at the bottom of EVERY demo page: one layout-
              level mount instead of a copy in each of the ~16 tab screens. */}
          {isDemo && <DemoSignupCta />}
        </main>
        {showOutsidePanel && (
          <ShurikOutsidePanel
            messages={shurikMessages}
            unreadCount={shurikUnreadCount}
            onMarkRead={markShurikMessagesRead}
            onClose={() => setOutsidePanelOpen(false)}
            tab={outsideTab}
            onTabChange={setOutsideTab}
            chatProfileId={workspaceMode.kind === "supabase" ? workspaceMode.profileId : null}
            clientReportAvailable={workspaceMode.kind === "supabase"}
            onAction={() => {
              // On a phone the panel covers the page the button has just opened.
              if (window.innerWidth < MOBILE_BREAKPOINT_PX) {
                // It has opened a page, so a project there is not to open its chat over it.
                outsidePanelWasOpen.current = false;
                setOutsidePanelOpen(false);
              }
            }}
          />
        )}
      </div>
      <ClientReportDialogHost />
      {/* Observability v1 (R-8): fixed feedback entry point on every
          authenticated page; renders nothing for guests. */}
      <FeedbackWidget besidePanel={showOutsidePanel} />
    </div>
  );
}
