import { useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SignInPromptProps {
  /** Short explanation of why a session is needed (panel-specific i18n string). */
  hint: string;
  /** CTA button label (panel-specific i18n string). */
  ctaLabel: string;
}

/**
 * Sign-in nudge for settings panels reachable by session-less visitors. AppLayout
 * does not redirect demo / local / guest users, so panels whose actions require a
 * real Supabase session render this in place of the doomed action — a hint plus a
 * CTA routing to the login page, mirroring the AISidebar guest overlay.
 *
 * The hint and label are passed in (not looked up here) so each panel keeps its
 * own i18n keys and matches its namespace's RU tone.
 */
export function SignInPrompt({ hint, ctaLabel }: SignInPromptProps) {
  const navigate = useNavigate();
  return (
    <div className="space-y-sp-2">
      <p className="text-caption text-muted-foreground">{hint}</p>
      <Button className="w-full sm:w-auto" onClick={() => navigate("/auth/login")}>
        <LogIn className="mr-2 h-4 w-4" />
        {ctaLabel}
      </Button>
    </div>
  );
}
