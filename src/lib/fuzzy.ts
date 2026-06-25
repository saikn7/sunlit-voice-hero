// Lightweight fuzzy matching for voice search.
// Combines normalized substring match + token overlap + Levenshtein on title.

function normalize(s: string): string {
  // NFC keeps Burmese (Myanmar) Unicode intact while collapsing equivalent
  // codepoint sequences so user-typed and stored text compare reliably.
  let out = (s ?? "");
  try { out = out.normalize("NFC"); } catch {}
  return out
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// True when the string contains Myanmar script — used to enable
// substring matching that doesn't rely on spaces between words.
function hasMyanmar(s: string): boolean {
  return /[\u1000-\u109F\uAA60-\uAA7F\uA9E0-\uA9FF]/.test(s);
}

// Common synonym groups so "voice donation" matches "donate voice", etc.
const SYNONYMS: string[][] = [
  ["donate", "donation", "donating", "give", "gift", "contribute"],
  ["voice", "audio", "sound", "recording", "speech"],
  ["listen", "listening", "play", "hear", "playback"],
  ["search", "find", "look", "lookup"],
  ["greeting", "hello", "welcome", "intro"],
];

function expandSynonyms(tokens: string[]): Set<string> {
  const set = new Set<string>(tokens);
  for (const tok of tokens) {
    for (const group of SYNONYMS) {
      if (group.includes(tok)) for (const g of group) set.add(g);
    }
  }
  return set;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

export type Searchable = {
  id: string;
  title: string;
  description?: string | null;
  keywords?: string[] | null;
};

export function fuzzyScore<T extends Searchable>(item: T, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const haystack = normalize(
    [item.title, item.description ?? "", (item.keywords ?? []).join(" ")].join(" "),
  );
  if (!haystack) return 0;

  let score = 0;
  if (haystack.includes(q)) score += 100;

  // Space-stripped match: "lilz" matches "Lil Z music"
  const qJoined = q.replace(/\s+/g, "");
  const hayJoined = haystack.replace(/\s+/g, "");
  const titleJoined = normalize(item.title).replace(/\s+/g, "");
  if (qJoined.length >= 3 && hayJoined.includes(qJoined)) score += 60;
  if (qJoined.length >= 3 && titleJoined.startsWith(qJoined)) score += 25;

  const qTokens = q.split(" ").filter(Boolean);
  const hTokens = new Set(haystack.split(" ").filter(Boolean));
  const expanded = expandSynonyms(qTokens);
  let overlap = 0;
  for (const tok of expanded) if (hTokens.has(tok)) overlap++;
  score += overlap * 20;

  // Per-token substring + prefix match against title tokens (handles partial words)
  const titleTokens = normalize(item.title).split(" ").filter(Boolean);
  for (const tok of qTokens) {
    if (tok.length >= 2 && haystack.includes(tok)) score += 10;
    for (const tt of titleTokens) {
      if (tok.length >= 2 && tt.startsWith(tok)) score += 15;
    }
  }

  // Title edit-distance for very close misspellings
  const title = normalize(item.title);
  if (title && q.length <= 40) {
    const d = levenshtein(title, q);
    const maxLen = Math.max(title.length, q.length);
    const sim = 1 - d / Math.max(1, maxLen);
    if (sim > 0.6) score += Math.round(sim * 30);
  }

  // Burmese / non-space-delimited: do sliding-window substring match
  // against the haystack so a partial Burmese phrase still scores.
  if (hasMyanmar(q) || hasMyanmar(haystack)) {
    const qNoSpace = q.replace(/\s+/g, "");
    const hNoSpace = haystack.replace(/\s+/g, "");
    if (qNoSpace.length >= 2 && hNoSpace.includes(qNoSpace)) score += 80;
    // 2-char shingles for very short partial inputs
    if (qNoSpace.length >= 2) {
      let hits = 0;
      for (let i = 0; i < qNoSpace.length - 1; i++) {
        if (hNoSpace.includes(qNoSpace.slice(i, i + 2))) hits++;
      }
      score += Math.min(hits, 8) * 4;
    }
  }

  return score;
}

export function fuzzySearch<T extends Searchable>(items: T[], query: string): T[] {
  const q = query.trim();
  if (!q) return items;
  const scored = items
    .map((it) => ({ it, score: fuzzyScore(it, q) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((s) => s.it);
}
