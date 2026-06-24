import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { usePrefs } from "@/lib/prefs-context";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Sunlit Voice — Voice-first donations & listening" },
      { name: "description", content: "Donate your voice or listen and search by voice. Accessible, multilingual, screen-reader friendly." },
    ],
  }),
});

function HomePage() {
  const { t } = usePrefs();
  const { user } = useAuth();
  const navigate = useNavigate();

  const go = (to: "/listen" | "/donate") => {
    if (!user) navigate({ to: "/auth", search: { redirect: to } });
    else navigate({ to });
  };

  return (
    <div className="grid gap-10">
      <section className="text-center">
        <h1 className="text-balance text-5xl font-bold leading-tight md:text-6xl">
          {t("appName")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-xl text-muted-foreground">
          {t("tagline")}
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <button
          type="button"
          onClick={() => go("/listen")}
          className="group flex min-h-56 flex-col items-center justify-center gap-3 rounded-3xl bg-primary p-8 text-center text-primary-foreground shadow-elevated transition hover:opacity-95"
          aria-describedby="listen-desc"
        >
          <span aria-hidden className="text-6xl">🎧</span>
          <span className="text-3xl font-bold">{t("startListening")}</span>
          <span id="listen-desc" className="text-base opacity-90">
            Voice-controlled assistant — search & play donated audio.
          </span>
        </button>

        <button
          type="button"
          onClick={() => go("/donate")}
          className="group flex min-h-56 flex-col items-center justify-center gap-3 rounded-3xl bg-accent p-8 text-center text-accent-foreground shadow-elevated transition hover:opacity-95"
          aria-describedby="donate-desc"
        >
          <span aria-hidden className="text-6xl">🎙️</span>
          <span className="text-3xl font-bold">{t("donateYourVoice")}</span>
          <span id="donate-desc" className="text-base opacity-90">
            Record or upload an audio message to share with the community.
          </span>
        </button>
      </section>

      {!user && (
        <p className="text-center text-base text-muted-foreground">
          <Link to="/auth" className="font-semibold text-primary underline underline-offset-4">
            {t("signIn")}
          </Link>{" "}
          to get started.
        </p>
      )}
    </div>
  );
}
