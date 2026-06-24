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
      className={`rounded-xl px-3.5 py-2 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
        <Link to="/" className="flex items-center gap-2.5 text-xl font-bold">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-full bg-primary text-lg text-primary-foreground"
          >
            🎤
          </span>
          <span style={{ fontFamily: "var(--font-display)" }}>{t("appName")}</span>
        </Link>

        <nav aria-label="Primary" className="ml-2 flex flex-wrap items-center gap-1">
          {navItem("/", t("home"))}
          {navItem("/browse", "Browse")}
          {navItem("/donate", "Donate Voice")}
          {navItem("/contact", t("contact"))}
        </nav>


        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">{t("language")}</span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="rounded-md border border-border bg-input px-2 py-1.5 text-sm"
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
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden>{theme === "dark" ? "☀️" : "🌙"}</span>
            {theme === "dark" ? "Light" : "Dark"}
          </button>



          {user ? (
            <button
              type="button"
              onClick={() => signOut()}
              className="rounded-xl bg-primary px-4 py-2 text-base font-bold text-primary-foreground hover:opacity-95"
            >
              {t("signOut")}
            </button>
          ) : (
            <Link
              to="/auth"
              className="rounded-xl bg-primary px-4 py-2 text-base font-bold text-primary-foreground hover:opacity-95"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
