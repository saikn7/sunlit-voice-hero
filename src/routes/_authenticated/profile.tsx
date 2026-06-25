import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

type DonorLevel = "None" | "Bronze" | "Silver" | "Gold" | "Platinum";

const LEVEL_THRESHOLDS: { level: DonorLevel; min: number; next: number | null }[] = [
  { level: "Bronze", min: 1, next: 6 },
  { level: "Silver", min: 6, next: 21 },
  { level: "Gold", min: 21, next: 50 },
  { level: "Platinum", min: 50, next: null },
];

function computeLevel(uploads: number): DonorLevel {
  if (uploads >= 50) return "Platinum";
  if (uploads >= 21) return "Gold";
  if (uploads >= 6) return "Silver";
  if (uploads >= 1) return "Bronze";
  return "None";
}

const LEVEL_STYLE: Record<DonorLevel, { ring: string; bg: string; emoji: string; from: string; to: string }> = {
  None: { ring: "ring-border", bg: "bg-muted", emoji: "🎙️", from: "#94a3b8", to: "#475569" },
  Bronze: { ring: "ring-amber-700/40", bg: "bg-amber-700/10", emoji: "🥉", from: "#b45309", to: "#78350f" },
  Silver: { ring: "ring-slate-400/40", bg: "bg-slate-400/10", emoji: "🥈", from: "#94a3b8", to: "#334155" },
  Gold: { ring: "ring-yellow-500/40", bg: "bg-yellow-500/10", emoji: "🥇", from: "#eab308", to: "#a16207" },
  Platinum: { ring: "ring-cyan-400/40", bg: "bg-cyan-400/10", emoji: "👑", from: "#22d3ee", to: "#0e7490" },
};

function ProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;

  const profileQ = useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, user_type, created_at")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const donationsQ = useQuery({
    queryKey: ["my-donations", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("donations")
        .select("id, title, language, created_at, report_count, risk_flag, hidden, duration_seconds")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const scoreQ = useQuery({
    queryKey: ["donor-score", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_donor_score", { _user_id: userId! });
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });

  const avatarSignedQ = useQuery({
    queryKey: ["avatar-url", profileQ.data?.avatar_url],
    enabled: !!profileQ.data?.avatar_url,
    queryFn: async () => {
      const path = profileQ.data!.avatar_url!;
      const { data, error } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  const [uploading, setUploading] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState("");

  React.useEffect(() => {
    if (profileQ.data?.display_name) setNameDraft(profileQ.data.display_name);
  }, [profileQ.data?.display_name]);

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      if (!userId) throw new Error("Not signed in");
      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", userId);
      if (dbErr) throw dbErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", userId] }),
  });

  const saveName = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase.from("profiles").update({ display_name: nameDraft.trim() || null }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["profile", userId] });
    },
  });

  const donations = donationsQ.data ?? [];
  const uploads = donations.length;
  const reportsTotal = donations.reduce((s, d) => s + (d.report_count || 0), 0);
  const level = computeLevel(uploads);
  const score = scoreQ.data ?? 0;
  const next = LEVEL_THRESHOLDS.find((l) => l.level === level)?.next ?? null;
  const progressPct = next ? Math.min(100, Math.round((uploads / next) * 100)) : 100;

  const displayName = profileQ.data?.display_name || user?.email?.split("@")[0] || "Donor";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      {/* Header card */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-elevated">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <label className="group relative cursor-pointer">
            <div className={`grid h-20 w-20 place-items-center overflow-hidden rounded-full ring-4 ${LEVEL_STYLE[level].ring} ${LEVEL_STYLE[level].bg}`}>
              {avatarSignedQ.data ? (
                <img src={avatarSignedQ.data} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-bold">{initials}</span>
              )}
            </div>
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/50 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">
              {uploading ? "…" : "Change"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                try { await uploadAvatar.mutateAsync(f); } finally { setUploading(false); }
              }}
            />
          </label>
          <div className="flex-1">
            {editing ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="rounded-md border border-border bg-input px-2 py-1 text-base"
                  autoFocus
                />
                <button onClick={() => saveName.mutate()} className="rounded-md bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground">Save</button>
                <button onClick={() => setEditing(false)} className="rounded-md border border-border px-3 py-1 text-sm">Cancel</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{displayName}</h1>
                <button onClick={() => setEditing(true)} className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-secondary">Edit</button>
              </div>
            )}
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-secondary px-2 py-0.5">{profileQ.data?.user_type === "donor" ? "Voice Donor" : "Listener"}</span>
              <span>Joined {profileQ.data?.created_at ? new Date(profileQ.data.created_at).toLocaleDateString() : "—"}</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Uploads" value={uploads} />
          <Stat label="Reports" value={reportsTotal} />
          <Stat label="Donor Score" value={`${"⭐".repeat(score)}${score === 0 ? "—" : ""}`} sub={`${score}/5`} />
          <Stat label="Level" value={`${LEVEL_STYLE[level].emoji} ${level}`} />
        </div>

        {/* Progress to next level */}
        {next && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Progress to next level</span>
              <span>{uploads} / {next} uploads</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}
      </section>

      {/* Certificate */}
      <Certificate name={displayName} level={level} uploads={uploads} score={score} />

      {/* Contributions list */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-elevated">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">My Contributions</h2>
          <Link to="/donate" className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-95">+ New donation</Link>
        </div>
        {donationsQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : donations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No donations yet. Donate your first audio to earn your Bronze certificate.</p>
        ) : (
          <ul className="divide-y divide-border">
            {donations.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{d.title || "Untitled"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(d.created_at).toLocaleDateString()} · {d.language?.toUpperCase()}{d.duration_seconds ? ` · ${Math.round(d.duration_seconds)}s` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {d.hidden ? (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 font-semibold text-destructive">Hidden</span>
                  ) : d.risk_flag === "under_review" ? (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-600">Under Review</span>
                  ) : (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-600">Normal</span>
                  )}
                  <span className="text-muted-foreground">{d.report_count} report{d.report_count === 1 ? "" : "s"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Certificate({ name, level, uploads, score }: { name: string; level: DonorLevel; uploads: number; score: number }) {
  const ref = React.useRef<SVGSVGElement>(null);
  const earned = level !== "None";
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const style = LEVEL_STYLE[level];

  const downloadPng = async () => {
    const svg = ref.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = url; });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = 1200 * scale;
    canvas.height = 800 * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, 1200, 800);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `SunlitVoice-${level}-Certificate-${name.replace(/\s+/g, "_")}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  };

  const share = async () => {
    const text = `I just earned the ${level} Donor certificate on SunlitVoice with ${uploads} voice donations! 🎙️`;
    try {
      if (navigator.share) await navigator.share({ title: "SunlitVoice Donor Certificate", text });
      else { await navigator.clipboard.writeText(text); alert("Certificate text copied to clipboard."); }
    } catch { /* user cancelled */ }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-elevated">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">🏆 Donor Certificate</h2>
        {earned && (
          <div className="flex gap-2">
            <button onClick={downloadPng} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-95">⬇ Download</button>
            <button onClick={share} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-secondary">↗ Share</button>
          </div>
        )}
      </div>

      {!earned ? (
        <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center">
          <p className="text-3xl">🎙️</p>
          <p className="mt-2 font-semibold">No certificate yet</p>
          <p className="text-sm text-muted-foreground">Donate your first audio to unlock the <span className="font-semibold">🥉 Bronze Donor</span> certificate.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <svg
            ref={ref}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 1200 800"
            className="block h-auto w-full"
            role="img"
            aria-label={`${level} donor certificate for ${name}`}
          >
            <defs>
              <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0b1220" />
                <stop offset="100%" stopColor="#111827" />
              </linearGradient>
              <linearGradient id="medal" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={style.from} />
                <stop offset="100%" stopColor={style.to} />
              </linearGradient>
            </defs>
            <rect width="1200" height="800" fill="url(#bg)" />
            <rect x="30" y="30" width="1140" height="740" fill="none" stroke="url(#medal)" strokeWidth="4" rx="20" />
            <rect x="50" y="50" width="1100" height="700" fill="none" stroke="#1f2937" strokeWidth="1" rx="14" />

            <text x="600" y="130" textAnchor="middle" fontFamily="Georgia, serif" fontSize="28" fill="#cbd5e1" letterSpacing="6">SUNLITVOICE</text>
            <text x="600" y="180" textAnchor="middle" fontFamily="Georgia, serif" fontSize="22" fill="#94a3b8">Certificate of Voice Donation</text>

            <circle cx="600" cy="290" r="60" fill="url(#medal)" />
            <text x="600" y="312" textAnchor="middle" fontSize="56">{style.emoji}</text>

            <text x="600" y="410" textAnchor="middle" fontFamily="Georgia, serif" fontSize="22" fill="#94a3b8">This certificate is proudly awarded to</text>
            <text x="600" y="475" textAnchor="middle" fontFamily="Georgia, serif" fontSize="56" fontWeight="bold" fill="#f8fafc">{name}</text>
            <line x1="350" y1="500" x2="850" y2="500" stroke="#334155" strokeWidth="1" />

            <text x="600" y="555" textAnchor="middle" fontFamily="Georgia, serif" fontSize="24" fill="#cbd5e1">
              as a <tspan fill={style.from} fontWeight="bold">{level} Donor</tspan> for contributing
            </text>
            <text x="600" y="595" textAnchor="middle" fontFamily="Georgia, serif" fontSize="24" fill="#cbd5e1">
              <tspan fontWeight="bold" fill="#f8fafc">{uploads}</tspan> voice {uploads === 1 ? "donation" : "donations"} to the platform.
            </text>

            <text x="120" y="700" fontFamily="Georgia, serif" fontSize="16" fill="#94a3b8">Awarded on</text>
            <text x="120" y="725" fontFamily="Georgia, serif" fontSize="20" fill="#e2e8f0">{date}</text>

            <text x="1080" y="700" textAnchor="end" fontFamily="Georgia, serif" fontSize="16" fill="#94a3b8">Donor Score</text>
            <text x="1080" y="725" textAnchor="end" fontFamily="Georgia, serif" fontSize="20" fill="#e2e8f0">{score} / 5 ⭐</text>

            <text x="600" y="725" textAnchor="middle" fontFamily="Georgia, serif" fontSize="14" fill="#475569" letterSpacing="3">SUNLITVOICE.APP</text>
          </svg>
        </div>
      )}

      {earned && (
        <p className="mt-3 text-xs text-muted-foreground">
          Tiers: 🥉 Bronze (1–5) · 🥈 Silver (6–20) · 🥇 Gold (21–50) · 👑 Platinum (50+). Updated automatically as you donate.
        </p>
      )}
    </section>
  );
}
