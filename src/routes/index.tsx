import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { usePrefs } from "@/lib/prefs-context";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "VoiceBridge — Accessibility-first audio platform" },
      { name: "description", content: "Donate your voice. Open the world for someone who can't see it. Voice-first audio donations and listening for blind and visually impaired users." },
    ],
  }),
});

function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const go = (to: "/listen" | "/donate") => {
    if (!user) navigate({ to: "/auth", search: { redirect: to } });
    else navigate({ to });
  };

  return (
    <div className="-mx-4 -my-6">
      {/* HERO */}
      <section
        className="px-4 py-12 md:py-20"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <span className="inline-block rounded-full bg-card/80 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-foreground shadow-sm">
              Accessibility-first audio platform
            </span>
            <h1
              className="mt-6 text-balance text-5xl leading-[1.05] tracking-tight md:text-7xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Donate your voice. Open the world for someone who can't see it.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-foreground/80 md:text-xl">
              VoiceBridge brings together donated recordings — lessons, stories, news, motivation — so blind and visually impaired users can listen, learn, and live more independently, all through simple voice commands.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => go("/donate")}
                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-lg font-bold text-primary-foreground shadow-elevated transition hover:opacity-95"
              >
                <span aria-hidden>♥</span> Donate your voice
              </button>
              <button
                type="button"
                onClick={() => go("/listen")}
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-6 py-3.5 text-lg font-bold text-foreground hover:bg-secondary"
              >
                <span aria-hidden>🎙</span> Start listening
              </button>
              <Link
                to="/listen"
                className="inline-flex items-center gap-2 rounded-2xl px-3 py-3.5 text-lg font-semibold text-foreground/80 underline-offset-4 hover:underline"
              >
                <span aria-hidden>▶</span> Browse audio
              </Link>
            </div>
          </div>

          {/* Try saying card */}
          <aside
            className="rounded-3xl bg-card p-6 shadow-elevated md:p-8"
            aria-label="Voice command examples"
          >
            <div className="flex items-center gap-4">
              <span
                className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-2xl text-primary-foreground"
                aria-hidden
              >
                🎤
              </span>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Try saying</p>
                <p
                  className="text-xl font-bold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  "Find motivation audio"
                </p>
              </div>
            </div>
            <ul className="mt-6 space-y-2 text-lg">
              <li>• "Open donate page"</li>
              <li>• "Find education"</li>
              <li>• "Play latest audio"</li>
              <li>• "Help"</li>
            </ul>
            <p className="mt-6 text-sm text-muted-foreground">
              Press the big microphone button at the bottom of the screen — or press the space bar.
            </p>
          </aside>
        </div>
      </section>

      {/* FEATURES */}
      <section className="bg-background px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2
            className="text-balance text-4xl md:text-5xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Built for the way blind users actually use the web
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            Every screen is designed to be heard first, seen second.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: "🗣", t: "Voice-first navigation", d: "Speak commands to find audio, open pages, control playback." },
              { icon: "🤝", t: "Community donations", d: "Anyone can record or upload audio — lessons, stories, news, prayers." },
              { icon: "🤖", t: "Smart assistant", d: "Auto-greets, reads page changes aloud and understands natural language." },
              { icon: "🔒", t: "Privacy & safety", d: "Authenticated uploads, content moderation, sanitised filenames." },
              { icon: "⏺", t: "Record in-browser", d: "Donate without leaving the site — record, preview, save." },
              { icon: "🎚", t: "Accessible player", d: "Large controls, speed and volume, voice-controllable." },
            ].map((f) => (
              <article
                key={f.t}
                className="rounded-3xl border border-border bg-card p-6 transition hover:shadow-elevated"
              >
                <span aria-hidden className="text-3xl">{f.icon}</span>
                <h3 className="mt-4 text-2xl" style={{ fontFamily: "var(--font-display)" }}>
                  {f.t}
                </h3>
                <p className="mt-2 text-base text-muted-foreground">{f.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="px-4 py-16 md:py-24" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl" style={{ fontFamily: "var(--font-display)" }}>
            How it works
          </h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              { n: 1, t: "Create your account", d: "Sign up as a donor or as someone who needs audio support." },
              { n: 2, t: "Donate or browse", d: "Donors record or upload. Users browse and listen — by voice." },
              { n: 3, t: "Listen, anywhere", d: "Save favorites, resume where you left off, control with your voice." },
            ].map((s) => (
              <li key={s.n} className="rounded-3xl bg-card p-7 shadow-elevated">
                <span
                  className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground"
                  aria-hidden
                >
                  {s.n}
                </span>
                <h3 className="mt-5 text-2xl" style={{ fontFamily: "var(--font-display)" }}>
                  {s.t}
                </h3>
                <p className="mt-2 text-base text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* QUOTE + CTA */}
      <section className="bg-background px-4 py-16 md:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <blockquote
            className="text-balance text-3xl leading-snug md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            "I can finally hear lessons in my own language whenever I want. VoiceBridge feels like a friend reading to me."
          </blockquote>
          <p className="mt-4 text-base text-muted-foreground">— Early user</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => go("/donate")}
              className="rounded-2xl bg-primary px-6 py-3.5 text-lg font-bold text-primary-foreground shadow-elevated hover:opacity-95"
            >
              Become a donor
            </button>
            <Link
              to="/contact"
              className="rounded-2xl border border-border bg-card px-6 py-3.5 text-lg font-bold text-foreground hover:bg-secondary"
            >
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
