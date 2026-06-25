// Browser-first speech: Web Speech API for recognition (when available, e.g.
// Chrome/Edge/Safari) with a MediaRecorder + Gemini fallback for other
// browsers. TTS uses the free SpeechSynthesis API to avoid quota issues.
import type { Lang } from "./i18n";

import { transcribeAudio } from "./stt.functions";

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  const hasWebSpeech = !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  const hasRecorder =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof window.MediaRecorder !== "undefined";
  return hasWebSpeech || hasRecorder;
}

export function hasNativeWebSpeech(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

const LANG_TAG: Record<Lang, string> = { en: "en-US", my: "my-MM" };

function getVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  try { return window.speechSynthesis.getVoices() ?? []; } catch { return []; }
}

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  const voices = getVoices();
  if (!voices.length) return null;
  const target = LANG_TAG[lang].toLowerCase();
  const prefix = target.split("-")[0];
  const browserLangs = (typeof navigator !== "undefined"
    ? [navigator.language, ...(navigator.languages ?? [])]
    : []
  ).map((l) => l.toLowerCase());

  // 1. Exact match on target tag (e.g. my-MM)
  let v = voices.find((x) => x.lang?.toLowerCase() === target);
  if (v) return v;
  // 2. Same language prefix (e.g. my-*)
  v = voices.find((x) => x.lang?.toLowerCase().startsWith(prefix + "-") || x.lang?.toLowerCase() === prefix);
  if (v) return v;
  // 3. Burmese name hints
  if (lang === "my") {
    v = voices.find((x) => /burmese|myanmar|မြန်မာ/i.test(x.name));
    if (v) return v;
  }
  // 4. Prefer voice matching the browser's preferred languages — but never
  //    fall back to a non-Burmese voice when speaking Burmese, that would
  //    pronounce the text with the wrong phonetics.
  if (lang !== "my") {
    for (const bl of browserLangs) {
      v = voices.find((x) => x.lang?.toLowerCase() === bl);
      if (v) return v;
      const bp = bl.split("-")[0];
      v = voices.find((x) => x.lang?.toLowerCase().startsWith(bp + "-"));
      if (v) return v;
    }
  }
  return null;
}

// Warm up the voice list (some browsers populate it asynchronously).
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => { try { window.speechSynthesis.getVoices(); } catch {} };
  } catch {}
}

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

  const playBrowserFallback = () => {
    if (token !== currentToken) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      opts.onEnd?.();
      return;
    }
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = LANG_TAG[lang];
      u.rate = opts.rate ?? 1;
      u.pitch = opts.pitch ?? 1;
      const voice = pickVoice(lang);
      if (voice) u.voice = voice;
      u.onstart = () => opts.onStart?.();
      u.onend = () => opts.onEnd?.();
      u.onerror = () => opts.onEnd?.();
      window.speechSynthesis.speak(u);
    } catch {
      opts.onEnd?.();
    }
  };

  // Use the free browser SpeechSynthesis API — no API quota, instant.
  void token;
  playBrowserFallback();
}

// ----------------------------------------------------------------------------
// Speech-to-text: MediaRecorder + Gemini, exposing the same surface the app
// previously used from webkitSpeechRecognition (start/stop/abort + onresult/
// onerror/onend), so existing callers keep working.
// ----------------------------------------------------------------------------

type ResultEvent = { results: Array<Array<{ transcript: string }>> };

export type GeminiRecognizer = {
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult?: (e: ResultEvent) => void;
  onerror?: (e: { error: string; message?: string }) => void;
  onend?: () => void;
};

const MAX_RECORDING_MS = 30_000;

function pickMimeType(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  if (typeof window === "undefined" || !("MediaRecorder" in window)) return undefined;
  return candidates.find((t) => (window.MediaRecorder as any).isTypeSupported?.(t));
}

