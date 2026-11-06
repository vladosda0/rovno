// «Следить за изменениями» / «✓ Вы следите» (docs-library slice 8, step 8.5;
// mockup docs-library-s8.html v3, frames 4, 4a, 5a). One outline button with two
// states; the second click stops following, hinted «Не следить». A guest on the
// site goes to sign-up, and the document is followed once they are signed in
// (KbPendingWatch). In the app it stands next to «Спросить Шурика» and in the
// document window before «Закрыть».

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { kbKeys, useKbWatching } from "@/hooks/use-knowledge-base";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { setKbWatch } from "@/lib/knowledge-base/api";
import { kbDocPath } from "@/lib/knowledge-base/kbConfig.mjs";
import { rememberKbPendingWatch } from "@/lib/knowledge-base/kbPendingWatch";

/** Sign-up, the same target as the guest «Спросить Шурика» (decision D6), back to this page after. */
const SIGN_UP_PATH = "/auth/signup";

interface KbWatchButtonProps {
  slug: string;
  /** "app": the product's outline button; "site": the public page's button, sign-up for a guest. */
  appearance?: "app" | "site";
  /** "sm" in a page header, "default" among the document window's footer buttons. */
  size?: "sm" | "default";
}

export function KbWatchButton({ slug, appearance = "app", size = "sm" }: KbWatchButtonProps) {
  const { t } = useTranslation();
  const auth = useRuntimeAuth();
  const signedIn = auth.status === "authenticated";
  const profileId = signedIn ? auth.profileId ?? "me" : null;
  const queryClient = useQueryClient();
  const watching = useKbWatching(slug, profileId);
  const key = kbKeys.watching(slug, profileId);
  const mutation = useMutation({
    mutationFn: (watch: boolean) => setKbWatch(slug, watch),
    onMutate: () => queryClient.cancelQueries({ queryKey: key }),
    onSuccess: (state) => queryClient.setQueryData(key, state),
    onError: () => toast({ title: t("home.knowledgeBase.watch.error"), variant: "destructive" }),
  });

  if (auth.status === "loading") return null;

  if (!signedIn) {
    if (appearance !== "site") return null;
    return (
      <Link
        className="rv-btn rv-btn--secondary"
        to={`${SIGN_UP_PATH}?next=${encodeURIComponent(kbDocPath(slug))}`}
        onClick={() => rememberKbPendingWatch(slug)}
      >
        <Bell className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t("home.knowledgeBase.watch.follow")}
      </Link>
    );
  }

  const on = watching.data === true;
  const busy = watching.isLoading || mutation.isPending;
  const content = (
    <>
      {on ? (
        <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
      ) : (
        <Bell className="mr-1.5 h-4 w-4" aria-hidden="true" />
      )}
      {t(on ? "home.knowledgeBase.watch.following" : "home.knowledgeBase.watch.follow")}
    </>
  );
  const onClick = () => mutation.mutate(!on);
  const button =
    appearance === "site" ? (
      <button type="button" className="rv-btn rv-btn--secondary" onClick={onClick} disabled={busy}>
        {content}
      </button>
    ) : (
      <Button type="button" size={size} variant="outline" onClick={onClick} disabled={busy}>
        {content}
      </Button>
    );

  if (!on) return button;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{t("home.knowledgeBase.watch.unfollow")}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
