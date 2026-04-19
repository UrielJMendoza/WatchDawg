import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          404 / ROUTE NOT FOUND
        </p>
        <h1 className="mt-4 font-mono text-3xl uppercase tracking-widest text-foreground">
          NO SUCH SECTOR
        </h1>
        <p className="mt-6 font-mono text-xs text-muted">
          The requested path is not wired to anything.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-flex items-center justify-center rounded-sm border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-foreground transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Return to sign-in
        </Link>
      </div>
    </main>
  );
}