function baseMime(m: string): string {
  // Gemini wants the bare type, no codecs= parameter.
  return m.split(";")[0].trim();
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
function createWebSpeechRecognizer(lang: Lang, opts: RecognizerOptions): GeminiRecognizer | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  const Impl = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Impl) return null;

  let stopped = false;
  let aborted = false;
  const sr = new Impl();
  sr.lang = LANG_TAG[lang];
  sr.continuous = !!opts.continuous;
  // Interim results let us fire commands as soon as the phrase stabilises,
  // ~300ms ahead of the browser's end-of-speech detection.
  sr.interimResults = true;
  sr.maxAlternatives = 1;

  let lastEmitted = "";
  let interimText = "";
  let interimTimer: ReturnType<typeof setTimeout> | null = null;
  const INTERIM_COMMIT_MS = 280;

  const clearInterim = () => {
    if (interimTimer) { clearTimeout(interimTimer); interimTimer = null; }
    interimText = "";
  };

  const rec: GeminiRecognizer = {
    lang: LANG_TAG[lang],
    start() {
      stopped = false;
      aborted = false;
      lastEmitted = "";
      clearInterim();
      try { sr.start(); } catch { /* already started */ }
    },
    stop() {
      stopped = true;
      clearInterim();
      try { sr.stop(); } catch {}
    },
    abort() {
      aborted = true;
      stopped = true;
      clearInterim();
      try { sr.abort(); } catch {}
    },
  };

  const emit = (t: string) => {
    const text = t.trim();
    if (!text || text === lastEmitted) return;
    lastEmitted = text;
    rec.onresult?.({ results: [[{ transcript: text }]] });
  };

  sr.onresult = (e: any) => {
    if (aborted) return;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const t = (r[0]?.transcript ?? "").normalize("NFC");
      if (r.isFinal) {
        clearInterim();
        try { console.log("[voice] recognized:", t); } catch {}
        emit(t);
        if (opts.continuous) { try { sr.stop(); } catch {} }
      } else if (t && t !== interimText) {
        interimText = t;
        if (interimTimer) clearTimeout(interimTimer);
        interimTimer = setTimeout(() => {
          const pending = interimText;
          clearInterim();
          if (pending) {
            try { console.log("[voice] recognized (interim):", pending); } catch {}
            emit(pending);
            try { sr.stop(); } catch {}
          }
        }, INTERIM_COMMIT_MS);
      }
    }
  };
  sr.onerror = (e: any) => {
    if (e?.error === "no-speech" || e?.error === "aborted") return; // benign
    // Burmese (my-MM) isn't supported on all browsers; fall back to
    // auto-detect (no lang) and restart so the user can still talk.
    if (e?.error === "language-not-supported" && sr.lang) {
      try { console.log("[voice] Switching to auto voice mode"); } catch {}
      try {
        window.dispatchEvent(new CustomEvent("sv-voice-feedback", {
          detail: { msg: "Switching to auto voice mode" },
        }));
      } catch {}
      try { sr.lang = ""; } catch {}
      try { sr.start(); return; } catch {}
    }
    rec.onerror?.({ error: e?.error || "audio-capture", message: e?.message });
  };
  sr.onend = () => {
    clearInterim();
    lastEmitted = "";
    if (opts.continuous && !stopped && !aborted) {
      try { sr.start(); return; } catch {}
    }
    rec.onend?.();
  };

  return rec;
}


export type RecognizerOptions = { continuous?: boolean };

