import { LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LiveStatusPill } from "@/components/status/live-status-pill";
import { signOutAction } from "@/app/(dashboard)/actions";

interface TopbarProps {
  userEmail: string | null;
  className?: string;
}

export function Topbar({ userEmail, className }: TopbarProps) {
  return (
    <header
      className={cn(
        "col-span-3 flex h-12 items-center justify-between border-b border-border bg-surface px-4",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm font-bold uppercase tracking-widest text-foreground">
          WATCHDAWG
        </span>
        <span aria-hidden="true" className="h-4 w-px bg-primary/70" />
        <span className="font-mono text-[0.625rem] uppercase tracking-widest text-muted">
          Maritime OSINT // Red Sea — Horn of Africa
        </span>
      </div>

      <div className="flex flex-1 justify-center">
        {/* Command palette mounts here in Phase 6. */}
      </div>

      <div className="flex items-center gap-4">
        <LiveStatusPill />
        {userEmail ? (
          <span className="font-mono text-[0.625rem] uppercase tracking-widest text-muted">
            {userEmail}
          </span>
        ) : null}
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
            <LogOut aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Sign out</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
