import Link from "next/link";
import { Logo } from "@/components/console/top-bar";
import { TOPICS } from "@/lib/seo/topics";

/** Slim header for server-rendered content pages. */
export function SiteHeader({ crumb, cta }: { crumb?: string; cta?: { href: string; label: string } }) {
  return (
    <header className="border-b border-border bg-surface/80">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Logo className="h-6 w-6" />
          <span className="font-mono text-xs font-bold tracking-[0.28em]">WATCHDAWG</span>
        </Link>
        {crumb && (
          <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
            / <span className="text-foreground">{crumb}</span>
          </nav>
        )}
        {cta && (
          <Link
            href={cta.href}
            className="ml-auto rounded-sm border border-primary/50 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-primary hover:bg-primary/10"
          >
            {cta.label}
          </Link>
        )}
      </div>
    </header>
  );
}

/** Cross-links between the live topic pages (internal linking for SEO). */
export function TopicNav({ current }: { current?: string }) {
  return (
    <nav aria-label="Live maps" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {TOPICS.map((t) => (
        <Link key={t.slug} href={`/live/${t.slug}`} aria-current={t.slug === current ? "page" : undefined} className={t.slug === current ? "text-foreground" : "text-muted-foreground hover:text-foreground"}>
          {t.h1}
        </Link>
      ))}
    </nav>
  );
}
