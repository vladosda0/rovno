// Access gate for /blog/admin/* — editorial allowlist only.
//
// Guests are sent to login; authenticated non-authors get a flat "not found"
// style refusal (the admin's existence is not advertised). RLS enforces the
// same rule server-side; this guard only shapes UX.

import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { useMyBlogAuthor } from "@/hooks/use-blog";

export function BlogAdminGuard({ children }: { children: ReactNode }) {
  const { status } = useRuntimeAuth();
  const { isAuthor, isLoading } = useMyBlogAuthor();

  if (status === "guest") {
    return <Navigate to="/auth/login" replace />;
  }

  if (status === "loading" || isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  if (!isAuthor) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
        <p className="text-lg font-medium">Страница не найдена</p>
        <p className="text-sm text-muted-foreground">Проверьте адрес или вернитесь на главную.</p>
      </div>
    );
  }

  return <>{children}</>;
}
