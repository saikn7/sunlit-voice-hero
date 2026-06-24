import * as React from "react";
import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { usePrefs } from "@/lib/prefs-context";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type AuthSearch = { redirect?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): AuthSearch => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in — SunlitVoice" },
      { name: "description", content: "Sign in or create an account to donate and listen." },
    ],
  }),
});

function AuthPage() {
  const { signIn, signUp, resetPassword, user, loading } = useAuth();
  const { t } = usePrefs();
  const { redirect: redirectTo } = useSearch({ from: "/auth" });
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!loading && user) {
      navigate({ to: (redirectTo as "/listen" | "/donate" | "/") ?? "/" });
    }
  }, [user, loading, navigate, redirectTo]);

  const [siEmail, setSiEmail] = React.useState("");
  const [siPassword, setSiPassword] = React.useState("");
  const [suName, setSuName] = React.useState("");
  const [suEmail, setSuEmail] = React.useState("");
  const [suPassword, setSuPassword] = React.useState("");
  const [suRole, setSuRole] = React.useState<"disabled_user" | "donor">("disabled_user");
  const [fpEmail, setFpEmail] = React.useState("");

  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "error" | "ok" | "warn"; text: string } | null>(null);
  const [suCooldown, setSuCooldown] = React.useState(0);
  const [fpCooldown, setFpCooldown] = React.useState(0);

  // Tick cooldowns once per second
  React.useEffect(() => {
    if (suCooldown <= 0 && fpCooldown <= 0) return;
    const id = setInterval(() => {
      setSuCooldown((s) => (s > 0 ? s - 1 : 0));
      setFpCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [suCooldown, fpCooldown]);

  function describeError(err: unknown): { text: string; rateLimited: boolean } {
    const raw = (err as Error)?.message || String(err);
    const low = raw.toLowerCase();
    const rateLimited =
      low.includes("rate limit") ||
      low.includes("over_email_send_rate_limit") ||
      low.includes("too many requests") ||
      low.includes("429");
    if (rateLimited) {
      return {
        text:
          lang === "my"
            ? "အီးမေးလ် ပို့ခွင့် ကန့်သတ်ထားသည်။ ၁ နာရီခန့် စောင့်ပြီး ထပ်ကြိုးစားပါ။"
            : "Email send rate limit reached. Please wait about an hour before trying again, or use a different email.",
        rateLimited: true,
      };
    }
    return { text: raw, rateLimited: false };
  }

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try { await signIn(siEmail, siPassword); }
    catch (err) { setMsg({ kind: "error", text: describeError(err).text }); }
    finally { setBusy(false); }
  }
  async function onSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (suCooldown > 0) return;
    setBusy(true); setMsg(null);
    try {
      await signUp(suEmail, suPassword, suName || undefined, suRole);
      setMsg({ kind: "ok", text: t("accountCreated") });
      setSuCooldown(60);
    } catch (err) {
      const d = describeError(err);
      setMsg({ kind: d.rateLimited ? "warn" : "error", text: d.text });
      if (d.rateLimited) setSuCooldown(300); // 5 min lockout on rate-limit
    }
    finally { setBusy(false); }
  }
  async function onReset(e: React.FormEvent) {
    e.preventDefault();
    if (fpCooldown > 0) return;
    setBusy(true); setMsg(null);
    try {
      await resetPassword(fpEmail);
      setMsg({ kind: "ok", text: t("resetSent") });
      setFpCooldown(60);
    } catch (err) {
      const d = describeError(err);
      setMsg({ kind: d.rateLimited ? "warn" : "error", text: d.text });
      if (d.rateLimited) setFpCooldown(300);
    }
    finally { setBusy(false); }
  }

  const suLabel = suCooldown > 0
    ? (lang === "my" ? `ထပ်ပို့ရန် ${suCooldown}s` : `Resend in ${suCooldown}s`)
    : (busy ? "…" : t("createAccountBtn"));
  const fpLabel = fpCooldown > 0
    ? (lang === "my" ? `ထပ်ပို့ရန် ${fpCooldown}s` : `Resend in ${fpCooldown}s`)
    : (busy ? "…" : t("sendResetLink"));

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl font-bold">{t("welcomeTo")}</h1>
      <p className="mt-2 text-muted-foreground">{t("authSub")}</p>

      <Tabs defaultValue="in" className="mt-6" onValueChange={() => setMsg(null)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="in">{t("tabSignIn")}</TabsTrigger>
          <TabsTrigger value="up">{t("tabSignUp")}</TabsTrigger>
          <TabsTrigger value="reset">{t("tabReset")}</TabsTrigger>
        </TabsList>

        <TabsContent value="in">
          <form onSubmit={onSignIn} className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="si-email">{t("email")}</Label>
              <Input id="si-email" type="email" autoComplete="email" required value={siEmail} onChange={(e) => setSiEmail(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="si-password">{t("password")}</Label>
              <Input id="si-password" type="password" autoComplete="current-password" required value={siPassword} onChange={(e) => setSiPassword(e.target.value)} />
            </div>
            {msg && <Notice msg={msg} />}
            <Button type="submit" disabled={busy} className="w-full">{busy ? "…" : t("signIn")}</Button>
          </form>
        </TabsContent>

        <TabsContent value="up">
          <form onSubmit={onSignUp} className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="su-name">{t("fullName")}</Label>
              <Input id="su-name" required maxLength={120} value={suName} onChange={(e) => setSuName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="su-email">{t("email")}</Label>
              <Input id="su-email" type="email" autoComplete="email" required value={suEmail} onChange={(e) => setSuEmail(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="su-password">{t("passwordMin")}</Label>
              <Input id="su-password" type="password" autoComplete="new-password" required minLength={8} value={suPassword} onChange={(e) => setSuPassword(e.target.value)} />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("iAmA")}</legend>
              <div className="flex gap-3">
                <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border p-3">
                  <input type="radio" name="role" value="disabled_user" checked={suRole === "disabled_user"} onChange={() => setSuRole("disabled_user")} />
                  <span>{t("roleListener")}</span>
                </label>
                <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border p-3">
                  <input type="radio" name="role" value="donor" checked={suRole === "donor"} onChange={() => setSuRole("donor")} />
                  <span>{t("roleDonor")}</span>
                </label>
              </div>
            </fieldset>
            {msg && <Notice msg={msg} />}
            <Button type="submit" disabled={busy} className="w-full">{busy ? "…" : t("createAccountBtn")}</Button>
          </form>
        </TabsContent>

        <TabsContent value="reset">
          <form onSubmit={onReset} className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="fp-email">{t("email")}</Label>
              <Input id="fp-email" type="email" required value={fpEmail} onChange={(e) => setFpEmail(e.target.value)} />
            </div>
            {msg && <Notice msg={msg} />}
            <Button type="submit" disabled={busy} className="w-full">{busy ? "…" : t("sendResetLink")}</Button>
          </form>
        </TabsContent>
      </Tabs>

      <div className="mt-6 text-center">
        <Link to="/" className="text-sm text-primary underline underline-offset-4">{t("backHome")}</Link>
      </div>
    </div>
  );
}

function Notice({ msg }: { msg: { kind: "error" | "ok"; text: string } }) {
  return (
    <p role={msg.kind === "error" ? "alert" : "status"}
       className={`rounded-md px-3 py-2 text-sm ${msg.kind === "error" ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-foreground"}`}>
      {msg.text}
    </p>
  );
}
