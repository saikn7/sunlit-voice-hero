import * as React from "react";
import type { Lang } from "./i18n";
import { t as translate, type TKey } from "./i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth-context";

type Theme = "light" | "dark";
type PrefsCtx = {
  lang: Lang;
  theme: Theme;
  contrast: boolean;
  demoMode: boolean;
  setLang: (l: Lang) => void;
  setTheme: (th: Theme) => void;
  setContrast: (v: boolean) => void;
  setDemoMode: (v: boolean) => void;
  t: (key: TKey) => string;
};

const Ctx = React.createContext<PrefsCtx | null>(null);
const LS_LANG = "language";
const LS_LANG_LEGACY = "sv_lang";
const LS_THEME = "theme";
const LS_CONTRAST = "sv_contrast";
const LS_DEMO = "sv_demo";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

function applyContrast(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("contrast-high", on);
}

function detectInitialLang(): Lang {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LS_LANG) as Lang | null;
  if (stored === "en" || stored === "my") return stored;
  const nav = navigator.language?.toLowerCase() ?? "";
  if (nav.startsWith("my")) return "my";
  return "en";
}

function detectInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(LS_THEME) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return "light";
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [lang, setLangState] = React.useState<Lang>("en");
  const [theme, setThemeState] = React.useState<Theme>("light");
  const [contrast, setContrastState] = React.useState(false);
  const [demoMode, setDemoModeState] = React.useState(false);

  React.useEffect(() => {
    const l = detectInitialLang();
    const th = detectInitialTheme();
    const c = window.localStorage.getItem(LS_CONTRAST) === "1";
    const d = window.localStorage.getItem(LS_DEMO) === "1";
    setLangState(l);
    setThemeState(th);
    setContrastState(c);
    setDemoModeState(d);
    applyTheme(th);
    applyContrast(c);
  }, []);

  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("language, theme")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      if (data.language === "en" || data.language === "my") {
        setLangState(data.language);
        window.localStorage.setItem(LS_LANG, data.language);
      }
      if (data.theme === "light" || data.theme === "dark") {
        setThemeState(data.theme);
        applyTheme(data.theme);
        window.localStorage.setItem(LS_THEME, data.theme);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const setLang = React.useCallback((l: Lang) => {
    setLangState(l);
    window.localStorage.setItem(LS_LANG, l);
    if (user) supabase.from("profiles").update({ language: l }).eq("id", user.id);
  }, [user]);

  const setTheme = React.useCallback((th: Theme) => {
    setThemeState(th);
    applyTheme(th);
    window.localStorage.setItem(LS_THEME, th);
    if (user) supabase.from("profiles").update({ theme: th }).eq("id", user.id);
  }, [user]);

  const setContrast = React.useCallback((v: boolean) => {
    setContrastState(v);
    applyContrast(v);
    window.localStorage.setItem(LS_CONTRAST, v ? "1" : "0");
  }, []);

  const setDemoMode = React.useCallback((v: boolean) => {
    setDemoModeState(v);
    window.localStorage.setItem(LS_DEMO, v ? "1" : "0");
    if (v) {
      // demo mode forces greeting again
      window.sessionStorage.removeItem("sv_greeted");
    }
  }, []);

  const value: PrefsCtx = React.useMemo(
    () => ({
      lang, theme, contrast, demoMode,
      setLang, setTheme, setContrast, setDemoMode,
      t: (k) => translate(lang, k),
    }),
    [lang, theme, contrast, demoMode, setLang, setTheme, setContrast, setDemoMode],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsCtx {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("usePrefs must be used inside <PrefsProvider>");
  return v;
}
