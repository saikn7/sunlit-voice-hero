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
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        path === to ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
      }`}
      aria-current={path === to ? "page" : undefined}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2.5 px-4 py-2.5">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold" aria-label={`${t("appName")} — home`}>
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-elevated">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />
              <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
            </svg>
          </span>
          <span style={{ fontFamily: "var(--font-display)" }}>{t("appName")}</span>
        </Link>

        <nav aria-label="Primary" className="ml-2 flex flex-wrap items-center gap-0.5">
          {navItem("/", t("home"))}
          {navItem("/browse", t("browse"))}
          {navItem("/donate", t("donateMode"))}
          {user && navItem("/profile", "Profile")}
          {navItem("/contact", t("contact"))}
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">{t("language")}</span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="rounded-md border border-border bg-input px-2 py-1 text-xs"
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
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden>{theme === "dark" ? "☀️" : "🌙"}</span>
            {theme === "dark" ? t("light") : t("dark")}
          </button>

          {user ? (
            <button
              type="button"
              onClick={() => signOut()}
              className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-95"
            >
              {t("signOut")}
            </button>
          ) : (
            <Link
              to="/auth"
              className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-95"
            >
              {t("signIn")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
