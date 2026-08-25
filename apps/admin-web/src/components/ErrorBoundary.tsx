import { Component, type ErrorInfo, type ReactElement, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time throws so one broken screen does not blank the whole dashboard.
 *
 * React unmounts the entire tree when a render throws and nothing catches it — the admin gets
 * a white page with the reason only in the console. This is the difference between "the
 * complaint detail screen is broken, use the list" and "the dashboard is down".
 *
 * A class component on purpose: error boundaries have no hook equivalent. It only catches
 * render/lifecycle errors — rejected promises in event handlers are handled by each screen's
 * own error state, which is why every page also renders an ErrorBanner.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console is the only sink here. Wiring this to Sentry is a follow-up; until then a
    // crash must at least leave the component stack behind for whoever debugs it.
    console.error('Unhandled render error', error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="page-message">
        <h1>Something broke on this screen</h1>
        <p className="muted">{error.message}</p>
        <p>
          <button type="button" onClick={this.reset}>
            Try again
          </button>
        </p>
      </div>
    );
  }
}

/**
 * Page-level boundary. Remounting on every route change is the whole point: a crash on one
 * complaint must not leave the admin stuck on the error card after they navigate away.
 */
export function PageErrorBoundary({
  routeKey,
  children,
}: {
  routeKey: string;
  children: ReactNode;
}): ReactElement {
  return <ErrorBoundary key={routeKey}>{children}</ErrorBoundary>;
}
