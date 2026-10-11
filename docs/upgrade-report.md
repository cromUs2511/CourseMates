# CourseMates Ultimate Upgrade — Execution Report

Date: 2026-10-11 (UTC). All claims below are backed by code cited as
`file:line` and by executed gates. Anything not executed is marked
UNVERIFIED.

## 1. Gates (executed, with results)

| Gate                            | Command                                                                                  | Result                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Typecheck                       | `npx tsc --noEmit`                                                                       | clean, exit 0                                                    |
| Lint                            | `npm run lint` (tsc + eslint)                                                            | clean, exit 0                                                    |
| Format                          | `npx prettier --check .`                                                                 | clean, exit 0 (was failing on 14+ files at HEAD; repo formatted) |
| Unit/integration                | `npm test`                                                                               | 212 pass, 0 fail (stable across consecutive runs incl. coverage) |
| Python shadow + native boundary | `.venv` pytest on `services/python-orchestrator/tests` and `native/tests/test_native.py` | 46 passed                                                        |
| Production build                | `npm run build`                                                                          | exit 0 (chunk-size warning only, pre-existing)                   |
| Dependency audit                | `npm audit --audit-level=high`                                                           | 0 vulnerabilities (was 1 critical + 1 high)                      |
| Secret scan                     | `npm run scan:secrets` (also in CI)                                                      | clean, 200 tracked files                                         |

Bench (new `npm run bench:local`, tsx, 25 pairs / 500 msgs, local loopback):
match-join p50 15.95 ms / p95 17.32 ms; send p50 15.84 ms / p95 17.91 ms;
poll p50 16.59 ms / p95 17.43 ms; ~73 msg/s single-process throughput.
Capacity claims beyond this measurement are UNVERIFIED.

E2E (playwright, WebKit engine, production bundle): drawing suite 2/2 green
(WebSocket + REST paths share sketches, private words, undo/clear, guesses,
rounds). Full Chrome/Chromium matrix runs in CI (browsers absent locally).
Real-device checks still UNVERIFIED.

Coverage (`npm run test:coverage`): 212/212 pass; 88.61% stmts / 80.82%
branch / 95.16% funcs — above the 65/55 gates in `.c8rc.json`.

## 2. Defect register (confirmed, fixed, tested)

Severity High:

- H1 Backend crash on report/block after peer record expiry
  (`runtime.ts:1637` unguarded lookup outside try). Fix: null-guarded lookup
  inside try, 404 response. Test: existing safety suites green.
- H2 Music-snippet retry duplicates (`ChatRoom.tsx` fresh UUID per attempt
  defeated server `clientMessageId` dedup in `runtime.ts:608-613`). Fix:
  stable `musicRetryRef` key per snippet payload, cleared on success and on
  disconnect.
- H3 Critical transitive dependency: `proxy-addr` IP-spoofing advisory
  (directly relevant: trust-proxy + IP rate limits/bans). Fixed via
  `npm audit fix`; audit now clean. High `source-map-js` DoS also fixed.
- H4 Would You Rather dealt duplicate prompts (Random pool: 10 slots, 7
  unique — measured). Fix: deduped top-up from full bank + crypto
  Fisher-Yates. New regression test green.

Severity Medium:

- M1 Poll-driven typing indicator never expired (WS path had a 3 s timer).
  Fix: same expiry on poll updates (`ChatRoom.tsx`).
- M2 RPS / Would You Rather rematch accepted mid-match (per-round `result`
  set). Fix: gate on `round-end`. Existing + new tests green.
- M3 Connect Four had no revision CAS (Tic-Tac-Toe had it). Fix: same
  `revision` check; frontend already sends live revision; two stale test
  helpers updated to live revision. New stale-revision test green.
- M4 Unstable player-order comparator in TTT/RPS/trivia
  (`sort((a) => ...)` ignores second element). Fix: deterministic tiebreak.
- M5 Non-player moves crashed with TypeError (`find(...)!`) in TTT/RPS/C4.
  Fix: membership guard returning a proper error. New test green.
- M6 Would You Rather accepted arbitrary choice strings. Fix: A/B
  validation. New test green.
- M7 Chess mislabeled every draw as stalemate. Fix: distinct reasons
  (`threefold-repetition`, `insufficient-material`, `fifty-move-draw`) in
  `peerGames.ts` union, engine, and UI labels.
- M8 Trivia duplicate pool entries + biased `sort(() => Math.random()-0.5)`
  shuffle. Fix: id-deduped top-up + crypto Fisher-Yates (both trivia and
  WYR). New uniqueness tests green (general=8, others=10).
- M9 Draw & Guess auto-pick reused the expired deadline as `now`, shortening
  the drawing window; guess on missing answer used `!` crash. Fix: live
  clock + clean rejection.
