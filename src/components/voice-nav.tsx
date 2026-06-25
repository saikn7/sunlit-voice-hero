import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { usePrefs } from "@/lib/prefs-context";
import {
  createRecognizer,
  isSpeechRecognitionSupported,
  speak,
  cancelSpeech,
} from "@/lib/speech";

type Dest = { to: "/" | "/browse" | "/donate" | "/contact" | "/listen" | "/auth"; en: string; my: string };

const ROUTES: { re: RegExp; dest: Dest }[] = [
  { re: /\b(home|main|start|index)\b|ပင်မ|အိမ်/, dest: { to: "/", en: "Going home.", my: "ပင်မသို့ သွားနေသည်။" } },
  { re: /\b(browse|explore|library|voices)\b/, dest: { to: "/browse", en: "Opening browse.", my: "Browse ဖွင့်နေသည်။" } },
  { re: /\b(donate|donation|give voice|record)\b|လှူ/, dest: { to: "/donate", en: "Opening donate voice.", my: "လှူဒါန်းမှု စာမျက်နှာ ဖွင့်နေသည်။" } },
  { re: /\b(contact|support|help desk|message)\b|ဆက်သွယ်/, dest: { to: "/contact", en: "Opening contact.", my: "ဆက်သွယ်ရန် စာမျက်နှာ ဖွင့်နေသည်။" } },
  { re: /\b(listen|listening|player|library)\b/, dest: { to: "/listen", en: "Opening listening mode.", my: "နားထောင်ရန် ဖွင့်နေသည်။" } },
  { re: /\b(sign in|sign up|log in|login|account|auth)\b/, dest: { to: "/auth", en: "Opening sign in.", my: "အကောင့်ဝင်ရန် ဖွင့်နေသည်။" } },
];

export function VoiceNav() {
  const navigate = useNavigate();
  const { lang } = usePrefs();
  const [listening, setListening] = React.useState(false);
  const [hint, setHint] = React.useState<string>("");
  const [subtitle, setSubtitle] = React.useState<string>("");
  const recognizerRef = React.useRef<any>(null);
  const hintTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHint = React.useCallback((msg: string, ms = 3500) => {
    setHint(msg);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHint(""), ms);
  }, []);

  const showSubtitle = React.useCallback((msg: string, ms = 4000) => {
    setSubtitle(msg);
    if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
    subtitleTimerRef.current = setTimeout(() => setSubtitle(""), ms);
  }, []);

  const respond = React.useCallback((msg: string) => {
    showHint(msg);
    speak(msg, { lang });
  }, [lang, showHint]);

  const handle = React.useCallback((raw: string) => {
    const text = (raw || "").trim().toLowerCase();
    if (!text) return;
    showSubtitle(raw.trim());

    // Try to find an action verb + destination
    for (const { re, dest } of ROUTES) {
      if (re.test(text)) {
        respond(lang === "my" ? dest.my : dest.en);
        navigate({ to: dest.to });
        return;
      }
    }

    // Try clicking a button/link by accessible name
    if (typeof document !== "undefined") {
      const stripped = text.replace(/^(click|press|open|go to|tap|select)\s+/i, "").trim();
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>("a, button, [role='button'], [role='link']"),
      );
      const match = candidates.find((el) => {
        const label = (el.getAttribute("aria-label") || el.innerText || "").trim().toLowerCase();
        return label && (label === stripped || label.includes(stripped));
      });
      if (match) {
        respond(lang === "my" ? `${stripped} ကို နှိပ်နေသည်။` : `Activating ${stripped}.`);
        match.click();
        return;
      }
    }

    respond(lang === "my" ? "နားမလည်ပါ။ ထပ်ပြောကြည့်ပါ။" : "Sorry, I didn't catch that.");
  }, [lang, navigate, respond, showSubtitle]);

  const start = React.useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      respond("Voice input is not supported in this browser.");
      return;
    }
    const r = createRecognizer(lang);
    if (!r) return;
    recognizerRef.current = r;
    r.onresult = (e: any) => handle(e.results?.[0]?.[0]?.transcript ?? "");
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    try {
      r.start();
      setListening(true);
      showHint(lang === "my" ? "နားထောင်နေသည်..." : "Listening… say a page like 'browse' or 'donate'.", 2500);
    } catch {
      setListening(false);
    }
  }, [handle, lang, respond, showHint]);

  const stop = React.useCallback(() => {
    try { recognizerRef.current?.stop(); } catch {}
    cancelSpeech();
    setListening(false);
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isField =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
      if (isField) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (listening) stop(); else start();
      } else if (e.key === "Escape" && listening) {
        stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listening, start, stop]);

  return (
    <>
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-pressed={listening}
        aria-label={listening ? "Stop voice command" : "Start voice command (press Space)"}
        className={`fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-elevated transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          listening ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-primary text-primary-foreground"
        }`}
        title="Press Space to talk"
      >
        <span aria-hidden className="text-2xl">🎙️</span>
      </button>
      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-24 right-5 z-50 max-w-xs rounded-lg bg-card/95 px-4 py-2 text-sm shadow-elevated border border-border transition ${
          hint ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {hint}
      </div>
    </>
  );
}
