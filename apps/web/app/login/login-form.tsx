import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signInAction, sendMagicLinkAction } from "./actions";

interface LoginFormProps {
  error?: string;
  sent?: boolean;
}

/**
 * Pure server-rendered login form. Uses Server Actions so the form works
 * without JavaScript. The two-button pattern (Sign in / Send link) shares
 * one email input and routes the submission via `formAction`.
 */
export function LoginForm({ error, sent }: LoginFormProps) {
  return (
    <div className="w-full max-w-sm space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">
          WATCHDAWG // OSINT
        </p>
        <h1 className="font-mono text-xl uppercase tracking-widest text-foreground">
          Sign in
        </h1>
        <p className="font-mono text-xs text-muted">
          Credentialed analysts only. Access is logged and rate-limited.
        </p>
      </header>

      <form action={signInAction} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="analyst@example.org"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
          />
        </div>

        {error ? (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs text-danger"
          >
            {error}
          </p>
        ) : null}
        {sent ? (
          <p
            role="status"
            aria-live="polite"
            className="rounded-sm border border-success/40 bg-success/10 px-3 py-2 font-mono text-xs text-success"
          >
            Sign-in link sent. Check your email.
          </p>
        ) : null}

        <Button type="submit" className="w-full">
          Sign in
        </Button>

        <button
          type="submit"
          formAction={sendMagicLinkAction}
          className="block w-full text-center font-mono text-xs uppercase tracking-widest text-muted underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Or email me a sign-in link
        </button>
      </form>
    </div>
  );
}
