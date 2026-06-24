export type Note = {
  id: string;
  text: string;
  createdAt: number;
};

const KEY = "sunlit-voice.notes.v1";

export function loadNotes(): Note[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (n): n is Note =>
        n && typeof n.id === "string" && typeof n.text === "string" && typeof n.createdAt === "number",
    );
  } catch {
    return [];
  }
}

export function saveNotes(notes: Note[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function newNote(text: string): Note {
  return {
    id: (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)),
    text: text.trim(),
    createdAt: Date.now(),
  };
}

export function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return new Date(ts).toString();
  }
}
