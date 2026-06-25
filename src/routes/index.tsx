import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { usePrefs } from "@/lib/prefs-context";
import { useAuth } from "@/lib/auth-context";
import heroBg from "@/assets/hero-bg-new.jpg";

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
      <section className="relative overflow-hidden bg-cover bg-center px-4 py-10 md:py-16" style={{ backgroundImage: `url(${heroBg})` }}>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-emerald-50/20" />
        <div className="pointer-events-none absolute inset-0 bg-primary z-50" />
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <span className="inline-block rounded-full bg-card/80 px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-foreground shadow-sm">
              {t("heroBadge")}
            </span>
            <h1 className="mt-3 text-balance text-2xl leading-[1.15] tracking-tight font-medium md:text-4xl" style={{ fontFamily: "var(--font-display)" }}>
              {t("heroHeadline")}
            </h1>
            <p className="mt-3 max-w-xl text-base font-normal text-foreground/75 md:text-lg">{t("heroSubtext")}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={() => go("/donate")} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated transition hover:opacity-95 md:text-base">
                <span aria-hidden>♥</span> {t("donateYourVoice")}
              </button>
              <button type="button" onClick={() => go("/listen")} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary md:text-base">
                <span aria-hidden>🎙</span> {t("startListening")}
              </button>
              <Link to="/listen" className="inline-flex items-center gap-2 rounded-xl px-2.5 py-2.5 text-sm font-medium text-foreground/75 underline-offset-4 hover:underline md:text-base">
                <span aria-hidden>▶</span> {t("heroBrowseAudio")}
              </Link>
            </div>
          </div>

          <aside className="rounded-3xl bg-card p-6 shadow-elevated md:p-7" aria-label="Voice command examples">
            <div className="flex items-center gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-xl text-primary-foreground" aria-hidden>🎤</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("trySaying")}</p>
                <p className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>{t("tryExample")}</p>
              </div>
            </div>
            <ul className="mt-5 space-y-1.5 text-base">
              <li>{t("tryItem1")}</li>
              <li>{t("tryItem2")}</li>
              <li>{t("tryItem3")}</li>
              <li>{t("tryItem4")}</li>
            </ul>
            <p className="mt-5 text-xs text-muted-foreground">{t("tryHint")}</p>
          </aside>
        </div>
      </section>

      <section className="bg-background px-4 py-20 md:py-28">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-balance text-3xl md:text-4xl" style={{ fontFamily: "var(--font-display)" }}>{t("featuresHeadline")}</h2>
          <p className="mt-2.5 text-base font-normal text-muted-foreground">{t("featuresSub")}</p>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <article key={f.t} className="rounded-2xl border border-border bg-card p-7 transition hover:shadow-elevated hover:-translate-y-0.5">
                <span aria-hidden className="text-2xl">{f.icon}</span>
                <h3 className="mt-4 text-xl" style={{ fontFamily: "var(--font-display)" }}>{f.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 md:py-28" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl md:text-4xl" style={{ fontFamily: "var(--font-display)" }}>{t("howHeadline")}</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="rounded-2xl bg-card p-7 shadow-elevated">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground" aria-hidden>{s.n}</span>
                <h3 className="mt-5 text-xl" style={{ fontFamily: "var(--font-display)" }}>{s.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-background px-4 py-20 md:py-28">
        <div className="mx-auto max-w-4xl text-center">
          <blockquote className="text-balance text-2xl leading-snug md:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
            {t("quote")}
          </blockquote>
          <p className="mt-3 text-sm text-muted-foreground">{t("quoteWho")}</p>
          <div className="mt-10 flex flex-wrap justify-center gap-2.5">
            <button type="button" onClick={() => go("/donate")} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated hover:opacity-95 md:text-base">
              {t("becomeDonor")}
            </button>
            <Link to="/contact" className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary md:text-base">
              {t("contactUs")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
