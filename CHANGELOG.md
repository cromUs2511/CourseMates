# Changelog

All notable changes to CourseMates are recorded here. Dates are UTC.

## Versioning policy

- `1.0.0` is the current product version in `package.json`. Until the first
  production release, user-visible behavior may change without a major bump;
  every change lands under `Unreleased` first and is assigned a version at
  release time.
- After `1.0.0` ships: SemVer. Breaking REST/WebSocket payload changes bump
  the major version and require contract tests plus a reversible rollout flag
  (see `docs/operations.md` architecture invariants). Fixes bump patch,
  backward-compatible features bump minor.
- Commit prefixes: `feat:`, `fix:`, `style:`, `chore:`, `build(native):`.

## Unreleased

### Added

- Render blueprint and Vercel static config for deployment.
- Pixel avatar studio, matchmaking loading page, and chat UI refresh.
- Labelled Student Chatbot Assistant simulation while waiting for a match
  (`/model` backend switching: auto/gemini/groq/local).
- Per-message reporting (flag one peer message; excerpt centers on it) and
  automatic deterministic moderation triage (score 0–100, auto-escalation at
  `AUTO_MOD_ESCALATE_SCORE`, never auto-bans).
- Reported-chat review with responsive admin dashboard and persistent SQLite
  moderation store (`moderation.db` beside `moderation.json`).
- Attached-photo SHA-256 fingerprints on reports with a bannable image-hash
  denylist (`banImage`/`unbanImage`).
- Reliable chat reconnection (local snapshot + server revalidation with a
  `Reconnecting` indicator) and exactly-once timeline game-leave notices.
- Shared music queue (up to 50 songs) with idle-playback stop.
- Clipboard image paste path for photo attachments.

### Fixed

- Admin dashboard scroll, contrast, and main-app theme consistency.- iOS/Safari music sync errors, UNO hand mis-taps, and silent audio.
- Finished games auto-terminate and free the room game slot.
- Anonymous handle generation and mobile chat header truncation.
- UNO wild colour, chat rejoin flicker, and truncated display names.
- Deterministic chess tests (boards from `chess.board()`, never ASCII parsing).
- Trivia no longer leaks future question text/options to peers before asked.
- Chess draw offers no longer freeze the game: moving implicitly declines them.
- Chess threefold repetition is now detected through the peer layer via a
  server-side position log (per-move FEN reloads wiped engine history).
- Connect Four rematches alternate the opening move (was always red).
- Trivia/Would You Rather invite categories coerce unknown values to safe
  defaults instead of dealing short or odd sets.
- Draw & Guess no longer drops a stroke started at the instant an undo/clear
  lands: in-progress gestures survive canvas version bumps, and stale batches
  rebase onto the fresh version and retry once.
- Chat timeline keeps chronological order across WebSocket/poll races and uses
  Today/Yesterday/date separators; jump-to-latest honors reduced motion.
- Composer hidden tools are no longer keyboard-focusable; game dialogs guard
  `showModal`/`close`; admin status filter uses valid ARIA semantics.
- Privacy policy and feature guide now accurately disclose report review
  excerpts (up to 50 message texts, no media) and the 30-day safety cookie.
- AI assistant prompts compact explicitly-supplied history (12 turns / 12 KB
  cap) to bound provider payload, cost, and retry multiplication.
- Music-snippet sends reuse a stable idempotency key across retries, so a
  timeout no longer posts the snippet twice.
- Poll-driven typing indicators expire after 3 seconds like live ones.
- Reporting or blocking after the peer record is gone returns 404 instead of
  crashing the request.
- Production config rejects a reused admin token and password pair.
- Server logs no longer serialize raw AI provider errors.
- Tic-Tac-Toe, RPS, and trivia seat assignment is deterministic; moves from
  non-participants are rejected with a proper error.
- RPS and Would You Rather rematches are only accepted once the match ends;
  Would You Rather rejects choices outside the two options.
- Connect Four moves carry the same revision CAS check as Tic-Tac-Toe.
- Chess draw results distinguish stalemate, threefold repetition,
  insufficient material, and the fifty-move rule in data and UI.
- Trivia and Would You Rather deal unique prompts (crypto Fisher-Yates, no
  duplicate top-ups).
- Draw & Guess auto-pick grants the full drawing window from the live clock
  and guessing without a selected prompt is rejected cleanly.
- Proxy address and source-map transitive vulnerabilities remediated
  (`npm audit` clean at high severity and above).

### Changed

- README rewritten as a full overview of the app, interface, and features;
  `docs/FEATURES.md` user guide added.
- UNO is now a two-player game inside the current chat (legacy arena
  endpoints return `410` while `CHAT_MULTIPLAYER_V2` is on).
- Python shadow-service internal POST routes accept an optional shared secret
  (`X-CM-Internal-Token`); health stays open.
- CI gates Python, native, and container jobs on the main checks; secret
  scanning (`npm run scan:secrets`) runs in CI.
- Removed unused `motion`, `canvas-confetti`, and `@types/canvas-confetti`
  dependencies; added `npm run bench:local` throughput benchmark.
