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

const CATEGORIES: { id: string; key: TKey }[] = [
  { id: "all", key: "catAll" },
  { id: "motivation", key: "catMotivation" },
  { id: "education", key: "catEducation" },
  { id: "stories", key: "catStories" },
  { id: "news", key: "catNews" },
  { id: "prayers", key: "catPrayers" },
];

function BrowsePage() {
  const { user } = useAuth();
  const { t } = usePrefs();
  const [query, setQuery] = React.useState("");
  const [input, setInput] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");
  const [playingId, setPlayingId] = React.useState<string | null>(null);
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

  const filtered = React.useMemo(() => {
    let list = donations;
    if (category !== "all") {
      list = list.filter((d) =>
        (d.keywords ?? []).some((k) => k.toLowerCase().includes(category)),
      );
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

  const playDonation = React.useCallback(async (d: Donation) => {
    const url = await resolveUrl(d);
    if (!url || !audioRef.current) return;
    cancelSpeech();
    audioRef.current.pause();
    audioRef.current.src = url;
    audioRef.current.play().catch(() => {});
    setPlayingId(d.id);
  }, [resolveUrl]);

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

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Categories">
        {CATEGORIES.map((c) => {
          const on = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setCategory(c.id)}
              className={`rounded-full border px-5 py-2 text-base font-semibold transition ${
                on ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:bg-secondary"
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
          <audio ref={audioRef} controls className="w-full" onEnded={() => setPlayingId(null)} />

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
            {filtered.map((d) => (
              <li key={d.id} className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:shadow-elevated">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-xl text-primary">🎤</span>
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
                  onClick={() => playDonation(d)}
                  className={`mt-auto inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-base font-bold transition ${
                    playingId === d.id ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground hover:opacity-95"
                  }`}
                >
                  <span aria-hidden>{playingId === d.id ? "❚❚" : "▶"}</span>
                  {playingId === d.id ? t("pause") : t("play")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
