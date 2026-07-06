// Shared chrome for public blog pages: landing Nav on top, Interlude + Footer
// below, all inside the .rv-landing design-system scope (same wiring as
// pages/Landing.tsx — auth-aware CTA, demo session hand-off).

import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { seedProjects } from "@/data/seed";
import { enterDemoSession } from "@/lib/auth-state";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { Nav, Interlude, Footer } from "@/components/landing/LandingSections";
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
  return { startPath, onDemo };
}

export function BlogShell({ children }: { children: ReactNode }) {
  const { startPath, onDemo } = useLandingCta();
  return (
    <div className="rv-landing">
      <Nav startPath={startPath} homeLink />
      {children}
      <Interlude tone="sage" />
      <Footer onDemo={onDemo} />
    </div>
  );
}
