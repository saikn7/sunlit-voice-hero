import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { usePrefs } from "@/lib/prefs-context";
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
  const { t } = usePrefs();
  const navigate = useNavigate();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 8) return setMsg({ kind: "error", text: t("passwordTooShort") });
    if (password !== confirm) return setMsg({ kind: "error", text: t("passwordsMismatch") });
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMsg({ kind: "ok", text: t("passwordUpdated") });
      setTimeout(() => navigate({ to: "/" }), 1200);
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl font-bold">{t("resetPwTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("resetPwSub")}</p>
      {!ready ? (
        <p className="mt-6 rounded-md bg-muted px-3 py-2 text-sm">{t("openResetEmail")}</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="np">{t("newPassword")}</Label>
            <Input id="np" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="np2">{t("confirmPassword")}</Label>
            <Input id="np2" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {msg && (
            <p role={msg.kind === "error" ? "alert" : "status"}
               className={`rounded-md px-3 py-2 text-sm ${msg.kind === "error" ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-foreground"}`}>
              {msg.text}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "…" : t("updatePassword")}</Button>
        </form>
      )}
      <div className="mt-6 text-center">
        <Link to="/auth" className="text-sm text-primary underline underline-offset-4">{t("backToSignIn")}</Link>
      </div>
    </div>
  );
}
