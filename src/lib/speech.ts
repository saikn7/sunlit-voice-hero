// Gemini-powered TTS with Burmese support, plus browser SpeechRecognition for input.
import type { Lang } from "./i18n";
import { synthesizeSpeech } from "./tts.functions";

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

export function getSpeechRecognition(): any | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null;
}

const LANG_TAG: Record<Lang, string> = { en: "en-US", my: "my-MM" };

let currentAudio: HTMLAudioElement | null = null;
let currentToken = 0;

export function cancelSpeech() {
  currentToken++;
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.src = "";
    } catch {}
    currentAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch {}
  }
}

export type SpeakOptions = {
  lang?: Lang;
  rate?: number;
  pitch?: number;
  onEnd?: () => void;
  onStart?: () => void;
};

export function speak(text: string, opts: SpeakOptions = {}) {
  const lang = opts.lang ?? "en";
  if (!text.trim() || typeof window === "undefined") {
    opts.onEnd?.();
    return;
  }
  cancelSpeech();
  const token = ++currentToken;

  (async () => {
    try {
      const { audio, mime } = await synthesizeSpeech({
        data: { text, lang },
      });
      if (token !== currentToken) return; // cancelled

      const src = `data:${mime};base64,${audio}`;
      const a = new Audio(src);
      a.playbackRate = opts.rate ?? 1;
      currentAudio = a;
      a.onplay = () => opts.onStart?.();
      a.onended = () => {
        if (currentAudio === a) currentAudio = null;
        opts.onEnd?.();
      };
      a.onerror = () => {
        if (currentAudio === a) currentAudio = null;
        opts.onEnd?.();
      };
      await a.play().catch(() => opts.onEnd?.());
    } catch (e) {
      console.error("[tts]", e);
      opts.onEnd?.();
    }
  })();
}

export function createRecognizer(lang: Lang): any | null {
  const SR = getSpeechRecognition();
  if (!SR) return null;
  const r = new SR();
  r.lang = LANG_TAG[lang];
  r.continuous = false;
  r.interimResults = false;
  r.maxAlternatives = 3;
  return r;
}
