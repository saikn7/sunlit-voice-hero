import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelSpeech,
  getSpeechRecognition,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  speak,
} from "@/lib/speech";
import { formatDate, loadNotes, newNote, saveNotes, type Note } from "@/lib/notes";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sunlit Voice — Voice-first companion" },
      { name: "description", content: "Dictate notes, hear them read back, ask the time and date, and navigate by voice or keyboard. Designed for blind and low-vision users." },
      { property: "og:title", content: "Sunlit Voice" },
      { property: "og:description", content: "Voice-first, screen-reader-friendly companion." },
    ],
  }),
  component: Index,
});

type Mode = "idle" | "listening" | "speaking" | "processing";

const HELP_TEXT =
  "Welcome to Sunlit Voice. Press the space bar or the big sun button to start listening. " +
  "You can say: take a note followed by what you want to write. " +
  "Read my notes, to hear every note. " +
  "Read the last note. Delete the last note. Clear all notes. " +
  "What time is it. What is today's date. Or say help to hear this again.";

function Index() {
  const [mode, setMode] = useState<Mode>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [status, setStatus] = useState("Press space or the sun button to talk.");
  const [supported, setSupported] = useState({ sr: true, tts: true });
  const recognitionRef = useRef<any>(null);
  const finalRef = useRef<string>("");

  // Load notes once mounted (client-only).
  useEffect(() => {
    setNotes(loadNotes());
    setSupported({
      sr: isSpeechRecognitionSupported(),
      tts: isSpeechSynthesisSupported(),
    });
  }, []);

  const announce = useCallback(
    (text: string, also?: { skipSpeak?: boolean }) => {
      setStatus(text);
      if (!also?.skipSpeak && isSpeechSynthesisSupported()) {
        setMode("speaking");
        speak(text, { onEnd: () => setMode("idle") });
      }
    },
    [],
  );

  const persist = useCallback((next: Note[]) => {
    setNotes(next);
    saveNotes(next);
  }, []);

  const handleCommand = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) {
        announce("I didn't catch that. Try again.");
        return;
      }
      const lower = text.toLowerCase();

      // "take a note ..." / "new note ..." / "note ..."
      const noteMatch =
        lower.match(/^(?:take a note|new note|note that|note|remember|save)\b[:,]?\s*(.*)$/i);
      if (noteMatch) {
        const body = noteMatch[1]?.trim();
        if (!body) {
          announce("What would you like the note to say?");
          return;
        }
        const n = newNote(body);
        persist([n, ...loadNotes()]);
        announce(`Note saved. ${body}`);
        return;
      }

      if (/^(read|play)\b.*(all|my)?\s*notes?$/i.test(lower) || lower === "read notes") {
        const all = loadNotes();
        if (all.length === 0) {
          announce("You have no notes yet.");
          return;
        }
        const body = all
          .map((n, i) => `Note ${i + 1}, from ${formatDate(n.createdAt)}. ${n.text}.`)
          .join(" ");
        announce(`You have ${all.length} ${all.length === 1 ? "note" : "notes"}. ${body}`);
        return;
      }

      if (/^(read|play)\b.*(last|latest|most recent)\s*notes?$/i.test(lower)) {
        const all = loadNotes();
        if (all.length === 0) {
          announce("You have no notes yet.");
          return;
        }
        const n = all[0];
        announce(`Last note, from ${formatDate(n.createdAt)}. ${n.text}.`);
        return;
      }

      if (/^delete\b.*(last|latest|most recent)\s*notes?$/i.test(lower)) {
        const all = loadNotes();
        if (all.length === 0) {
          announce("There are no notes to delete.");
          return;
        }
        const [removed, ...rest] = all;
        persist(rest);
        announce(`Deleted the last note. It said: ${removed.text}.`);
        return;
      }

      if (/^(clear|delete)\s+(all\s+)?notes?$/i.test(lower)) {
        persist([]);
        announce("All notes cleared.");
        return;
      }

      if (/(what(?:'s| is)?\s+the\s+time|what time is it|current time)/i.test(lower)) {
        const now = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
        announce(`The time is ${now}.`);
        return;
      }

      if (/(what(?:'s| is)?\s+(today'?s\s+)?date|what day is it)/i.test(lower)) {
        const d = new Date().toLocaleDateString(undefined, {
          weekday: "long", month: "long", day: "numeric", year: "numeric",
        });
        announce(`Today is ${d}.`);
        return;
      }

      if (/^(help|what can (you|i) (say|do)|commands?)$/i.test(lower)) {
        announce(HELP_TEXT);
        return;
      }

      if (/^(stop|silence|quiet|cancel)$/i.test(lower)) {
        cancelSpeech();
        setMode("idle");
        setStatus("Stopped.");
        return;
      }

      // Default: treat as a note.
      const n = newNote(text);
      persist([n, ...loadNotes()]);
      announce(`Saved as a note. ${text}`);
    },
    [announce, persist],
  );

  const stopListening = useCallback(() => {
    const r = recognitionRef.current;
    if (r) {
      try { r.stop(); } catch { /* noop */ }
    }
  }, []);

  const startListening = useCallback(() => {
    if (mode === "speaking") cancelSpeech();
    if (!isSpeechRecognitionSupported()) {
      announce(
        "Voice input isn't supported in this browser. Try Chrome, Edge, or Safari, or use the keyboard input below.",
      );
      return;
    }
    if (mode === "listening") {
      stopListening();
      return;
    }

    const SR = getSpeechRecognition();
    const r = new SR();
    r.lang = navigator.language || "en-US";
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;
    finalRef.current = "";
    setTranscript("");
    setInterim("");

    r.onstart = () => {
      setMode("listening");
      setStatus("Listening… speak now.");
    };
    r.onresult = (e: any) => {
      let final = "";
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript;
        else partial += res[0].transcript;
      }
      if (final) finalRef.current += final;
      setTranscript(finalRef.current);
      setInterim(partial);
    };
    r.onerror = (e: any) => {
      setMode("idle");
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        announce("Microphone permission denied. Please enable it in your browser settings.");
      } else if (e.error === "no-speech") {
        announce("I didn't hear anything. Try again.");
      } else if (e.error === "aborted") {
        setStatus("Stopped.");
      } else {
        announce(`Voice input error: ${e.error}.`);
      }
    };
    r.onend = () => {
      setMode("processing");
      const result = (finalRef.current || "").trim();
      setInterim("");
      if (result) {
        handleCommand(result);
      } else {
        setMode("idle");
        setStatus("Press space or the sun button to talk.");
      }
    };

    recognitionRef.current = r;
    try {
      r.start();
    } catch {
      setMode("idle");
    }
  }, [mode, announce, stopListening, handleCommand]);

  // Spacebar shortcut (but not while typing in inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isFormField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isFormField) return;
      if (e.code === "Space") {
        e.preventDefault();
        startListening();
      } else if (e.key === "Escape") {
        cancelSpeech();
        stopListening();
        setMode("idle");
        setStatus("Stopped.");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startListening, stopListening]);

  // Welcome message on first paint (only if TTS supported).
  useEffect(() => {
    const t = setTimeout(() => {
      if (isSpeechSynthesisSupported()) {
        speak(
          "Sunlit Voice is ready. Press the space bar to talk, or say help to hear what you can do.",
          { onEnd: () => setMode("idle") },
        );
        setMode("speaking");
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buttonLabel = useMemo(() => {
    if (mode === "listening") return "Listening. Tap or press space to stop.";
    if (mode === "speaking") return "Speaking. Tap to interrupt.";
    if (mode === "processing") return "Processing…";
    return "Tap or press space to talk.";
  }, [mode]);

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <div className="min-h-dvh px-5 pb-24 pt-8 sm:px-8">
        <header className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full sun-orb" aria-hidden="true" />
            <p className="text-xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              Sunlit Voice
            </p>
          </div>
          <span className="text-sm text-muted-foreground" aria-hidden="true">
            Press <kbd className="rounded bg-secondary px-2 py-1 font-mono text-xs">Space</kbd> to talk
          </span>
        </header>

        <main id="main" className="mx-auto mt-12 max-w-3xl">
          <h1 className="text-balance text-center text-4xl font-bold leading-tight sm:text-5xl">
            Your voice-first companion.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-balance text-center text-lg text-muted-foreground">
            Dictate notes, hear them read back, and navigate by voice or keyboard. No sign-in. Works offline.
          </p>

          {/* Big talk button */}
          <div className="mt-12 flex flex-col items-center gap-6">
            <button
              type="button"
              onClick={startListening}
              aria-label={buttonLabel}
              aria-pressed={mode === "listening"}
              className={`relative grid size-48 place-items-center rounded-full sun-orb text-primary-foreground transition-transform active:scale-95 sm:size-56 ${
                mode === "listening" ? "pulse-ring" : ""
              }`}
            >
              <span className="sr-only">{buttonLabel}</span>
              <MicIcon className="size-20 sm:size-24" />
            </button>

            <p
              aria-live="polite"
              aria-atomic="true"
              className="min-h-[3rem] max-w-xl text-balance text-center text-xl font-medium"
            >
              {status}
            </p>

            {(transcript || interim) && (
              <p className="max-w-xl rounded-2xl border border-border bg-card px-5 py-3 text-center text-lg">
                <span>{transcript}</span>
                <span className="text-muted-foreground italic"> {interim}</span>
              </p>
            )}
          </div>

          {/* Quick actions */}
          <section className="mt-14" aria-labelledby="quick-actions-h">
            <h2 id="quick-actions-h" className="mb-4 text-2xl font-semibold">Quick actions</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <ActionButton onClick={() => handleCommand("read my notes")}>
                Read all my notes
              </ActionButton>
              <ActionButton onClick={() => handleCommand("read the last note")}>
                Read the last note
              </ActionButton>
              <ActionButton onClick={() => handleCommand("what time is it")}>
                Tell me the time
              </ActionButton>
              <ActionButton onClick={() => handleCommand("what is today's date")}>
                Today's date
              </ActionButton>
              <ActionButton onClick={() => handleCommand("help")}>
                Help — what can I say?
              </ActionButton>
              <ActionButton
                variant="danger"
                onClick={() => {
                  if (loadNotes().length === 0) {
                    announce("There are no notes to clear.");
                    return;
                  }
                  if (typeof window !== "undefined" && !window.confirm("Clear all notes?")) return;
                  handleCommand("clear all notes");
                }}
              >
                Clear all notes
              </ActionButton>
            </div>
          </section>

          {/* Type instead */}
          <section className="mt-14" aria-labelledby="type-h">
            <h2 id="type-h" className="mb-4 text-2xl font-semibold">Or type a command</h2>
            <TypeBox onSubmit={handleCommand} />
          </section>

          {/* Notes */}
          <section className="mt-14" aria-labelledby="notes-h">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h2 id="notes-h" className="text-2xl font-semibold">
                Your notes <span className="text-muted-foreground text-base">({notes.length})</span>
              </h2>
            </div>
            {notes.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-card/50 px-5 py-8 text-center text-muted-foreground">
                No notes yet. Say <em>"Take a note: buy oranges"</em> to add one.
              </p>
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-elevated)]"
                  >
                    <p className="text-lg leading-relaxed">{n.text}</p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <time className="text-sm text-muted-foreground" dateTime={new Date(n.createdAt).toISOString()}>
                        {formatDate(n.createdAt)}
                      </time>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setMode("speaking");
                            speak(n.text, { onEnd: () => setMode("idle") });
                            setStatus("Reading note…");
                          }}
                          className="rounded-lg bg-primary px-4 py-2 text-base font-semibold text-primary-foreground"
                        >
                          Read aloud
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const rest = loadNotes().filter((m) => m.id !== n.id);
                            persist(rest);
                            announce("Note deleted.");
                          }}
                          className="rounded-lg border border-border bg-secondary px-4 py-2 text-base font-semibold"
                          aria-label={`Delete note: ${n.text.slice(0, 60)}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Support banners */}
          {(!supported.sr || !supported.tts) && (
            <aside
              role="note"
              className="mt-14 rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-base"
            >
              <p className="font-semibold">Heads up:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {!supported.sr && (
                  <li>Voice input isn't supported here. Use Chrome, Edge, or Safari, or type below.</li>
                )}
                {!supported.tts && (
                  <li>Read-aloud isn't available in this browser.</li>
                )}
              </ul>
            </aside>
          )}

          <footer className="mt-16 text-center text-sm text-muted-foreground">
            <p>
              Tip: press <kbd className="rounded bg-secondary px-2 py-0.5 font-mono">Space</kbd> to talk,{" "}
              <kbd className="rounded bg-secondary px-2 py-0.5 font-mono">Esc</kbd> to stop.
            </p>
          </footer>
        </main>
      </div>
    </>
  );
}

function ActionButton({
  children,
  onClick,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border border-border px-5 py-5 text-left text-lg font-semibold transition-colors ${
        variant === "danger"
          ? "bg-destructive/15 text-destructive-foreground hover:bg-destructive/25"
          : "bg-card hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function TypeBox({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        if (!v) return;
        onSubmit(v);
        setValue("");
      }}
      className="flex flex-col gap-3 sm:flex-row"
    >
      <label htmlFor="cmd" className="sr-only">Command or note</label>
      <input
        id="cmd"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder='e.g. "take a note: water the plants"'
        className="flex-1 rounded-xl border border-border bg-card px-5 py-4 text-lg placeholder:text-muted-foreground"
        autoComplete="off"
      />
      <button
        type="submit"
        className="rounded-xl bg-primary px-6 py-4 text-lg font-semibold text-primary-foreground"
      >
        Submit
      </button>
    </form>
  );
}

function MicIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
    </svg>
  );
}
