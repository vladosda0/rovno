import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureException } from "@/lib/observability/sentry";

interface RootErrorBoundaryProps {
  children: ReactNode;
}

interface RootErrorBoundaryState {
  hasError: boolean;
}

/**
 * Last-resort error boundary around the whole app: reports the render crash
 * and replaces the previous white-screen-of-death with a minimal reload
 * prompt. Deliberately i18n-free and router-free — when this renders, the
 * provider tree may be the thing that just crashed.
 */
export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    captureException(error, {
      tags: { source: "react-error-boundary" },
      extra: { componentStack: info.componentStack },
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold text-foreground">Что-то пошло не так</h1>
          <p className="text-sm text-muted-foreground">
            Произошла непредвиденная ошибка. Попробуйте обновить страницу — обычно это помогает.
            Если ошибка повторяется, напишите нам через кнопку «Обратная связь».
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Обновить страницу
          </button>
        </div>
      </div>
    );
  }
}