- M13 Draw & Guess dropped a stroke started at the instant an undo/clear
  landed (prop-change effect cleared the in-progress gesture; WebSocket E2E
  reproduced it, REST masked it via slower assertions). Fix: active gestures
  survive version bumps; stale batches rebase onto the fresh version and
  retry once. Drawing E2E 2/2 green after the fix.
- M10 `ADMIN_TOKEN == ADMIN_PASSWORD` reuse accepted by production config
  validation. Fix: explicit rejection + test.
- M11 Raw AI provider errors logged (`server.ts` two sites), violating the
  `logEvent` no-payload rule. Fix: redacted messages.
- M12 Unused direct deps (`motion`, `canvas-confetti`) removed after
  verifying zero imports; audit lockfile updated.

Verified pre-existing fixes kept (not reimplemented): snapshot timestamp
ordering (`chatMessages.ts`), day separators (Today/Yesterday/date),
chess position-log threefold + implicit draw decline, C4 rematch
alternation, trivia future-question hiding, trivia/WYR category coercion,
draw canvas-version retry, snapshot revision guards, privacy docs disclosing
report excerpts, CI secret scan + `needs: checks` gating, python token
header, AI history compaction, `bench:local` / `scan:secrets` scripts.

## 3. Suspected but NOT confirmed (no change made)

- S1 Single `leave()` destroys the room for both peers with no rejoin grace;
  WS close preserves it. Inconsistent, but changing lifecycle semantics needs
  product sign-off.
- S2 Music state is last-writer-wins (no CAS except `music/next`).
- S3 IP-only rate limiter saturates per shared IP behind one proxy; full
  bucket fails closed for new IPs.
- S4 Any room poll pins the room in memory (reaper needs both peers silent).
- S5 Idempotency window bounded by the 500-message buffer (evicted ids can
  re-insert on retry).
- S6 `render.yaml` free-plan `DATA_DIR=/tmp` is ephemeral: moderation
  durability lost on restart.
- S7 Nudity pre-screen is client-side/bypassable by design; server
  enforcement is post-hoc hash bans. Documented tradeoff, unchanged.

## 4. Security and privacy findings

- Secrets: tracked-tree scan clean (200 files); only `.env.example`
  (placeholders) tracked; CI dummies are `a…/b…` literals. No rotation
  needed. Admin dashboard over-sends `ipAddress` on non-ban actions and
  exposes raw IPs in list/search — flagged, not changed (admin UX call).
- Retention exceptions to the 30-day claim are now documented in
  `public/privacy.html` and `docs/FEATURES.md`: permanent IP bans,
  never-pruned image-hash denylist, permanent ban audit rows, and 50-message
  report excerpts.
- AuthZ spot-check: admin routes gated, room membership enforced on
  chat/media/report, no `dangerouslySetInnerHTML`, no open redirects, strict
  origin + SameSite cookies + JSON-only writes. Prod WS origin exact-match
  breaks split-port dev (documented dev-only behavior).
- Independent penetration test before public release: still recommended
  (Phase 5 item 20, external dependency).

## 5. Incidents during execution

- A full-suite run failed 3 tests in `phase-coverage.test.ts` while a
  concurrent killed 300 s reporter run still had live children (CPU
  contention). Isolated re-run: 25/25 green; three subsequent full runs:
  211–212/212 green. Verdict: transient contention, not a code defect.
- An orphaned pre-restart `tsx server.ts` dev server (port 3000) and a
  parallel playwright drawing-suite run were observed; both left untouched.
  Do not run e2e/unit concurrently on this box.

## 6. Deployment and migration risks

- `npm audit fix` changed transitive versions (lockfile churn, −99 lines)
  and the earlier removal of two unused direct deps. All gates re-ran green
  after; still, stage before production.
- Single-process ephemeral design unchanged: no multi-instance support
  (`SINGLE_INSTANCE` enforced), no Redis, moderation durability depends on
  persistent `DATA_DIR` (Render free plan uses `/tmp` — data loss on
  restart).
- No migrations needed (no schema change; SQLite store untouched).

## 7. UNVERIFIED / not done

Mobile two-device messaging, reconnect storms, multi-room authorization
fuzzing, AI provider outage/fallback behavior, music licensing review,
accessibility audit beyond coded ARIA roles, tournament/leaderboard and
other P2 product expansions (correctly deferred).

## 8. Recommended next priorities

1. Product decision on leave/rejoin grace (S1) + music CAS (S2).
2. Per-session chat-send throttle (HTTP path currently IP-bucket only).
3. Persistent `DATA_DIR` in hosting config; backup/restore drill.
4. Independent security test before broad release.
5. Real-device messaging + game matrix on staging.
