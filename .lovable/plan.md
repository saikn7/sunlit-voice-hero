This is a large request. I'll do it as a focused stabilization pass on the existing app — no redesign — broken into reviewable phases. Each phase ends with a working build. Tell me which phases to run, or say "all" and I'll execute them top-to-bottom.

## Phase 1 — Critical bug fixes (auth + has_role + mic toggle)
- **Auth persistence**: audit `auth-context.tsx` + `_authenticated/route.tsx`. Session already uses `localStorage` + `onAuthStateChange`; the real symptom is the `_authenticated` gate sometimes running before hydration. Fix by waiting for `getSession()` before the `redirect()` and removing any duplicate listeners.
- **`has_role` permission denied**: migration to `GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;` and verify it's `SECURITY DEFINER` with `search_path = public` (it is). Re-check `donations` / `reports` policies for recursion.
- **Mic toggle (Space/Escape)**: single `useRef` recognizer, idempotent start/stop, sync UI to recognizer's `onstart`/`onend`, not local optimistic state.

## Phase 2 — Donate page split + Contact page + routes
- New public `/donate` landing that explains + CTAs into `/( _authenticated)/donate` (existing recorder stays). The button on `/` routes to `/donate`.
- New `/contact` route with form (name/email/message, zod-validated) writing to a new `contact_messages` table.
- Migration: `contact_messages` table + RLS (anon INSERT allowed, SELECT admin-only) + grants.
- Header nav audit: Home / Features / Donate / Contact / Dashboard / Profile / Login-Logout — verify every `<Link>` resolves.

## Phase 3 — Voice assistant upgrades
- Command router with intents: help, open profile/dashboard/donate/contact, go home, find {category} audio, play latest. Maps EN + MY phrases via a single dictionary.
- Auto-greeting: speak once per session (sessionStorage flag), language-aware (EN/MY), respects `prefers-reduced-motion` + a "sound off" toggle.
- Assistant toast: single live region, auto-hide after 5s, fade-out, replaces (not stacks).
- TTS provider adapter (`speak(text, lang)`) — browser voice today, pluggable for Google/Azure/ElevenLabs later. STT adapter same shape (browser SR today, room for cloud providers for `my-MM`).

## Phase 4 — Audio format + playback robustness
- Recorder: probe `MediaRecorder.isTypeSupported` in order webm/opus → mp4 → wav and pick the first supported; store `mime_type` accurately (already partially done — tighten error messages).
- Upload accept list: `mp3, wav, m4a, ogg, webm`. Reject others with a friendly message + speak it.
- Donor dashboard list refreshes via `queryClient.invalidateQueries` after upload (already wired — verify).

## Phase 5 — Accessibility polish
- High-contrast toggle: real CSS variable theme (`[data-contrast="high"]`) persisted in `profiles.theme` + `localStorage`, restored on boot before paint.
- Focus-visible rings on every interactive element, `aria-label`s on icon buttons, single `<main>`, large mic button (≥56px), `h-dvh` instead of `h-screen` where applicable.
- Voice Settings panel on `/profile`: voice (browser list), language (EN/MY), rate slider. Persist to `profiles`.

## Phase 6 — Burmese (MY) language
- i18n already has `Lang = "en" | "my"`. Fill in MY strings for nav, donate, contact, assistant prompts, errors.
- Language switcher in header.
- MY greeting + MY command phrases registered in the intent dictionary from Phase 3.

## Phase 7 — Demo mode + final QA
- Settings toggle "Demo mode" → forces greeting on every load, enables a11y mode, faster TTS rate.
- Manual QA checklist run via Playwright against localhost: auth persists across refresh, mic toggle, donate upload round-trip, contact submit, nav links, contrast toggle, MY switch, greeting fires once.

## Out of scope (won't touch)
- Visual redesign, color palette, font stack.
- Replacing Supabase, swapping router, edge functions.
- Real cloud STT/TTS integrations (only the adapter seams).
- Admin moderation UI beyond what already exists.

## Technical notes
- All new tables get `GRANT … TO authenticated` + `service_role`, RLS on, policies scoped to `auth.uid()`. `contact_messages` gets `GRANT INSERT TO anon` so logged-out visitors can write.
- No edits to `src/routeTree.gen.ts` or `src/integrations/supabase/types.ts`.
- New protected routes go under `src/routes/_authenticated/`; `/donate` landing and `/contact` stay public top-level.

Reply with the phase numbers to run (e.g. "1,2,3" or "all").