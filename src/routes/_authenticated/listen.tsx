import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePrefs } from "@/lib/prefs-context";
import { createRecognizer, speak, cancelSpeech, isSpeechRecognitionSupported } from "@/lib/speech";
import { fuzzySearch } from "@/lib/fuzzy";
import type { Tables } from "@/integrations/supabase/types";

type Donation = Tables<"donations">;

export const Route = createFileRoute("/_authenticated/listen")({
  component: ListenPage,
  head: () => ({
    meta: [
      { title: "Listening Mode — SunlitVoice" },
      { name: "description", content: "Voice-controlled assistant to search and play donated voice messages." },
    ],
  }),
});

type Transcript = { id: number; role: "you" | "assistant"; text: string };

function ListenPage() {
  const { t, lang } = usePrefs();
  const navigate = useNavigate();
  const [listening, setListening] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [transcripts, setTranscripts] = React.useState<Transcript[]>([]);
  const [playingId, setPlayingId] = React.useState<string | null>(null);
  const [signedUrls, setSignedUrls] = React.useState<Record<string, string>>({});
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const recognizerRef = React.useRef<any>(null);

  const { data: donations = [], isLoading } = useQuery({
    queryKey: ["donations", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("donations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Donation[];
    },
  });

  const filtered = React.useMemo(
    () => (query.trim() ? fuzzySearch(donations, query) : donations),
    [donations, query],
  );

  // Auto-clear transient transcript messages after 6s.
  React.useEffect(() => {
    if (transcripts.length === 0) return;
    const timer = setTimeout(() => {
      setTranscripts((prev) => prev.slice(Math.max(0, prev.length - 6)));
    }, 6000);
    return () => clearTimeout(timer);
  }, [transcripts]);

  const pushMsg = React.useCallback((role: Transcript["role"], text: string) => {
    setTranscripts((prev) => [...prev.slice(-5), { id: Date.now() + Math.random(), role, text }]);
  }, []);

  const respond = React.useCallback((text: string) => {
    pushMsg("assistant", text);
    speak(text, { lang });
  }, [pushMsg, lang]);

  const resolveUrl = React.useCallback(async (d: Donation): Promise<string | null> => {
    if (signedUrls[d.id]) return signedUrls[d.id];
    const { data, error } = await supabase.storage
      .from("voice-donations")
      .createSignedUrl(d.audio_path, 3600);
    if (error || !data) return null;
    setSignedUrls((prev) => ({ ...prev, [d.id]: data.signedUrl }));
    return data.signedUrl;
  }, [signedUrls]);

  const playDonation = React.useCallback(async (d: Donation) => {
    const url = await resolveUrl(d);
    if (!url) {
      respond(t("error"));
      return;
    }
    cancelSpeech();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = url;
      audioRef.current.play().catch(() => {});
      setPlayingId(d.id);
    }
  }, [resolveUrl, respond, t]);

  const handleCommand = React.useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    pushMsg("you", text);
    const low = text.toLowerCase();

    // Stop / cancel
    if (/(^|\s)(stop|cancel|quiet|silent)\b|ရပ်/.test(low)) {
      cancelSpeech();
      if (audioRef.current) audioRef.current.pause();
      respond(lang === "my" ? "ရပ်လိုက်ပါပြီ။" : "Stopped.");
      return;
    }
    // Help
    if (/\bhelp\b|အကူအညီ/.test(low)) {
      respond(t("listeningHint"));
      return;
    }
    // Navigation intents (EN + MY)
    const nav: { re: RegExp; to: "/" | "/donate" | "/contact" | "/listen"; en: string; my: string }[] = [
      { re: /\b(go )?home\b|ပင်မ|အိမ်/, to: "/", en: "Going home.", my: "ပင်မသို့ သွားနေသည်။" },
      { re: /\bdonate\b|လှူ/, to: "/donate", en: "Opening donate.", my: "လှူဒါန်းမှု စာမျက်နှာသို့ သွားနေသည်။" },
      { re: /\bcontact\b|ဆက်သွယ်/, to: "/contact", en: "Opening contact.", my: "ဆက်သွယ်ရန် စာမျက်နှာ ဖွင့်နေသည်။" },
      { re: /\b(profile|dashboard|listen)\b|ပရိုဖိုင်/, to: "/listen", en: "Opening your library.", my: "သင်၏ စာရင်း ဖွင့်နေသည်။" },
    ];
    for (const n of nav) {
      if (n.re.test(low)) {
        respond(lang === "my" ? n.my : n.en);
        navigate({ to: n.to });
        return;
      }
    }

    // Search / play patterns
    const playMatch = low.match(/^(?:play|listen to|ဖွင့်)\s+(.*)$/);
    const searchMatch = low.match(/^(?:search(?: for)?|find|look up|ရှာ)\s+(.*)$/);
    let term = "";
    let intent: "play" | "search" = "search";
    if (playMatch) { term = playMatch[1]; intent = "play"; }
    else if (searchMatch) { term = searchMatch[1]; intent = "search"; }
    else { term = text; }

    if (/^(latest|newest|first|the first|ပထမ|နောက်ဆုံး)$/.test(term)) {
      const first = filtered[0] ?? donations[0];
      if (first) {
        respond(`${t("play")}: ${first.title}`);
        await playDonation(first);
      } else {
        respond(t("noResults"));
      }
      return;
    }

    setQuery(term);
    const results = fuzzySearch(donations, term);
    if (results.length === 0) {
      respond(t("noResults"));
      return;
    }
    if (intent === "play") {
      respond(`${t("play")}: ${results[0].title}`);
      await playDonation(results[0]);
    } else {
      const top = results.slice(0, 3).map((r) => r.title).join(", ");
      respond(
        lang === "my"
          ? `${results.length} ခု တွေ့ပါသည်: ${top}`
          : `Found ${results.length}: ${top}`,
      );
    }
  }, [donations, filtered, lang, navigate, playDonation, pushMsg, respond, t]);

  const startListening = React.useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      respond(lang === "my" ? "သင့်ဘရောက်ဆာ၌ အသံမှတ်တမ်း မရှိပါ။" : "Voice input not available in this browser. Type in the search box instead.");
      return;
    }
    const r = createRecognizer(lang);
    if (!r) return;
    recognizerRef.current = r;
    r.onresult = (e: any) => {
      const txt = e.results?.[0]?.[0]?.transcript ?? "";
      handleCommand(txt);
    };
    r.onerror = (ev: any) => {
      setListening(false);
      const code = ev?.error;
      const isQuota = /429|quota|rate/i.test(ev?.message ?? "");
      if (code === "not-allowed") {
        respond(lang === "my" ? "မိုက်ခရိုဖုန်း ခွင့်ပြုချက် မရှိပါ။" : "Microphone permission was denied.");
      } else if (code === "no-speech") {
        respond(lang === "my" ? "အသံ မကြားရပါ — ထပ်ပြောကြည့်ပါ။" : "I didn't catch that — please try again.");
      } else if (isQuota) {
        respond(lang === "my" ? "အသံ မှတ်တမ်း ကန့်သတ်ချက် ပြည့်သွားပါပြီ။ ခဏနေပြီး ပြန်ကြိုးစားပါ။" : "Voice service is rate-limited right now. Please try again in a moment.");
      } else {
        respond(lang === "my" ? "အသံ မှတ်တမ်း မအောင်မြင်ပါ။" : "Voice recognition failed. Please try again.");
      }
    };
    r.onend = () => setListening(false);
    try {
      r.start();
      setListening(true);
      respond(t("assistantReady"));
    } catch {
      setListening(false);
    }
  }, [handleCommand, lang, respond, t]);

  const stopListening = React.useCallback(() => {
    try { recognizerRef.current?.stop(); } catch {}
    cancelSpeech();
    setListening(false);
  }, []);

  React.useEffect(() => () => {
    try { recognizerRef.current?.abort(); } catch {}
    cancelSpeech();
  }, []);

  // Global Space toggles listening; Escape always stops. Ignore when typing in form fields.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const isField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement | null)?.isContentEditable;
      if (e.code === "Space" && !isField) {
        e.preventDefault();
        if (listening) stopListening(); else startListening();
      } else if (e.key === "Escape") {
        if (listening) stopListening();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listening, startListening, stopListening]);

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold">{t("listeningMode")}</h1>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={listening ? stopListening : startListening}
          className={`flex items-center gap-3 rounded-full px-6 py-4 text-lg font-bold shadow-elevated transition ${
            listening ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
          } relative`}
          aria-pressed={listening}
        >
          <span aria-hidden className={`inline-block h-3 w-3 rounded-full ${listening ? "bg-white animate-pulse" : "bg-primary-foreground"}`} />
          {listening ? t("stopListening") : t("startListening")}
        </button>
        <p className="text-base text-muted-foreground" aria-live="polite">
          {listening ? t("listeningHint") : t("assistantReady")}
        </p>
        {listening && (
          <p className="text-sm text-primary animate-pulse" aria-live="polite">
            {t("keepTalking")}
          </p>
        )}
      </div>

      <label className="grid gap-2">
        <span className="text-base font-semibold">{t("searchPlaceholder")}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="rounded-lg border border-border bg-input px-4 py-3 text-lg"
        />
      </label>

      <div aria-live="polite" className="min-h-16 space-y-1.5">
        {transcripts.map((m) => (
          <p key={m.id} className="rounded-md bg-secondary/60 px-3 py-1.5 text-base">
            <span className="font-semibold">{m.role === "you" ? t("you") : t("assistant")}:</span>{" "}
            {m.text}
          </p>
        ))}
      </div>

      <audio ref={audioRef} controls className="w-full" onEnded={() => setPlayingId(null)} />

      <section aria-labelledby="results-heading" className="grid gap-3">
        <h2 id="results-heading" className="text-2xl font-bold">{t("allDonations")} ({filtered.length})</h2>
        {isLoading && <p>{t("loading")}</p>}
        {!isLoading && filtered.length === 0 && <p className="text-muted-foreground">{t("noResults")}</p>}
        <ul className="grid gap-2">
          {filtered.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{d.title || t("untitled")}</p>
                {d.description && <p className="truncate text-sm text-muted-foreground">{d.description}</p>}
                {d.keywords?.length > 0 && (
                  <p className="truncate text-sm text-muted-foreground">#{d.keywords.join(" #")}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => playDonation(d)}
                className="rounded-md bg-primary px-4 py-2 text-base font-semibold text-primary-foreground"
              >
                ▶ {t("play")}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