export function createRecognizer(lang: Lang, opts: RecognizerOptions = {}): GeminiRecognizer | null {
  if (!isSpeechRecognitionSupported()) return null;

  // Prefer the native Web Speech API when available — it's instant, free,
  // supports continuous listening, and doesn't need a server roundtrip.
  if (hasNativeWebSpeech()) {
    const native = createWebSpeechRecognizer(lang, opts);
    if (native) return native;
  }

  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let aborted = false;
  let stopped = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let vadRafId: number | null = null;
  let audioCtx: AudioContext | null = null;
  const SILENCE_MS = 450;        // stop quickly after the user stops talking
  const MIN_SPEECH_MS = 180;     // need this much voice before silence counts
  const RMS_THRESHOLD = 0.015;   // ~mic noise floor for "voice"


  const stopVad = () => {
    if (vadRafId !== null) { cancelAnimationFrame(vadRafId); vadRafId = null; }
    if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
  };

  const rec: GeminiRecognizer = {
    lang: LANG_TAG[lang],
    start() {
      aborted = false;
      stopped = false;
      chunks = [];

      (async () => {
        try {
          // Pre-check permission for clearer errors on Chrome/Edge.
          if ((navigator as any).permissions?.query) {
            try {
              const status = await (navigator as any).permissions.query({ name: "microphone" });
              if (status.state === "denied") {
                rec.onerror?.({ error: "not-allowed", message: "Microphone permission denied" });
                rec.onend?.();
                return;
              }
            } catch { /* not all browsers support this query */ }
          }

          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: { ideal: 16000 },
              channelCount: { ideal: 1 },
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          if (aborted) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }

          const mimeType = pickMimeType();
          recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 });
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };
          recorder.onerror = () => {
            rec.onerror?.({ error: "audio-capture" });
          };
          recorder.onstop = async () => {
            stopVad();
            const tracks = stream?.getTracks() ?? [];
            tracks.forEach((t) => t.stop());
            stream = null;
            if (aborted) {
              rec.onend?.();
              return;
            }
            const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
            if (blob.size < 1024) {
              rec.onerror?.({ error: "no-speech", message: "Recording was too short or silent" });
              rec.onend?.();
              return;
            }
            try {
              const b64 = await blobToBase64(blob);
              const { text } = await transcribeAudio({
                data: { audio: b64, mimeType: baseMime(blob.type), lang },
              });
              if (text.trim()) {
                rec.onresult?.({ results: [[{ transcript: text }]] });
              } else {
                rec.onerror?.({ error: "no-speech", message: "No speech detected" });
              }
            } catch (err: any) {
              console.error("[stt]", err);
              rec.onerror?.({ error: "network", message: err?.message || "Transcription failed" });
            } finally {
              rec.onend?.();
            }
          };

          recorder.start();

          // Voice-activity detection: auto-stop after sustained silence so the
          // user doesn't need to press stop after they finish speaking.
          try {
            const Ctx = (window as any).AudioContext ?? (window as any).webkitAudioContext;
            if (Ctx && stream) {
              const ctx: AudioContext = new Ctx();
              audioCtx = ctx;
              const source = ctx.createMediaStreamSource(stream);
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 1024;
              source.connect(analyser);
              const buf = new Float32Array(analyser.fftSize);
              const startedAt = performance.now();
              let lastVoiceAt = startedAt;
              let sawVoice = false;
              const tick = () => {
                if (stopped || !recorder || recorder.state === "inactive") return;
                analyser.getFloatTimeDomainData(buf);
                let sum = 0;
                for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
                const rms = Math.sqrt(sum / buf.length);
                const now = performance.now();
                if (rms > RMS_THRESHOLD) { lastVoiceAt = now; sawVoice = true; }
                const elapsed = now - startedAt;
                const silentFor = now - lastVoiceAt;
                if (sawVoice && elapsed > MIN_SPEECH_MS && silentFor > SILENCE_MS) {
                  rec.stop();
                  return;
                }
                vadRafId = requestAnimationFrame(tick);
              };
              vadRafId = requestAnimationFrame(tick);
            }
          } catch { /* VAD is best-effort */ }

          // Safety cap so a forgotten session doesn't record forever.
          timeoutId = setTimeout(() => {
            if (!stopped) rec.stop();
          }, MAX_RECORDING_MS);
        } catch (err: any) {
          stopVad();
          const name = err?.name;
          const code =
            name === "NotAllowedError" || name === "SecurityError" ? "not-allowed" :
            name === "NotFoundError" ? "audio-capture" :
            name === "NotReadableError" ? "audio-capture" : "audio-capture";
          rec.onerror?.({ error: code, message: err?.message });
          rec.onend?.();
        }
      })();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      stopVad();
      try {
        if (recorder && recorder.state !== "inactive") recorder.stop();
        else rec.onend?.();
      } catch {
        rec.onend?.();
      }
    },
    abort() {
      aborted = true;
      stopped = true;
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      stopVad();
      try {
        if (recorder && recorder.state !== "inactive") recorder.stop();
      } catch {}
      const tracks = stream?.getTracks() ?? [];
      tracks.forEach((t) => t.stop());
      stream = null;
    },
  };

  return rec;
}

// Kept for any code that still imports it.
export function getSpeechRecognition(): any | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
