// Shared chrome for public blog and knowledge-base pages: the new site header
// and footer (site-redesign 1.5) around a body that keeps the .rv-landing look
// until slice 2. useLandingCta stays the one auth-aware wiring of the CTAs.

import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { seedProjects } from "@/data/seed";
import { enterDemoSession } from "@/lib/auth-state";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { SiteChrome } from "@/components/site/SiteChrome";
import type { SiteCta } from "@/components/site/site-links";
import "@/components/landing/landing.css";
import "./blog.css";

export function useLandingCta() {
  const navigate = useNavigate();
  const { status } = useRuntimeAuth();
  const startPath = status === "authenticated" ? "/home" : "/auth/signup";
  const demoProjectId = seedProjects[0]?.id;
  const onDemo = () => {
    if (!demoProjectId) return;
    enterDemoSession(demoProjectId);
    navigate(`/project/${demoProjectId}/dashboard`);
  };
  return { startPath, onDemo, authStatus: status };
}

export function BlogShell({ children }: { children: ReactNode }) {
  const { authStatus } = useLandingCta();
  const signedIn = authStatus === "authenticated";
  const cta: SiteCta = {
    startPath: signedIn ? "/home" : "/auth/signup",
    loginPath: signedIn ? "/home" : "/auth/login",
    signedIn,
  };
  return (
    <SiteChrome cta={cta}>
      <div className="rv-landing">{children}</div>
    </SiteChrome>
  );
}
