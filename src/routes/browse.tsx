import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { usePrefs } from "@/lib/prefs-context";
import { fuzzySearch } from "@/lib/fuzzy";
import { cancelSpeech } from "@/lib/speech";
import type { Tables } from "@/integrations/supabase/types";
import type { TKey } from "@/lib/i18n";

type Donation = Tables<"donations">;

export const Route = createFileRoute("/browse")({
  component: BrowsePage,
  head: () => ({
    meta: [
      { title: "Browse — SunlitVoice" },
      { name: "description", content: "Browse donated voice recordings. Search by title or use voice." },
      { property: "og:title", content: "Browse — SunlitVoice" },
      { property: "og:description", content: "Browse donated voice recordings. Search by title or use voice." },
    ],
  }),
});

const CATEGORIES: { id: string; key: TKey; match: RegExp }[] = [
  { id: "all", key: "catAll", match: /\ball\b|everything|အားလုံး/i },
  { id: "motivation", key: "catMotivation", match: /motivat|inspir|စိတ်ဓာတ်/i },
  { id: "education", key: "catEducation", match: /educat|learn|lesson|study|ပညာ/i },
  { id: "stories", key: "catStories", match: /stor(y|ies)|tale|narrat|ဇာတ်လမ်း/i },
  { id: "news", key: "catNews", match: /news|update|headline|သတင်း/i },
  { id: "entertainment", key: "catEntertainment", match: /entertain|music|song|fun|comedy|ဖျော်ဖြေ/i },
  { id: "prayers", key: "catPrayers", match: /pray|worship|devotion|ဆုတောင်း/i },
  { id: "other", key: "catOther", match: /\bother|misc|uncategor|အခြား/i },
];

const CATEGORY_LABELS: Record<string, string> = {
  all: "All", motivation: "Motivation", education: "Education", stories: "Stories",
  news: "News", entertainment: "Entertainment", prayers: "Prayers", other: "Other",
};

const KNOWN_CAT_KEYWORDS = ["motivation", "education", "stories", "story", "news", "entertainment", "music", "prayer", "prayers", "worship"];

