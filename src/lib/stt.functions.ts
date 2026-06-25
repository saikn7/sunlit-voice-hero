import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  audio: z.string().min(1), // base64
  mimeType: z.string().min(1),
  lang: z.enum(["en", "my"]).default("en"),
});

export const transcribeAudio = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.GeminiAPI;
    if (!apiKey) throw new Error("Missing Gemini API key");

    const langName = data.lang === "my" ? "Burmese (မြန်မာ)" : "English";
    const prompt =
      `Transcribe the following ${langName} audio verbatim. ` +
      `Output ONLY the transcript text in ${langName} script, with no quotes, ` +
      `no explanation, no labels, no translation. If there is no speech, output an empty string.`;

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
      encodeURIComponent(apiKey);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: data.mimeType, data: data.audio } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini STT failed: ${res.status} ${body.slice(0, 200)}`);
    }

    const json: any = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((p: any) => p?.text ?? "")
      .join("")
      .trim();
    return { text };
  });
