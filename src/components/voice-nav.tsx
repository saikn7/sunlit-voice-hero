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
  const [errorState, setErrorState] = React.useState(false);
  const recognizerRef = React.useRef<any>(null);
  const retryCountRef = React.useRef(0);

  const gotResultRef = React.useRef(false);
  const hintTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceUnsupported = React.useMemo(
    () => typeof window !== "undefined" && !isSpeechRecognitionSupported(),
    [],
  );

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
    const safe = (raw || "").normalize("NFC");
    const hasMyanmar = /[\u1000-\u109F\uAA60-\uAA7F\uA9E0-\uA9FF]/.test(safe);
    const text = hasMyanmar ? safe.trim() : safe.trim().toLowerCase();
    if (!text) return;
    try { console.log("[voice] transcript:", safe.trim()); } catch {}
    showSubtitle(safe.trim());

    if (typeof window !== "undefined") {
      const ev = new CustomEvent("sv-voice", { detail: { text, raw: raw.trim() }, cancelable: true });
      const proceed = window.dispatchEvent(ev);
      if (!proceed) return;
    }

    for (const { re, dest } of ROUTES) {
      if (re.test(text)) {
        respond(lang === "my" ? dest.my : dest.en);
        navigate({ to: dest.to });
        return;
      }
    }

    if (typeof document !== "undefined") {
      const stripped = text.replace(/^(click|press|open|go to|tap|select|find|show|switch to|filter|category)\s+/i, "").trim();
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>("a, button, [role='button'], [role='link'], [role='tab']"),
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

  const teardownRecognizer = React.useCallback(() => {
    const r = recognizerRef.current;
    recognizerRef.current = null;
    if (!r) return;
    try { r.onresult = undefined; r.onerror = undefined; r.onend = undefined; } catch {}
    try { r.abort?.(); } catch {}
    try { r.stop?.(); } catch {}
  }, []);

  const resetRecognition = React.useCallback(() => {
    teardownRecognizer();
    cancelSpeech();
    setListening(false);
    showHint(lang === "my" ? "မိုက်ပြန်စတင်နေသည်…" : "Resetting microphone…", 1500);
  }, [lang, showHint, teardownRecognizer]);

  const start = React.useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      setErrorState(true);
      respond(lang === "my" ? "အသံ မရရှိနိုင်ပါ။" : "Voice not available.");
      return;
    }
    teardownRecognizer();

    const r = createRecognizer(lang, { continuous: true });
    if (!r) {
      setErrorState(true);
      return;
    }
    recognizerRef.current = r;
    gotResultRef.current = false;
    let started = false;

    r.onstart = () => {
      started = true;
      setErrorState(false);
      setListening(true);
    };
    r.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript.trim()) {
        gotResultRef.current = true;
        retryCountRef.current = 0;
        handle(transcript);
      }
    };
    r.onerror = (err: any) => {
      if (err?.error === "not-allowed") {
        respond(lang === "my" ? "မိုက်ခွင့်ပြုပါ။" : "Please allow microphone access.");
        teardownRecognizer();
        setListening(false);
        setErrorState(true);
        return;
      }
      teardownRecognizer();
      setListening(false);
    };
    r.onend = () => {
      if (recognizerRef.current === r) recognizerRef.current = null;
      setListening(false);
      if (!gotResultRef.current && retryCountRef.current < 3) {
        retryCountRef.current += 1;
        setTimeout(() => { try { start(); } catch {} }, 300);
      } else if (!gotResultRef.current) {
        retryCountRef.current = 0;
        showHint(
          lang === "my" ? "မိုက်ကို ပြန်နှိပ်၍ ထပ်ကြိုးစားပါ။" : "Tap to retry microphone.",
          3500,
        );
      } else {
        retryCountRef.current = 0;
      }
    };

    try {
      r.start();
      // Don't flip listening=true until onstart fires — avoids fake-recording UI.
      showHint(lang === "my" ? "နားထောင်နေသည်..." : "Listening…", 2500);
      // Safety fallback: if onstart never fires in 800ms, assume started.
      setTimeout(() => { if (!started && recognizerRef.current === r) setListening(true); }, 800);
    } catch {
      teardownRecognizer();
      setListening(false);
      setErrorState(true);
    }
  }, [handle, lang, respond, showHint, teardownRecognizer]);

  const stop = React.useCallback(() => {
    teardownRecognizer();
    cancelSpeech();
    setListening(false);
  }, [teardownRecognizer]);

  React.useEffect(() => {
    const onReset = () => resetRecognition();
    window.addEventListener("sv-voice-reset", onReset);
    return () => window.removeEventListener("sv-voice-reset", onReset);
  }, [resetRecognition]);

  React.useEffect(() => () => { teardownRecognizer(); }, [teardownRecognizer]);

  React.useEffect(() => {
    const onFeedback = (e: Event) => {
      const detail = (e as CustomEvent<{ msg: string; silent?: boolean }>).detail;
      if (!detail?.msg) return;
      showHint(detail.msg);
      if (!detail.silent) speak(detail.msg, { lang });
    };
    window.addEventListener("sv-voice-feedback", onFeedback as EventListener);
    return () => window.removeEventListener("sv-voice-feedback", onFeedback as EventListener);
  }, [lang, showHint]);

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

  const onMicClick = () => {
    if (voiceUnsupported) {
      setErrorState(true);
      showHint(lang === "my" ? "အသံ မရရှိနိုင်ပါ။" : "Voice not available.", 3500);
      return;
    }
    if (listening) stop(); else start();
  };

  const statusLabel = voiceUnsupported || errorState
    ? (lang === "my" ? "အသံ မရရှိနိုင်ပါ" : "Voice not available")
    : listening
      ? (lang === "my" ? "နားထောင်နေသည်…" : "Listening…")
      : (lang === "my" ? "ပြောရန် နှိပ်ပါ" : "Tap to speak");

  return (
    <>
      {/* Centered floating mic — voice-only primary input */}
      <div className="pointer-events-none fixed inset-x-0 bottom-8 z-50 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onMicClick}
          aria-pressed={listening}
          aria-disabled={voiceUnsupported}
          aria-label={statusLabel}
          className={`pointer-events-auto relative flex h-20 w-20 items-center justify-center rounded-full shadow-elevated transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 ${
            voiceUnsupported || errorState
              ? "bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground hover:scale-105"
          }`}
        >
          {listening && (
            <>
              <span aria-hidden className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
              <span aria-hidden className="absolute -inset-2 rounded-full border-2 border-primary/30 animate-pulse" />
            </>
          )}
          <span aria-hidden className="relative text-3xl">🎙️</span>
        </button>

        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none rounded-full bg-card/95 px-4 py-1.5 text-sm font-medium text-foreground border border-border shadow-elevated"
        >
          {statusLabel}
        </div>
      </div>

      {/* Hint toast */}
      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-36 left-1/2 z-50 -translate-x-1/2 max-w-xs rounded-lg bg-card/95 px-4 py-2 text-sm shadow-elevated border border-border transition ${
          hint ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {hint}
      </div>

      {/* Subtitle of recognized transcript */}
      <div
        role="status"
        aria-live="polite"
        className={`fixed top-6 left-1/2 z-50 -translate-x-1/2 max-w-[90vw] rounded-lg bg-foreground/90 px-4 py-2 text-base font-medium text-background shadow-elevated transition ${
          subtitle ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {subtitle}
      </div>
    </>
  );
}
