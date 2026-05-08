import { Suspense, type ReactNode } from "react";
import { CardErrorBoundary } from "@/components/cards/CardErrorBoundary";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function DefaultSkeleton({ title }: { title: string }) {
  const id = `card-${slug(title)}-title`;
  return (
    <Card aria-labelledby={id} aria-busy="true">
      <CardHeader>
        <CardTitle id={id}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </CardContent>
    </Card>
  );
}

/**
 * Per-card Suspense + error boundary. Wrap each Server-Component card
 * with this so cards stream in independently and one card's failure
 * doesn't take down the dashboard.
 */
export function CardShell({
  title,
  children,
  skeleton,
}: {
  title: string;
  children: ReactNode;
  skeleton?: ReactNode;
}) {
  return (
    <CardErrorBoundary title={title}>
      <Suspense fallback={skeleton ?? <DefaultSkeleton title={title} />}>
        {children}
      </Suspense>
    </CardErrorBoundary>
  );
}
