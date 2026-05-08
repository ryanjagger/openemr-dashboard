import { Skeleton } from "@/components/ui/skeleton";

export default function PatientLoading() {
  return (
    <div className="min-h-screen bg-background" aria-busy="true">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </main>
    </div>
  );
}
