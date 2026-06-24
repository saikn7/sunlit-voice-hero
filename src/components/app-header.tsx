import { Link, useRouterState } from "@tanstack/react-router";
import { usePrefs } from "@/lib/prefs-context";
import { useAuth } from "@/lib/auth-context";
import { LANGS, type Lang } from "@/lib/i18n";

export function AppHeader(_props: { onOpenContact?: () => void }) {
  const { t, lang, setLang, theme, setTheme } = usePrefs();
  const { user, signOut } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const navItem = (to: string, label: string) => (
    <Link
      to={to}
      className={`rounded-md px-3 py-2 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        path === to ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
      }`}
      aria-current={path === to ? "page" : undefined}
    >
      {label}
    </Link>
  );

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-primary">
          <span aria-hidden className="inline-block h-7 w-7 rounded-full bg-primary" />
          {t("appName")}
        </Link>
        <nav aria-label="Primary" className="ml-auto flex flex-wrap items-center gap-1">
          {navItem("/", t("home"))}
          {user && navItem("/listen", t("listen"))}
          {user && navItem("/donate", t("donate"))}
          {navItem("/contact", t("contact"))}


          <label className="ml-2 flex items-center gap-2 text-sm">
            <span className="sr-only">{t("language")}</span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="rounded-md border border-border bg-input px-2 py-1.5 text-base"
              aria-label={t("language")}
            >
              {LANGS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-md border border-border px-3 py-2 text-base font-semibold hover:bg-secondary"
            aria-label={`${t("theme")}: ${theme === "dark" ? t("dark") : t("light")}`}
          >
            {theme === "dark" ? "🌙" : "☀️"}
          </button>

          {user ? (
            <button
              type="button"
              onClick={() => signOut()}
              className="rounded-md bg-secondary px-3 py-2 text-base font-semibold hover:bg-accent"
            >
              {t("signOut")}
            </button>
          ) : (
            <a href="/auth" className="rounded-md bg-primary px-3 py-2 text-base font-semibold text-primary-foreground">
              {t("signIn")}
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}
