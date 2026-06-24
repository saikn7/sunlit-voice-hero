// Browser-native speech with Burmese support and language-aware voice picking.
import type { Lang } from "./i18n";

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
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

export function cancelSpeech() {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}

function pickVoice(lang: Lang): SpeechSynthesisVoice | undefined {
  if (!isSpeechSynthesisSupported()) return;
  const voices = window.speechSynthesis.getVoices();
  const want = LANG_TAG[lang];
  return (
    voices.find((v) => v.lang === want) ??
    voices.find((v) => v.lang.startsWith(lang === "my" ? "my" : "en"))
  );
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
  if (!isSpeechSynthesisSupported() || !text.trim()) {
    opts.onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();

  // Ensure voices are loaded (fires later on first load).
  const doSpeak = () => {
    const chunks = chunkText(text, 200);
    let i = 0;
    const next = () => {
      if (i >= chunks.length) {
        opts.onEnd?.();
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      u.lang = LANG_TAG[lang];
      const v = pickVoice(lang);
      if (v) u.voice = v;
      u.rate = opts.rate ?? 1;
      u.pitch = opts.pitch ?? 1;
      if (i === 1) u.onstart = () => opts.onStart?.();
      u.onend = () => next();
      u.onerror = (e) => {
        if ((e as SpeechSynthesisErrorEvent).error === "interrupted" || (e as SpeechSynthesisErrorEvent).error === "canceled") {
          opts.onEnd?.();
          return;
        }
        next();
      };
      window.speechSynthesis.speak(u);
    };
    next();
  };

  if (window.speechSynthesis.getVoices().length === 0) {
    const onVoices = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
      doSpeak();
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoices);
    setTimeout(doSpeak, 250); // fallback if voiceschanged never fires
  } else {
    doSpeak();
  }
}

function chunkText(text: string, maxLen: number): string[] {
  const sentences = text.match(/[^.!?။\n]+[.!?။\n]?\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > maxLen && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
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
