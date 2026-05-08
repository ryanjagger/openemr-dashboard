"use client";

import { useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function PatientErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in the browser console; the server already logged via pino.
    console.error("patient-route error:", error);
  }, [error]);

  const isAuthExpired = error.name === "AuthExpiredError";

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Alert variant="destructive">
        <AlertTitle>
          {isAuthExpired ? "Session expired" : "Couldn't load this patient"}
        </AlertTitle>
        <AlertDescription className="mt-2 space-y-3">
          <p>
            {isAuthExpired
              ? "Your session has expired. Sign in again to continue."
              : "Something went wrong loading this patient's record. The server has logged the error."}
          </p>
          <div className="flex gap-3">
            {isAuthExpired ? (
              <a
                href="/login"
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Sign in
              </a>
            ) : (
              <button
                type="button"
                onClick={() => reset()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Retry
              </button>
            )}
            {error.digest && (
              <span className="text-muted-foreground self-center font-mono text-xs">
                ref: {error.digest}
              </span>
            )}
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
