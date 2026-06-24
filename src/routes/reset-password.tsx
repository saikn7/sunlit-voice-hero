import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Reset password — SunlitVoice" },
      { name: "description", content: "Set a new password for your account." },
    ],
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    // Supabase puts a recovery session in the URL hash on click-through.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 8) return setMsg({ kind: "error", text: "Password must be at least 8 characters." });
    if (password !== confirm) return setMsg({ kind: "error", text: "Passwords do not match." });
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMsg({ kind: "ok", text: "Password updated. Redirecting…" });
      setTimeout(() => navigate({ to: "/" }), 1200);
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl font-bold">Reset your password</h1>
      <p className="mt-2 text-muted-foreground">Enter a new password for your account.</p>
      {!ready ? (
        <p className="mt-6 rounded-md bg-muted px-3 py-2 text-sm">
          Open the link from your reset email to continue. If you opened it here and still see this, the link may have expired.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="np">New password</Label>
            <Input id="np" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="np2">Confirm password</Label>
            <Input id="np2" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {msg && (
            <p role={msg.kind === "error" ? "alert" : "status"}
               className={`rounded-md px-3 py-2 text-sm ${msg.kind === "error" ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-foreground"}`}>
              {msg.text}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "…" : "Update password"}</Button>
        </form>
      )}
      <div className="mt-6 text-center">
        <Link to="/auth" className="text-sm text-primary underline underline-offset-4">← Back to sign in</Link>
      </div>
    </div>
  );
}
