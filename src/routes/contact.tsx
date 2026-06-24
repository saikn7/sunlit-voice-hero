import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { usePrefs } from "@/lib/prefs-context";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => ({
    meta: [
      { title: "Contact Us — SunlitVoice" },
      { name: "description", content: "Get in touch with the SunlitVoice team. We reply within 1–2 business days." },
      { property: "og:title", content: "Contact Us — SunlitVoice" },
      { property: "og:description", content: "Get in touch with the SunlitVoice team. We reply within 1–2 business days." },
    ],
  }),
});

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  message: z.string().trim().min(5, "Message is too short").max(2000),
});

function ContactPage() {
  const { t } = usePrefs();
  const { user } = useAuth();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState(user?.email ?? "");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [ok, setOk] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const parsed = schema.safeParse({ name, email, message });
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("contact_messages").insert({
        ...parsed.data,
        user_id: user?.id ?? null,
      });
      if (error) throw error;
      setOk(true);
      setName(""); setMessage("");
      setTimeout(() => setOk(false), 6000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-xl gap-6">
      <header>
        <h1 className="text-3xl font-bold">{t("contactUs")}</h1>
        <p className="mt-2 text-base text-muted-foreground">{t("contactBody")}</p>
      </header>

      <form onSubmit={submit} className="grid gap-4" aria-describedby={err ? "contact-error" : undefined}>
        <label className="grid gap-1.5">
          <span className="text-base font-semibold">Name</span>
          <input
            type="text"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-border bg-input px-4 py-3 text-lg"
            autoComplete="name"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-base font-semibold">{t("email")}</span>
          <input
            type="email"
            required
            maxLength={255}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-border bg-input px-4 py-3 text-lg"
            autoComplete="email"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-base font-semibold">Message</span>
          <textarea
            required
            maxLength={2000}
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="rounded-lg border border-border bg-input px-4 py-3 text-lg"
          />
        </label>

        {err && (
          <p id="contact-error" role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-destructive">
            {err}
          </p>
        )}
        {ok && (
          <p role="status" className="rounded-md bg-primary/15 px-3 py-2 text-primary">
            Message sent successfully. We'll be in touch soon.
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary px-6 py-3 text-lg font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy ? t("loading") : "Send Message"}
        </button>
      </form>
    </div>
  );
}
