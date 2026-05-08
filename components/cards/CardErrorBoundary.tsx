"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback: (props: { error: Error; reset: () => void }) => ReactNode;
};
type State = { error: Error | null };

/**
 * Per-card error boundary so one failing card doesn't take down the
 * whole dashboard. Caught errors render the consumer-provided fallback;
 * `reset()` clears the boundary so the next render attempt re-runs the
 * child (handy for retry-after-network-blip).
 */
export class CardErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error("card error:", error);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback({ error: this.state.error, reset: this.reset });
    }
    return this.props.children;
  }
}
