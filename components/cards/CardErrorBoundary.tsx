"use client";

import { Component, type ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type Props = {
  title: string;
  children: ReactNode;
};
type State = { error: Error | null };

/**
 * Per-card error boundary so one failing card doesn't take down the
 * whole dashboard. The fallback UI is baked in (rather than passed as
 * a function) because CardShell renders on the server and React 19
 * can't serialize a function prop across the server→client boundary.
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
      const id = `card-${slug(this.props.title)}-title`;
      return (
        <Card
          aria-labelledby={id}
          className="border-destructive/40"
          role="region"
        >
          <CardHeader>
            <CardTitle id={id}>{this.props.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load {this.props.title.toLowerCase()}.
            </p>
            <button
              type="button"
              onClick={this.reset}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