function BrowsePage() {
  const { user } = useAuth();
  const { t } = usePrefs();
  const [query, setQuery] = React.useState("");
  const [input, setInput] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");
  const [playingId, setPlayingId] = React.useState<string | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [signedUrls, setSignedUrls] = React.useState<Record<string, string>>({});
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const { data: donations = [], isLoading } = useQuery({
    queryKey: ["donations", "browse", !!user],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("donations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Donation[];
    },
  });

  // Realtime: refetch donations the moment a new one is inserted anywhere,
  // so the voice index updates without a page refresh.
  const qc = useQueryClient();
  React.useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("donations-voice-index")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "donations" },
        () => qc.invalidateQueries({ queryKey: ["donations"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, qc]);

  const filtered = React.useMemo(() => {
    let list = donations;
    if (category !== "all") {
      const cat = CATEGORIES.find((c) => c.id === category);
      if (category === "other") {
        // "Other" = no recognised category keyword in keywords/title/description
        list = list.filter((d) => {
          const hay = [...(d.keywords ?? []), d.title ?? "", d.description ?? ""]
            .join(" ").toLowerCase();
          return !KNOWN_CAT_KEYWORDS.some((k) => hay.includes(k));
        });
      } else if (cat) {
        list = list.filter((d) => {
          const hay = [...(d.keywords ?? []), d.title ?? "", d.description ?? ""]
            .join(" ");
          return cat.match.test(hay);
        });
      }
    }
    if (query.trim()) list = fuzzySearch(list, query);
    return list;
  }, [donations, query, category]);

  const resolveUrl = React.useCallback(async (d: Donation): Promise<string | null> => {
    if (signedUrls[d.id]) return signedUrls[d.id];
    const { data, error } = await supabase.storage
      .from("voice-donations")
      .createSignedUrl(d.audio_path, 3600);
    if (error || !data) return null;
    setSignedUrls((prev) => ({ ...prev, [d.id]: data.signedUrl }));
    return data.signedUrl;
  }, [signedUrls]);

  const togglePlay = React.useCallback(async (d: Donation) => {
    const audio = audioRef.current;
    if (!audio) return;
    // Same track: toggle pause/play
    if (playingId === d.id) {
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
      return;
    }
    const url = await resolveUrl(d);
    if (!url) return;
    cancelSpeech();
    audio.pause();
    audio.src = url;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    setPlayingId(d.id);
    window.dispatchEvent(new CustomEvent("sv-voice-feedback", {
      detail: { msg: `Playing: ${d.title || "Untitled"}`, silent: true },
    }));
  }, [resolveUrl, playingId]);

  // Announce when new audio is added so voice users know it's indexed
  const prevCountRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    const n = donations.length;
    if (prevCountRef.current !== null && n > prevCountRef.current) {
      window.dispatchEvent(new CustomEvent("sv-voice-feedback", {
        detail: { msg: "Audio added and available for voice commands", silent: false },
      }));
    }
    prevCountRef.current = n;
  }, [donations.length]);

  // Voice command handler: filters, play/pause/stop, "play <title>", "find <title>"
  React.useEffect(() => {
    const announce = (msg: string, silent = false) => {
      window.dispatchEvent(new CustomEvent("sv-voice-feedback", { detail: { msg, silent } }));
    };

    const applyCategory = (id: string) => {
      setCategory(id);
      const label = CATEGORY_LABELS[id] ?? id;
      announce(id === "all" ? "Showing all audio" : `Showing ${label}`, true);
    };

    const onVoice = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string; raw: string }>).detail;
      if (!detail) return;
      const text = detail.text.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
      const audio = audioRef.current;

      // Pause / stop
      if (/\b(pause|stop|halt|quiet|silent|mute)\b/i.test(text) || /ရပ်|ခဏ/.test(detail.raw)) {
        if (audio && !audio.paused) audio.pause();
        announce("Paused", true);
        e.preventDefault();
        return;
      }
      // Resume current
      if (/\b(resume|continue|keep playing|unpause)\b/i.test(text)) {
        if (audio && audio.paused && playingId) audio.play().catch(() => {});
        announce("Resuming", true);
        e.preventDefault();
        return;
      }
      // Plain "play" — toggle current or play first
      if (/^play$/i.test(text)) {
        if (audio && playingId && audio.paused) audio.play().catch(() => {});
        else if (!playingId && filtered[0]) togglePlay(filtered[0]);
        announce("Playing", true);
        e.preventDefault();
        return;
      }

      // Category by bare name or short phrase
      const bareCat = CATEGORIES.find((c) => c.match.test(text));
      if (bareCat && text.split(" ").length <= 3) {
        applyCategory(bareCat.id);
        e.preventDefault();
        return;
      }

      // "play/find/show <term>" — category shortcut or fuzzy title match
      const m = text.match(/^(?:play|listen to|find|search|open|show|filter|category)\s+(.+)$/i);
      if (m) {
        const term = m[1].trim();
        const cat = CATEGORIES.find((c) => c.id !== "all" && c.match.test(term));
        if (cat) {
          applyCategory(cat.id);
          e.preventDefault();
          return;
        }
        const results = fuzzySearch(donations, term);
        if (results[0]) {
          togglePlay(results[0]);
          announce(`Playing ${results[0].title}`, true);
          e.preventDefault();
          return;
        }
        announce("No matching audio found");
        e.preventDefault();
        return;
      }
    };
    window.addEventListener("sv-voice", onVoice as EventListener);
    return () => window.removeEventListener("sv-voice", onVoice as EventListener);
  }, [donations, filtered, playingId, togglePlay]);

  return (
    <div className="grid gap-6 sm:gap-8">
      <header>
        <h1 className="text-3xl sm:text-5xl md:text-6xl break-words" style={{ fontFamily: "var(--font-display)" }}>
          {t("audioLibrary")}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">{t("browseSub")}</p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); setQuery(input); }}
        className="flex flex-wrap gap-3"
        role="search"
      >
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("searchByTitle")}
          aria-label={t("searchByTitle")}
          className="min-w-0 flex-1 rounded-2xl border border-border bg-card px-5 py-3 text-lg shadow-sm"
        />
        <button type="submit" className="rounded-2xl bg-primary px-6 py-3 text-lg font-bold text-primary-foreground shadow-elevated hover:opacity-95">
          {t("searchBtn")}
        </button>
      </form>

      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Categories"
      >
        {CATEGORIES.map((c) => {
          const on = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setCategory(c.id)}
              className={`shrink-0 rounded-full border px-5 py-2 text-base font-semibold transition-all duration-200 active:scale-95 ${
                on
                  ? "border-primary bg-primary/10 text-primary shadow-sm scale-[1.02]"
                  : "border-border bg-card text-foreground hover:bg-secondary"
              }`}
            >
              {t(c.key)}
            </button>
          );
        })}
      </div>

      {!user && (
        <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-xl font-semibold">{t("signInToListen")}</p>
          <p className="mt-2 text-muted-foreground">{t("signInExplain")}</p>
          <Link to="/auth" className="mt-6 inline-block rounded-2xl bg-primary px-6 py-3 text-lg font-bold text-primary-foreground shadow-elevated">
            {t("signInToBrowse")}
          </Link>
        </div>
      )}

      {user && (
        <>
          <audio
            ref={audioRef}
            controls
            className="w-full"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => { setIsPlaying(false); setPlayingId(null); }}
          />

          {isLoading && <p className="text-muted-foreground">{t("loading")}</p>}

          {!isLoading && filtered.length === 0 && (
            <div className="rounded-3xl border border-dashed border-border bg-card/60 p-10 text-center">
              <p className="text-lg font-semibold">{t("noResults")}</p>
              <p className="mt-2 text-muted-foreground">
                {t("tryAnotherOr")}{" "}
                <Link to="/donate" className="text-primary underline">
                  {t("donateYourVoice")}
                </Link>
                .
              </p>
            </div>
          )}

          <ul className="grid gap-4 md:grid-cols-2">
            {filtered.map((d) => {
              const active = playingId === d.id;
              const showPause = active && isPlaying;
              const hovered = hoverId === d.id;
              return (
                <li
                  key={d.id}
                  onMouseEnter={() => setHoverId(d.id)}
                  onMouseLeave={() => setHoverId((id) => (id === d.id ? null : id))}
                  className={`group flex min-w-0 flex-col gap-3 overflow-hidden rounded-3xl border bg-card p-5 shadow-sm transition-all duration-200 ${
                    hovered ? "-translate-y-0.5 border-primary/60 shadow-elevated" : "border-border"
                  } ${active ? "ring-2 ring-primary/50" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <span aria-hidden className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl text-primary transition-colors ${active ? "bg-primary/30" : "bg-primary/15 group-hover:bg-primary/25"}`}>🎤</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-xl" style={{ fontFamily: "var(--font-display)" }}>
                        {d.title || t("untitled")}
                      </h3>
                      {d.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{d.description}</p>
                      )}
                    </div>
                  </div>

                  {d.keywords && d.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {d.keywords.slice(0, 4).map((k) => (
                        <span key={k} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                          #{k}
                        </span>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => togglePlay(d)}
                    aria-pressed={showPause}
                    className={`mt-auto inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-base font-bold transition-all duration-150 active:scale-[0.98] ${
                      showPause
                        ? "bg-accent text-accent-foreground hover:opacity-95"
                        : "bg-primary text-primary-foreground hover:opacity-95 hover:shadow-elevated"
                    }`}
                  >
                    <span aria-hidden>{showPause ? "❚❚" : "▶"}</span>
                    {showPause ? t("pause") : t("play")}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
