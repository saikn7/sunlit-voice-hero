import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/lib/auth-context";
import { PrefsProvider, usePrefs } from "@/lib/prefs-context";
import { AppHeader } from "@/components/app-header";
import { VoiceNav } from "@/components/voice-nav";
import { speak, isSpeechSynthesisSupported } from "@/lib/speech";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <h2 className="mt-4 text-2xl">Page not found</h2>
        <p className="mt-2 text-muted-foreground">
          That page doesn't exist. Let's get you back to SunlitVoice.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-lg font-semibold text-primary-foreground"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4" role="alert">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-muted-foreground">
          The app hit an unexpected error. You can try again or go home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-lg bg-primary px-6 py-3 text-lg font-semibold text-primary-foreground"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-lg border border-border bg-card px-6 py-3 text-lg font-semibold"
          >
            Go home
          </a>
        </div>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SunlitVoice — Voice-first companion for blind and low-vision users" },
      { name: "description", content: "Donate your voice and listen by voice. An accessible, multilingual (English + Burmese) voice-first platform." },
      { name: "theme-color", content: "#3fa66b" },
      { property: "og:title", content: "SunlitVoice — Voice-first companion for blind and low-vision users" },
      { property: "og:description", content: "Donate your voice and listen by voice. An accessible, multilingual (English + Burmese) voice-first platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "SunlitVoice — Voice-first companion for blind and low-vision users" },
      { name: "twitter:description", content: "Donate your voice and listen by voice. An accessible, multilingual (English + Burmese) voice-first platform." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2d29e0d7-6c87-4421-b696-f06f24ef5fed/id-preview-abbede0a--331173ed-67b2-4676-912a-1c26b8f31588.lovable.app-1782291240620.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2d29e0d7-6c87-4421-b696-f06f24ef5fed/id-preview-abbede0a--331173ed-67b2-4676-912a-1c26b8f31588.lovable.app-1782291240620.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Myanmar:wght@400;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const antiFlash = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}else{document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';}}catch(e){}})();`;
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: antiFlash }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AppChrome() {
  const router = useRouter();
  const { lang } = usePrefs();

  // Keep <html lang> in sync so Burmese gets the right font fallback on iOS.
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  // Auth-state-driven cache invalidation (single root subscriber).
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <AppHeader />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <WelcomeGreeter />
      <VoiceNav />
    </>
  );
}

function WelcomeGreeter() {
  const { t, lang, demoMode } = usePrefs();
  useEffect(() => {
    if (!isSpeechSynthesisSupported()) return;
    if (typeof window === "undefined") return;
    if (!demoMode && window.sessionStorage.getItem("sv_greeted") === "1") return;
    const greet = () => {
      window.sessionStorage.setItem("sv_greeted", "1");
      window.removeEventListener("pointerdown", greet);
      window.removeEventListener("keydown", greet);
      // Defer speech off the input frame so click handlers (theme toggle,
      // nav, etc.) can commit/paint before the browser warms up voices.
      setTimeout(() => {
        speak(t("welcomeGreeting"), { lang, rate: demoMode ? 1.1 : 1 });
      }, 600);
    };
    window.addEventListener("pointerdown", greet, { once: true });
    window.addEventListener("keydown", greet, { once: true });
    return () => {
      window.removeEventListener("pointerdown", greet);
      window.removeEventListener("keydown", greet);
    };
  }, [t, lang, demoMode]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PrefsProvider>
          <AppChrome />
        </PrefsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
