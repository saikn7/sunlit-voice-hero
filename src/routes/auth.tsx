import * as React from "react";
import { createFileRoute, useNavigate, useSearch, redirect } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { usePrefs } from "@/lib/prefs-context";

type AuthSearch = { redirect?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): AuthSearch => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in — Sunlit Voice" },
      { name: "description", content: "Sign in or create an account to donate and listen." },
    ],
  }),
});

function AuthPage() {
  const { t } = usePrefs();
  const { signIn, signUp, user, loading } = useAuth();
  const { redirect: redirectTo } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [mode, setMode] = React.useState<"in" | "up">("in");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // If already signed in, bounce.
  React.useEffect(() => {
    if (!loading && user) {
      navigate({ to: (redirectTo as "/listen" | "/donate" | "/") ?? "/" });
    }
  }, [user, loading, navigate, redirectTo]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "in") await signIn(email, password);
      else await signUp(email, password, displayName || undefined);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl font-bold">
        {mode === "in" ? t("welcomeBack") : t("createAccount")}
      </h1>
      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        {mode === "up" && (
          <label className="grid gap-1.5">
            <span className="text-base font-semibold">{t("displayName")}</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              className="rounded-lg border border-border bg-input px-4 py-3 text-lg"
            />
          </label>
        )}
        <label className="grid gap-1.5">
          <span className="text-base font-semibold">{t("email")}</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="rounded-lg border border-border bg-input px-4 py-3 text-lg"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-base font-semibold">{t("password")}</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            className="rounded-lg border border-border bg-input px-4 py-3 text-lg"
          />
        </label>
        {error && (
          <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-base text-destructive">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary px-6 py-3 text-lg font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy ? t("loading") : mode === "in" ? t("signIn") : t("signUp")}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setMode(mode === "in" ? "up" : "in")}
        className="mt-4 w-full text-base text-primary underline underline-offset-4"
      >
        {mode === "in" ? t("needAccount") + " " + t("signUp") : t("haveAccount") + " " + t("signIn")}
      </button>
    </div>
  );
}
