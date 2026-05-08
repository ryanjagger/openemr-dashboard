import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          OpenEMR Patient Dashboard
        </h1>
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Sign in with your OpenEMR account to view patients.
        </p>
        <Link
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-6 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Sign in with OpenEMR
        </Link>
      </div>
    </main>
  );
}
