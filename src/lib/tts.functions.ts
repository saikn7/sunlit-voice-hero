import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  text: z.string().min(1).max(5000),
  lang: z.enum(["en", "my"]).default("en"),
});

// Build a WAV (RIFF) file header around raw PCM16 mono 24kHz from Gemini.
function pcmToWav(pcm: Uint8Array, sampleRate = 24000): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  const out = new Uint8Array(buffer);
  out.set(pcm, 44);
  return out;
}

function b64encode(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const synthesizeSpeech = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.GeminiAPI;
    if (!apiKey) throw new Error("Missing Gemini API key");

    // Pick a clear, neutral voice. Same voice works for English and Burmese.
    const voiceName = "Kore";
    const sampleRate = 24000;

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=" +
      encodeURIComponent(apiKey);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: data.text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini TTS failed: ${res.status} ${body.slice(0, 200)}`);
    }

    const json: any = await res.json();
    const part = json?.candidates?.[0]?.content?.parts?.find(
      (p: any) => p?.inlineData?.data,
    );
    const b64: string | undefined = part?.inlineData?.data;
    if (!b64) throw new Error("Gemini TTS returned no audio");

    const pcm = b64decode(b64);
    const wav = pcmToWav(pcm, sampleRate);
    return { audio: b64encode(wav), mime: "audio/wav" };
  });
