import { Component, type ErrorInfo, type ReactNode } from "react";
import { errorMessage, trackClientEvent } from "./clientEvents";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: errorMessage(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    trackClientEvent({
      type: "client.render_error",
      level: "error",
      message: errorMessage(error),
      metadata: {
        componentStack: info.componentStack ?? "",
        path: typeof window === "undefined" ? "" : window.location.pathname,
      },
    });
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="app-shell">
        <main className="app-main">
          <section className="screen error-boundary-panel" role="alert">
            <h1>Mahjong Party</h1>
            <p>Something went wrong while drawing this screen.</p>
            <button className="mp-button mp-button-primary" type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </section>
        </main>
      </div>
    );
  }
}
