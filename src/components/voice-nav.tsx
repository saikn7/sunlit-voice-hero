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

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isiOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
  return isiOS;
}

export function VoiceNav() {
  const navigate = useNavigate();
  const { lang, setTheme, setLang } = usePrefs();
  const [listening, setListening] = React.useState(false);
  const [hint, setHint] = React.useState<string>("");
  const [subtitle, setSubtitle] = React.useState<string>("");
  const [typeMode, setTypeMode] = React.useState(false);
  const [typedValue, setTypedValue] = React.useState("");
  const recognizerRef = React.useRef<any>(null);
  const hintTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceUnsupported = React.useMemo(
    () => typeof window !== "undefined" && !isSpeechRecognitionSupported(),
    [],
  );
  const isIOS = React.useMemo(detectIOS, []);

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
    const text = safe.trim().toLowerCase();
    if (!text) return;
    try { console.log("[voice] transcript:", safe.trim()); } catch {}
    showSubtitle(safe.trim());

    // Theme intent detection (English + Burmese). Must match clear intent only.
    const themeText = safe.trim().toLowerCase();
    const lightRe = /\b(light mode|switch to light|turn on light(?: mode)?|light theme|enable light)\b|အလင်းမုဒ်/;
    const darkRe = /\b(dark mode|switch to dark|turn on dark(?: mode)?|dark theme|enable dark|night mode)\b|အမှောင်မုဒ်/;
    if (lightRe.test(themeText)) {
      setTheme("light");
      respond(lang === "my" ? "အလင်းမုဒ်သို့ ပြောင်းပြီးပါပြီ။" : "Switched to light mode.");
      return;
    }
    if (darkRe.test(themeText)) {
      setTheme("dark");
      respond(lang === "my" ? "အမှောင်မုဒ်သို့ ပြောင်းပြီးပါပြီ။" : "Switched to dark mode.");
      return;
    }

    // Let pages intercept (e.g. browse handles play/pause/play <title>)
    if (typeof window !== "undefined") {
      const ev = new CustomEvent("sv-voice", { detail: { text, raw: raw.trim() }, cancelable: true });
      const proceed = window.dispatchEvent(ev);
      if (!proceed) return; // page handled it
    }

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
  }, [lang, navigate, respond, showSubtitle, setTheme]);

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
      respond("Voice input is not supported in this browser.");
      return;
    }
    // Always destroy any prior session before starting a new one — prevents
    // the "mic dies after a few uses" bug where two recognizers fight.
    teardownRecognizer();

    const r = createRecognizer(lang, { continuous: true });
    if (!r) return;
    recognizerRef.current = r;
    r.onresult = (e: any) => handle(e.results?.[0]?.[0]?.transcript ?? "");
    r.onerror = (err: any) => {
      if (err?.error === "not-allowed") {
        respond(lang === "my" ? "မိုက်ခွင့်ပြုပါ။" : "Please allow microphone access.");
        teardownRecognizer();
        setListening(false);
        return;
      }
      // Non-fatal: clear state so the next tap starts a fresh session.
      teardownRecognizer();
      setListening(false);
    };
    r.onend = () => {
      // onend fires after stop()/abort()/silence. Always reset state so the
      // mic button works on the next press.
      if (recognizerRef.current === r) recognizerRef.current = null;
      setListening(false);
    };
    try {
      r.start();
      setListening(true);
      showHint(lang === "my" ? "နားထောင်နေသည်..." : "Listening… say 'play', 'pause', 'motivation', or 'play <title>'.", 3500);
    } catch {
      teardownRecognizer();
      setListening(false);
    }
  }, [handle, lang, respond, showHint, teardownRecognizer]);

  const stop = React.useCallback(() => {
    teardownRecognizer();
    cancelSpeech();
    setListening(false);
  }, [teardownRecognizer]);

  // Expose a global reset hook so any component can recover the mic.
  React.useEffect(() => {
    const onReset = () => resetRecognition();
    window.addEventListener("sv-voice-reset", onReset);
    return () => window.removeEventListener("sv-voice-reset", onReset);
  }, [resetRecognition]);

  // Safety net: tear the recognizer down on unmount so it doesn't leak.
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

  const submitTyped = (e?: React.FormEvent) => {
    e?.preventDefault();
    const v = typedValue.trim();
    if (!v) return;
    setTypedValue("");
    setTypeMode(false);
    handle(v);
  };

  const onMicClick = () => {
    if (voiceUnsupported || isIOS) {
      setTypeMode((m) => !m);
      showHint(
        lang === "my"
          ? "iOS တွင် အသံ မရရှိနိုင်ပါ။ ရိုက်ထည့်ပါ။"
          : "Voice not supported on iOS. Tap to type instead.",
        4000,
      );
      return;
    }
    if (listening) stop(); else start();
  };

  return (
    <>
      <button
        type="button"
        onClick={onMicClick}
        aria-pressed={listening}
        aria-label={
          voiceUnsupported || isIOS
            ? "Type a command (voice not supported on this device)"
            : listening
              ? "Stop voice command"
              : "Start voice command (press Space)"
        }
        className={`fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-elevated transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          listening ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-primary text-primary-foreground"
        }`}
        title={voiceUnsupported || isIOS ? "Tap to type a command" : "Press Space to talk"}
      >
        <span aria-hidden className="text-2xl">{voiceUnsupported || isIOS ? "⌨️" : "🎙️"}</span>
      </button>

      {typeMode && (
        <form
          onSubmit={submitTyped}
          className="fixed bottom-24 right-5 z-50 flex max-w-[92vw] items-center gap-2 rounded-2xl border border-border bg-card/95 p-2 shadow-elevated"
          role="search"
        >
          <input
            autoFocus
            type="text"
            inputMode="text"
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            placeholder={lang === "my" ? "ဥပမာ - ဖွင့် မော်တီဗေးရှင်း" : "e.g. play motivation"}
            aria-label="Type a command"
            className="w-64 max-w-[70vw] rounded-xl border border-border bg-input px-3 py-2 text-base"
          />
          <button
            type="submit"
            className="rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
          >
            {lang === "my" ? "သွား" : "Go"}
          </button>
        </form>
      )}

      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-24 right-5 z-50 max-w-xs rounded-lg bg-card/95 px-4 py-2 text-sm shadow-elevated border border-border transition ${
          hint && !typeMode ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {hint}
      </div>
      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 max-w-[90vw] rounded-lg bg-foreground/90 px-4 py-2 text-base font-medium text-background shadow-elevated transition ${
          subtitle || listening ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {subtitle || (listening ? (lang === "my" ? "နားထောင်နေသည်…" : "Listening…") : "")}
      </div>
    </>
  );
}
