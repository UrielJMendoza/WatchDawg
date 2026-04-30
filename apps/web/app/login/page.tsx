"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [status, setStatus] = useState<{
    kind: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ kind: "idle" });

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "loading" });
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function handlePasswordSignUp() {
    setStatus({ kind: "loading" });
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }
    setStatus({
      kind: "success",
      message:
        "Account created. Check your inbox to confirm, then return to sign in.",
    });
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "loading" });
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined,
      },
    });
    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }
    setStatus({
      kind: "success",
      message: "Magic link sent. Check your inbox.",
    });
  }

  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-sm border border-border bg-surface p-6">
        <div className="mb-4 border-b border-border pb-3">
          <div className="font-mono text-sm font-semibold tracking-widest">
            WATCHDAWG
          </div>
          <div className="section-header mt-1">SIGN IN // OSINT TERMINAL</div>
        </div>

        <div className="mb-3 flex gap-1 rounded-sm border border-border p-0.5">
          <button
            onClick={() => setMode("password")}
            className={`flex-1 rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
              mode === "password"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface-2"
            }`}
            type="button"
          >
            PASSWORD
          </button>
          <button
            onClick={() => setMode("magic")}
            className={`flex-1 rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
              mode === "magic"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface-2"
            }`}
            type="button"
          >
            MAGIC LINK
          </button>
        </div>

        {mode === "password" ? (
          <form onSubmit={handlePasswordSignIn} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email">EMAIL</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">PASSWORD</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                minLength={8}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                type="submit"
                disabled={status.kind === "loading"}
                className="flex-1"
              >
                {status.kind === "loading" ? "···" : "SIGN IN"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={status.kind === "loading" || !email || !password}
                onClick={handlePasswordSignUp}
                className="flex-1"
              >
                CREATE
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="magic-email">EMAIL</Label>
              <Input
                id="magic-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <Button
              type="submit"
              disabled={status.kind === "loading"}
              className="w-full"
            >
              {status.kind === "loading" ? "···" : "SEND MAGIC LINK"}
            </Button>
          </form>
        )}

        {status.kind === "error" ? (
          <div
            role="alert"
            className="mt-3 rounded-sm border border-danger/40 bg-danger/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-danger"
          >
            ERROR — {status.message}
          </div>
        ) : null}
        {status.kind === "success" ? (
          <div
            role="status"
            className="mt-3 rounded-sm border border-success/40 bg-success/10 px-2 py-1 font-mono text-[10px] tracking-widest text-success"
          >
            {status.message}
          </div>
        ) : null}
      </div>
    </div>
  );
}
