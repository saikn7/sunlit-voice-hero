// Gemini-powered TTS + STT (Burmese-friendly), with browser SpeechRecognition fallback for compatibility.
import type { Lang } from "./i18n";
import { synthesizeSpeech } from "./tts.functions";
import { transcribeAudio } from "./stt.functions";

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof window.MediaRecorder !== "undefined"
  );
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

  (async () => {
    try {
      const { audio, mime } = await synthesizeSpeech({ data: { text, lang } });
      if (token !== currentToken) return;
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
        playBrowserFallback();
      };
      await a.play().catch(() => playBrowserFallback());
    } catch (e) {
      console.warn("[tts] Gemini failed, falling back to browser SpeechSynthesis", e);
      playBrowserFallback();
    }
  })();
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

export function createRecognizer(lang: Lang): GeminiRecognizer | null {
  if (!isSpeechRecognitionSupported()) return null;

  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let aborted = false;
  let stopped = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

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

          // Safety cap so a forgotten session doesn't record forever.
          timeoutId = setTimeout(() => {
            if (!stopped) rec.stop();
          }, MAX_RECORDING_MS);
        } catch (err: any) {
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
