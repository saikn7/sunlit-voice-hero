import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ donationId: z.string().uuid() });

const RISK_CATEGORIES = [
  "hate_speech",
  "offensive_language",
  "sexual_content",
  "violence",
  "harassment",
  "spam",
] as const;

export const moderateDonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const { supabase, userId } = context;

    const { data: donation, error: dErr } = await supabase
      .from("donations")
      .select("id, user_id, audio_path, mime_type, title, description, keywords")
      .eq("id", data.donationId)
      .maybeSingle();
    if (dErr || !donation) throw new Error("Donation not found");
    if (donation.user_id !== userId) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Download audio
    const { data: file, error: fErr } = await supabaseAdmin.storage
      .from("voice-donations")
      .download(donation.audio_path);
    if (fErr || !file) {
      await supabaseAdmin.from("donations").update({ moderation_status: "error" }).eq("id", donation.id);
      throw new Error("Audio download failed");
    }
    const mime = donation.mime_type || "audio/webm";
    const ext = mime.includes("mp4") ? "mp4" : mime.includes("mpeg") ? "mp3" : mime.includes("wav") ? "wav" : "webm";

    // 2. Transcribe via Lovable AI gateway
    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", file, `recording.${ext}`);
    const sttRes = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!sttRes.ok) {
      await supabaseAdmin.from("donations").update({ moderation_status: "error" }).eq("id", donation.id);
      return { ok: false, reason: "transcription_failed" };
    }
    const sttJson: any = await sttRes.json();
    const transcript: string = (sttJson?.text ?? "").trim();

    // 3. Classify with Lovable AI chat (JSON output)
    const combined = [donation.title || "", donation.description || "", (donation.keywords ?? []).join(" "), transcript]
      .filter(Boolean)
      .join("\n");

    const sys = `You are an audio content safety classifier. Given text from an audio recording, return JSON with two fields: "categories" (array of strings, any subset of: ${RISK_CATEGORIES.join(", ")}) and "risky" (boolean). Mark "risky": true only if you have clear evidence of any listed category. If the content is benign, return {"categories": [], "risky": false}. Respond with JSON only.`;

    const chatRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: combined || "(empty audio)" },
        ],
      }),
    });

    if (!chatRes.ok) {
      await supabaseAdmin.from("donations").update({ moderation_status: "error" }).eq("id", donation.id);
      return { ok: false, reason: "classification_failed" };
    }
    const chatJson: any = await chatRes.json();
    const raw = chatJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { categories?: string[]; risky?: boolean } = {};
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      parsed = {};
    }
    const categories = (parsed.categories ?? []).filter((c) =>
      (RISK_CATEGORIES as readonly string[]).includes(c),
    );
    const risky = !!parsed.risky && categories.length > 0;

    await supabaseAdmin
      .from("donations")
      .update({
        moderation_status: risky ? "risky" : "ok",
        risk_flag: risky ? "risky" : "normal",
        risk_categories: categories,
      })
      .eq("id", donation.id);

    return { ok: true, risky, categories };
  });
