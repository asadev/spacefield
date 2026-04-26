"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
  message?: string;
};

function postError(message: string, stack?: string) {
  try {
    const path = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, message, stack }),
      keepalive: true,
    }).catch(() => {
      // best-effort
    });
  } catch {
    // ignore
  }
}

/**
 * Client-side error boundary that logs to /api/log-error. Render this near
 * the top of the client tree (orchestrator wires it).
 */
export default class ErrorBoundaryLogger extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidMount(): void {
    if (typeof window === "undefined") return;
    window.addEventListener("error", this.handleWindowError);
    window.addEventListener("unhandledrejection", this.handleRejection);
  }

  componentWillUnmount(): void {
    if (typeof window === "undefined") return;
    window.removeEventListener("error", this.handleWindowError);
    window.removeEventListener("unhandledrejection", this.handleRejection);
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    postError(error.message || "unknown", `${error.stack || ""}\n\nComponentStack:\n${info.componentStack || ""}`);
  }

  handleWindowError = (ev: ErrorEvent) => {
    if (!ev || !ev.message) return;
    postError(ev.message, ev.error?.stack);
  };

  handleRejection = (ev: PromiseRejectionEvent) => {
    const reason = ev?.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? "unhandled rejection");
    const stack = reason instanceof Error ? reason.stack : undefined;
    postError(message, stack);
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
            Something went wrong. The error has been logged.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
