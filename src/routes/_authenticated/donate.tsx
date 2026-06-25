import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { usePrefs } from "@/lib/prefs-context";
import { moderateDonation } from "@/lib/moderation.functions";
import type { Tables } from "@/integrations/supabase/types";

type Donation = Tables<"donations">;

export const Route = createFileRoute("/_authenticated/donate")({
  component: DonatePage,
  head: () => ({
    meta: [
      { title: "Donate Your Voice — SunlitVoice" },
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
  const [copyrightOk, setCopyrightOk] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const moderate = useServerFn(moderateDonation);
  const [confirmation, setConfirmation] = React.useState<{
    title: string;
    durationSeconds: number;
    keywords: string[];
    mime: string;
    submittedAt: Date;
  } | null>(null);


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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: 16000 },
          channelCount: { ideal: 1 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const { mime } = pickMimeType();
      const mr = mime
        ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 128000 })
        : new MediaRecorder(stream, { audioBitsPerSecond: 128000 });
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

      const { data: inserted, error: insErr } = await supabase
        .from("donations")
        .insert({
          user_id: user.id,
          title: title.trim() || t("untitled"),
          description: description.trim() || null,
          keywords,
          language: lang,
          audio_path: path,
          mime_type: mime,
          duration_seconds: elapsed || null,
          copyright_confirmed: copyrightOk,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      // Fire-and-forget AI moderation; runs in background, updates risk_flag.
      if (inserted?.id) {
        moderate({ data: { donationId: inserted.id } }).catch((err) => {
          console.warn("Moderation failed:", err);
        });
      }

      const submittedTitle = title.trim() || t("untitled");
      const submittedDuration = elapsed;
      setConfirmation({
        title: submittedTitle,
        durationSeconds: submittedDuration,
        keywords,
        mime,
        submittedAt: new Date(),
      });
      setMsg(null);
      setRecordedBlob(null);
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
      setTitle(""); setDescription(""); setKeywordsStr(""); setElapsed(0); setCopyrightOk(false);
      qc.invalidateQueries({ queryKey: ["donations"] });
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });

    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (confirmation) {
    const mins = Math.floor(confirmation.durationSeconds / 60);
    const secs = confirmation.durationSeconds % 60;
    const durationLabel = confirmation.durationSeconds > 0
      ? `${mins > 0 ? `${mins}m ` : ""}${secs}s`
      : t("uploadedFile");
    return (
      <div className="grid gap-10">
        <section
          aria-labelledby="confirm-heading"
          className="rounded-3xl border border-border bg-card p-8 shadow-elevated md:p-12"
        >
          <div className="flex flex-col items-center text-center">
            <span aria-hidden className="grid h-20 w-20 place-items-center rounded-full bg-primary text-4xl text-primary-foreground shadow-elevated">✓</span>
            <span className="mt-6 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              {t("recordingUploaded")}
            </span>
            <h1 id="confirm-heading" className="mt-4 text-balance text-4xl leading-tight md:text-5xl" style={{ fontFamily: "var(--font-display)" }}>
              {t("thanksDonating")}
            </h1>
            <p className="mt-3 max-w-xl text-lg text-muted-foreground">{t("savedExplain")}</p>
          </div>

          <dl className="mt-8 grid gap-4 rounded-2xl bg-secondary/40 p-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("title")}</dt>
              <dd className="mt-1 truncate text-base font-semibold">{confirmation.title}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("length")}</dt>
              <dd className="mt-1 text-base font-semibold">{durationLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("submitted")}</dt>
              <dd className="mt-1 text-base font-semibold">
                {confirmation.submittedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </dd>
            </div>
            {confirmation.keywords.length > 0 && (
              <div className="sm:col-span-3">
                <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("keywordsLabel")}</dt>
                <dd className="mt-1.5 flex flex-wrap gap-1.5">
                  {confirmation.keywords.map((k) => (
                    <span key={k} className="rounded-full bg-card px-2.5 py-0.5 text-xs font-semibold">#{k}</span>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-8">
            <h2 className="text-xl" style={{ fontFamily: "var(--font-display)" }}>{t("whatNext")}</h2>
            <ol className="mt-3 grid gap-2 text-base text-muted-foreground">
              <li><span className="font-semibold text-foreground">1.</span> {t("next1")}</li>
              <li><span className="font-semibold text-foreground">2.</span> {t("next2")}</li>
              <li><span className="font-semibold text-foreground">3.</span> {t("next3")}</li>
            </ol>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => setConfirmation(null)} className="rounded-2xl bg-primary px-6 py-3.5 text-lg font-bold text-primary-foreground shadow-elevated hover:opacity-95">
              {t("donateAnother")}
            </button>
            <Link to="/browse" className="rounded-2xl border border-border bg-card px-6 py-3.5 text-lg font-bold text-foreground hover:bg-secondary">
              {t("browseLibrary")}
            </Link>
          </div>
        </section>

        <YourDonations />
      </div>
    );
  }

  return (
    <div className="grid gap-10">

      <header>
        <span className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
          {t("donateBadge")}
        </span>
        <h1
          className="mt-4 text-balance text-5xl leading-[1.05] md:text-6xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t("donateHeadline")}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          {t("donateSub")}
        </p>
      </header>


      <section
        aria-label="Record or upload"
        className="rounded-3xl border border-border bg-card p-6 shadow-elevated md:p-8"
      >
        <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
          {/* Record */}
          <div className="grid place-items-center gap-4 rounded-2xl bg-secondary/40 p-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("recordInBrowser")}
            </p>

            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                className="grid h-24 w-24 place-items-center rounded-full bg-primary text-4xl text-primary-foreground shadow-elevated transition hover:scale-105"
                aria-label={t("record")}
              >
                🎙️
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="pulse-ring relative grid h-24 w-24 place-items-center rounded-full bg-destructive text-3xl text-destructive-foreground"
                aria-label={t("stop")}
              >
                ⏹
              </button>
            )}
            <p className="text-base font-semibold" aria-live="polite">
              {recording ? `${t("stop")} · ${elapsed}s` : t("record")}
            </p>
            {recording && (
              <p className="text-sm text-primary animate-pulse">
                {t("keepTalking")}
              </p>
            )}
          </div>

          {/* Upload */}
          <div className="grid place-items-center gap-4 rounded-2xl border-2 border-dashed border-border p-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("orUploadFile")}
            </p>
            <label className="cursor-pointer rounded-2xl bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-elevated hover:opacity-95">
              📁 {t("upload")}
              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg"
                onChange={onUpload}
                className="sr-only"
              />
            </label>
            <p className="text-sm text-muted-foreground">
              {t("fileTypes")}
            </p>
          </div>

        </div>

        {previewUrl && (
          <div className="mt-6 rounded-2xl bg-background p-4">
            <p className="mb-2 text-sm font-semibold text-muted-foreground">{t("preview")}</p>
            <audio
              src={previewUrl}
              controls
              className="w-full"
              aria-label={t("preview")}
            />
          </div>
        )}

      </section>

      <form
        onSubmit={submit}
        className="grid gap-5 rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8"
      >
        <h2
          className="text-2xl md:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t("aboutRecording")}
        </h2>

        <label className="grid gap-1.5">
          <span className="text-base font-semibold">{t("title")}</span>
          <input
            type="text"
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
            className="rounded-2xl border border-border bg-input px-4 py-3 text-lg"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-base font-semibold">{t("description")}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t("descPlaceholder")}
            className="rounded-2xl border border-border bg-input px-4 py-3 text-lg"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-base font-semibold">{t("keywords")}</span>
          <input
            type="text"
            value={keywordsStr}
            onChange={(e) => setKeywordsStr(e.target.value)}
            maxLength={200}
            placeholder={t("keywordsPlaceholder")}
            className="rounded-2xl border border-border bg-input px-4 py-3 text-lg"
          />
          <span className="text-sm text-muted-foreground">
            {t("keywordsHelp")}
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-2xl border border-border bg-secondary/40 p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={copyrightOk}
            onChange={(e) => setCopyrightOk(e.target.checked)}
            className="mt-1 h-5 w-5 accent-primary"
            required
          />
          <span className="text-sm">
            <span className="font-semibold">I confirm that I personally recorded this audio and own the rights to it.</span>
            <span className="block text-muted-foreground mt-0.5">
              Uploading audio you do not own may be flagged and removed.
            </span>
          </span>
        </label>




        {error && (
          <p
            role="alert"
            className="rounded-2xl bg-destructive/15 px-4 py-3 text-destructive"
          >
            {error}
          </p>
        )}
        {msg && (
          <p
            role="status"
            className="rounded-2xl bg-primary/15 px-4 py-3 text-primary"
          >
            {msg}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !recordedBlob || !copyrightOk}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-lg font-bold text-primary-foreground shadow-elevated transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden>♥</span>
          {busy ? t("loading") : t("submit")}
        </button>
        {!recordedBlob && (
          <p className="text-center text-sm text-muted-foreground">
            {t("enableSubmitHint")}
          </p>
        )}

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

  const { data: donorScore = 0 } = useQuery({
    queryKey: ["donor-score", user?.id, data.length],
    enabled: !!user,
    queryFn: async () => {
      const { data: score, error } = await supabase.rpc("get_donor_score", { _user_id: user!.id });
      if (error) throw error;
      return (score as number) ?? 0;
    },
  });

  const reportsTotal = data.reduce((s, d) => s + (d.report_count ?? 0), 0);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="my-donations" className="text-2xl font-bold">{t("yourDonations")}</h2>
        {user && (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2 text-sm">
            <span className="font-semibold">Voice Donor Score</span>
            <span aria-label={`${donorScore} of 5 stars`} className="text-base text-amber-500">
              {"★".repeat(donorScore)}{"☆".repeat(5 - donorScore)}
            </span>
            <span className="text-muted-foreground">· {data.length} uploaded · {reportsTotal} reports</span>
          </div>
        )}
      </div>
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
