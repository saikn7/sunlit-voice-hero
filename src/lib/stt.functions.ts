import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  audio: z.string().min(1), // base64
  mimeType: z.string().min(1),
  lang: z.enum(["en", "my"]).default("en"),
});

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function extFor(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base === "audio/webm") return "webm";
  if (base === "audio/mp4" || base === "audio/x-m4a" || base === "audio/m4a") return "mp4";
  if (base === "audio/mpeg") return "mp3";
  if (base === "audio/wav" || base === "audio/x-wav") return "wav";
  if (base === "audio/ogg") return "ogg";
  return "webm";
}

export const transcribeAudio = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const bytes = b64ToBytes(data.audio);
    const ext = extFor(data.mimeType);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: data.mimeType });

    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", blob, `recording.${ext}`);
    // Burmese: "my" (ISO-639-1). English: "en". Leave language hint so the
    // model doesn't auto-detect into the wrong script.
    form.append("language", data.lang === "my" ? "my" : "en");

    const res = await fetch(
      "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Transcription failed: ${res.status} ${body.slice(0, 200)}`);
    }

    const json: any = await res.json();
    const text: string = (json?.text ?? "").trim();
    return { text };
  });
