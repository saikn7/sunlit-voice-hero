// Browser-native speech utilities. Safe for SSR (guards on window).

type SR = typeof window extends { SpeechRecognition: infer T } ? T : any;

export function getSpeechRecognition(): any | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export type SpeakOptions = {
  rate?: number;
  pitch?: number;
  volume?: number;
  voiceName?: string;
  onEnd?: () => void;
  onStart?: () => void;
  onError?: (e: SpeechSynthesisErrorEvent) => void;
};

export function cancelSpeech() {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}

export function speak(text: string, opts: SpeakOptions = {}) {
  if (!isSpeechSynthesisSupported() || !text.trim()) {
    opts.onEnd?.();
    return;
  }
  // Cancel anything currently speaking so utterances don't queue indefinitely.
  window.speechSynthesis.cancel();

  // Long text: chunk at sentence boundaries to avoid the ~200ch cutoff in some browsers.
  const chunks = chunkText(text, 200);
  let i = 0;

  const speakNext = () => {
    if (i >= chunks.length) {
      opts.onEnd?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks[i++]);
    u.rate = opts.rate ?? 1;
    u.pitch = opts.pitch ?? 1;
    u.volume = opts.volume ?? 1;
    if (opts.voiceName) {
      const v = window.speechSynthesis.getVoices().find((v) => v.name === opts.voiceName);
      if (v) u.voice = v;
    }
    if (i === 1) u.onstart = () => opts.onStart?.();
    u.onend = () => speakNext();
    u.onerror = (e) => {
      // 'interrupted' / 'canceled' fire on cancel() — not a real error.
      if (e.error === "interrupted" || e.error === "canceled") {
        opts.onEnd?.();
        return;
      }
      opts.onError?.(e);
    };
    window.speechSynthesis.speak(u);
  };

  speakNext();
}

function chunkText(text: string, maxLen: number): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?\n]?\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > maxLen && cur) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > maxLen) {
      const words = s.split(/\s+/);
      let line = "";
      for (const w of words) {
        if ((line + " " + w).length > maxLen) {
          out.push(line.trim());
          line = w;
        } else {
          line += " " + w;
        }
      }
      if (line.trim()) cur += line;
    } else {
      cur += s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
