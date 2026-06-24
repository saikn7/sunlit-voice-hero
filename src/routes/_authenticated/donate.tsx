import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { usePrefs } from "@/lib/prefs-context";
import type { Tables } from "@/integrations/supabase/types";

type Donation = Tables<"donations">;

export const Route = createFileRoute("/_authenticated/donate")({
  component: DonatePage,
  head: () => ({
    meta: [
      { title: "Donate Your Voice — VoiceBridge" },
      { name: "description", content: "Record or upload a voice message to share with the community." },
    ],
  }),
});

function pickMimeType(): { mime: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mime: "audio/webm", ext: "webm" };
  const options: { mime: string; ext: string }[] = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "m4a" },
    { mime: "audio/mpeg", ext: "mp3" },
  ];
  for (const o of options) {
    if (MediaRecorder.isTypeSupported(o.mime)) return o;
  }
  return { mime: "", ext: "webm" };
}

function DonatePage() {
  const { t, lang } = usePrefs();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [recording, setRecording] = React.useState(false);
  const [recordedBlob, setRecordedBlob] = React.useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [keywordsStr, setKeywordsStr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [elapsed, setElapsed] = React.useState(0);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = React.useRef<number>(0);

  const cleanupStream = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  React.useEffect(() => () => {
    cleanupStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [cleanupStream, previewUrl]);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const { mime } = pickMimeType();
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const type = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        setRecordedBlob(blob);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(blob));
        cleanupStream();
      };
      // Timeslice keeps long recordings stable: data flushed every second.
      mr.start(1000);
      startTimeRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
      setRecording(true);
    } catch (e) {
      setError(t("micDenied"));
    }
  }

  function stopRecording() {
    try { mediaRecorderRef.current?.stop(); } catch {}
    setRecording(false);
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRecordedBlob(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !recordedBlob) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const mime = recordedBlob.type || "audio/webm";
      const ext =
        mime.includes("mp4") ? "m4a" :
        mime.includes("mpeg") ? "mp3" :
        mime.includes("wav") ? "wav" :
        mime.includes("webm") ? "webm" : "audio";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("voice-donations")
        .upload(path, recordedBlob, { contentType: mime, upsert: false });
      if (upErr) throw upErr;

      const keywords = keywordsStr
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);

      const { error: insErr } = await supabase.from("donations").insert({
        user_id: user.id,
        title: title.trim() || t("untitled"),
        description: description.trim() || null,
        keywords,
        language: lang,
        audio_path: path,
        mime_type: mime,
        duration_seconds: elapsed || null,
      });
      if (insErr) throw insErr;

      setMsg(t("saved"));
      setRecordedBlob(null);
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
      setTitle(""); setDescription(""); setKeywordsStr(""); setElapsed(0);
      qc.invalidateQueries({ queryKey: ["donations"] });
      setTimeout(() => setMsg(null), 4000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8">
      <h1 className="text-3xl font-bold">{t("donateMode")}</h1>
      <p className="text-base text-muted-foreground">{t("recordingTip")}</p>

      <section className="grid gap-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          {!recording ? (
            <button
              type="button"
              onClick={startRecording}
              className="rounded-full bg-primary px-6 py-3 text-lg font-bold text-primary-foreground"
            >
              🎙️ {t("record")}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="relative rounded-full bg-destructive px-6 py-3 text-lg font-bold text-destructive-foreground pulse-ring"
            >
              ⏹ {t("stop")} ({elapsed}s)
            </button>
          )}
          <label className="cursor-pointer rounded-lg border border-border bg-secondary px-4 py-3 text-base font-semibold">
            📁 {t("upload")}
            <input
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg"
              onChange={onUpload}
              className="sr-only"
            />
          </label>
        </div>
        {previewUrl && (
          <audio src={previewUrl} controls className="w-full" aria-label="Preview recording" />
        )}
      </section>

      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1.5">
          <span className="text-base font-semibold">{t("title")}</span>
          <input
            type="text"
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-lg border border-border bg-input px-4 py-3 text-lg"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-base font-semibold">{t("description")}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            className="rounded-lg border border-border bg-input px-4 py-3 text-lg"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-base font-semibold">{t("keywords")}</span>
          <input
            type="text"
            value={keywordsStr}
            onChange={(e) => setKeywordsStr(e.target.value)}
            maxLength={200}
            className="rounded-lg border border-border bg-input px-4 py-3 text-lg"
          />
        </label>

        {error && <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-destructive">{error}</p>}
        {msg && <p role="status" className="rounded-md bg-primary/15 px-3 py-2 text-primary">{msg}</p>}

        <button
          type="submit"
          disabled={busy || !recordedBlob}
          className="rounded-lg bg-primary px-6 py-3 text-lg font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy ? t("loading") : t("submit")}
        </button>
      </form>

      <YourDonations />
    </div>
  );
}

function YourDonations() {
  const { t } = usePrefs();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["donations", "mine", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("donations")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Donation[];
    },
  });

  const [signedUrls, setSignedUrls] = React.useState<Record<string, string>>({});

  async function ensureUrl(d: Donation) {
    if (signedUrls[d.id]) return signedUrls[d.id];
    const { data } = await supabase.storage.from("voice-donations").createSignedUrl(d.audio_path, 3600);
    if (data?.signedUrl) {
      setSignedUrls((prev) => ({ ...prev, [d.id]: data.signedUrl }));
      return data.signedUrl;
    }
    return null;
  }

  async function deleteDonation(d: Donation) {
    if (!confirm(t("deleteConfirm"))) return;
    await supabase.storage.from("voice-donations").remove([d.audio_path]);
    const { error } = await supabase.from("donations").delete().eq("id", d.id);
    if (!error) qc.invalidateQueries({ queryKey: ["donations"] });
  }

  async function reportDonation(d: Donation) {
    const reason = prompt(t("reportReason"));
    if (!reason || !user) return;
    const { error } = await supabase.from("reports").insert({
      donation_id: d.id, reporter_id: user.id, reason,
    });
    if (!error) alert(t("flagged"));
  }

  return (
    <section aria-labelledby="my-donations" className="grid gap-3">
      <h2 id="my-donations" className="text-2xl font-bold">{t("yourDonations")}</h2>
      {isLoading && <p>{t("loading")}</p>}
      {!isLoading && data.length === 0 && (
        <p className="text-muted-foreground">— —</p>
      )}
      <ul className="grid gap-3">
        {data.map((d) => (
          <li key={d.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{d.title}</p>
                {d.description && <p className="text-sm text-muted-foreground">{d.description}</p>}
                {d.keywords?.length > 0 && (
                  <p className="text-sm text-muted-foreground">#{d.keywords.join(" #")}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const url = await ensureUrl(d);
                    if (url) new Audio(url).play();
                  }}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                >
                  ▶ {t("play")}
                </button>
                <button
                  type="button"
                  onClick={() => reportDonation(d)}
                  className="rounded-md bg-secondary px-3 py-2 text-sm font-semibold"
                >
                  🚩 {t("report")}
                </button>
                <button
                  type="button"
                  onClick={() => deleteDonation(d)}
                  className="rounded-md bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground"
                >
                  🗑 {t("delete")}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
