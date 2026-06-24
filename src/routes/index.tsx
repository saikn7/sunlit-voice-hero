import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { usePrefs } from "@/lib/prefs-context";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "SunlitVoice — Accessibility-first audio platform" },
      { name: "description", content: "Donate your voice. Open the world for someone who can't see it. Voice-first audio donations and listening for blind and visually impaired users." },
    ],
  }),
});

function HomePage() {
  const { user } = useAuth();
  const { t } = usePrefs();
  const navigate = useNavigate();

  const go = (to: "/listen" | "/donate") => {
    if (!user) navigate({ to: "/auth", search: { redirect: to } });
    else navigate({ to });
  };

  const features = [
    { icon: "🗣", t: t("f1t"), d: t("f1d") },
    { icon: "🤝", t: t("f2t"), d: t("f2d") },
    { icon: "🤖", t: t("f3t"), d: t("f3d") },
    { icon: "🔒", t: t("f4t"), d: t("f4d") },
    { icon: "⏺", t: t("f5t"), d: t("f5d") },
    { icon: "🎚", t: t("f6t"), d: t("f6d") },
  ];
  const steps = [
    { n: 1, t: t("s1t"), d: t("s1d") },
    { n: 2, t: t("s2t"), d: t("s2d") },
    { n: 3, t: t("s3t"), d: t("s3d") },
  ];

  return (
    <div className="-mx-4 -my-6">
      <section className="px-4 py-12 md:py-20" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <span className="inline-block rounded-full bg-card/80 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-foreground shadow-sm">
              {t("heroBadge")}
            </span>
            <h1 className="mt-6 text-balance text-5xl leading-[1.05] tracking-tight md:text-7xl" style={{ fontFamily: "var(--font-display)" }}>
              {t("heroHeadline")}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-foreground/80 md:text-xl">{t("heroSubtext")}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => go("/donate")} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-lg font-bold text-primary-foreground shadow-elevated transition hover:opacity-95">
                <span aria-hidden>♥</span> {t("donateYourVoice")}
              </button>
              <button type="button" onClick={() => go("/listen")} className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-6 py-3.5 text-lg font-bold text-foreground hover:bg-secondary">
                <span aria-hidden>🎙</span> {t("startListening")}
              </button>
              <Link to="/listen" className="inline-flex items-center gap-2 rounded-2xl px-3 py-3.5 text-lg font-semibold text-foreground/80 underline-offset-4 hover:underline">
                <span aria-hidden>▶</span> {t("heroBrowseAudio")}
              </Link>
            </div>
          </div>

          <aside className="rounded-3xl bg-card p-6 shadow-elevated md:p-8" aria-label="Voice command examples">
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-2xl text-primary-foreground" aria-hidden>🎤</span>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{t("trySaying")}</p>
                <p className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>{t("tryExample")}</p>
              </div>
            </div>
            <ul className="mt-6 space-y-2 text-lg">
              <li>{t("tryItem1")}</li>
              <li>{t("tryItem2")}</li>
              <li>{t("tryItem3")}</li>
              <li>{t("tryItem4")}</li>
            </ul>
            <p className="mt-6 text-sm text-muted-foreground">{t("tryHint")}</p>
          </aside>
        </div>
      </section>

      <section className="bg-background px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-balance text-4xl md:text-5xl" style={{ fontFamily: "var(--font-display)" }}>{t("featuresHeadline")}</h2>
          <p className="mt-3 text-lg text-muted-foreground">{t("featuresSub")}</p>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <article key={f.t} className="rounded-3xl border border-border bg-card p-6 transition hover:shadow-elevated">
                <span aria-hidden className="text-3xl">{f.icon}</span>
                <h3 className="mt-4 text-2xl" style={{ fontFamily: "var(--font-display)" }}>{f.t}</h3>
                <p className="mt-2 text-base text-muted-foreground">{f.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:py-24" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl" style={{ fontFamily: "var(--font-display)" }}>{t("howHeadline")}</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="rounded-3xl bg-card p-7 shadow-elevated">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground" aria-hidden>{s.n}</span>
                <h3 className="mt-5 text-2xl" style={{ fontFamily: "var(--font-display)" }}>{s.t}</h3>
                <p className="mt-2 text-base text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-background px-4 py-16 md:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <blockquote className="text-balance text-3xl leading-snug md:text-4xl" style={{ fontFamily: "var(--font-display)" }}>
            {t("quote")}
          </blockquote>
          <p className="mt-4 text-base text-muted-foreground">{t("quoteWho")}</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => go("/donate")} className="rounded-2xl bg-primary px-6 py-3.5 text-lg font-bold text-primary-foreground shadow-elevated hover:opacity-95">
              {t("becomeDonor")}
            </button>
            <Link to="/contact" className="rounded-2xl border border-border bg-card px-6 py-3.5 text-lg font-bold text-foreground hover:bg-secondary">
              {t("contactUs")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
