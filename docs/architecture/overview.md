# CourseMates architecture overview

Companion to `docs/operations.md` (runbook) and `docs/api.md` (contract).
Read this before restructuring anything; the invariants at the top are load
bearing.

## Module map

```text
server.ts                  Express bootstrap, env loading, security middleware,
                           /api/auth/anonymous + legacy 410s, /api/music/*,
                           /api/ai/*, static/Vite serving, HTTP timeouts.
runtime.ts                 attachRuntime(app, server, opts): sessions, queue,
                           rooms, matching, all /api/auth|match|chat|uno|safety|
                           admin|health routes, /ws/chat server, 5 s cleanup
                           timer, drain/shutdown sequence.
safety.ts                  SafetyStore: reports, blocks, bans, HMAC actor ids,
                           moderation.json atomic persistence.
moderationDb.ts            SQLite review store: excerpts, auto-triage flags,
                           image-hash denylist, admin audit trail.
autoModeration.ts          Deterministic report triage (score 0–100, no I/O).
serverSecurity.ts          WindowLimiter, constantTimeEqual, metrics counters,
                           production config gate, origin/rate-limit middleware.
chatImages.ts              Server-side photo validation (magic bytes, caps).
voiceMessages.ts           Server-side voice validation.
<game>.ts                  One authoritative module per game (ticTacToe, rps,
                           connectFour, chess, trivia, wouldYouRather,
                           drawGuess, uno). Mounted from runtime.ts.
pythonOrchestrator.ts      Fire-and-forget shadow client (never authoritative).
src/                       React/Vite frontend (Access → Matchmaking → Chat).
services/python-orchestrator/  Optional FastAPI shadow service (contract v1).
native/                    Optional C++17 module, reached only via native_bridge.py.
```

`src/data/` is shared by browser and server: limits and validators live there
exactly once (`chatImages.ts`, `chatVoice.ts`, `chatMedia.ts`, `reactions.ts`,
`musicSnippet.ts`, drawing types/palette).

## Request flows

### Anonymous sign-in

`POST /api/auth/anonymous` (`server.ts`) → validate `acceptedTerms` → verify
or mint a signed `cm_device` id → HMAC actor via `safety.actor(deviceId)` →
reject banned actors/IPs (`403`) → `issueSession` (8 h, in `runtime.ts` maps)
→ set `cm_session` + `cm_device` HttpOnly cookies.

### Match → chat

`POST /api/match/join` or WS `join_queue` → `join()` scores queued peers by
shared interest words (+100 exact match, earliest wins ties; `allowNormal`
fallback) → on match, creates a `Room` with both peers, bumps nothing yet,
and notifies both sockets with `matched`. Unmatched callers stay queued with a
`lastSeen` timestamp. `GET /api/match/poll` refreshes liveness and reports
position. Silence > 30 s drops queue entries (5 s sweep).

### Send a message

`POST /api/chat/send` (7 MB JSON) or WS `send_message` (text only) →
`requireRoom` membership check → media validation (magic bytes, canonical
base64, caps, 90 s lock) → `moderateText` filter → append (cap 500/room,
eviction frees media) → `room.revision += 1` → `notify` both peers
(`new_message`). Edits, deletes, reactions and typing follow the same
check-mutate-bump-notify shape. Every mutation bumps `revision`, which
polling clients echo back to skip unchanged buffers.

### Games

Per-game route or action → per-session rate limit → `assertRoomGameFree`
(single non-UNO game per room) → game module `act()` (server-authoritative) →
optional `postGameLeaveNotice` on leave → per-viewer `notify` (hidden state
such as UNO hands, Draw & Guess words, unrevealed WYR picks is serialized per
recipient, never broadcast) → REST `GET` snapshot as recovery.

### Report → review

`POST /api/safety/report` → validate category/message/hashes → persist report
to `SafetyStore` → save ≤50-message text-only excerpt to SQLite (best effort)
→ deterministic triage score persisted as an auto-flag; score ≥
`AUTO_MOD_ESCALATE_SCORE` auto-escalates for a human (never bans) →
`GET /api/admin/reports[/:id]` review → `POST /api/admin/moderate` enforces
(restriction, ban, image-hash ban) and evicts live sessions.

### Shutdown

`SIGTERM`/`SIGINT` → `draining = true` (joins/upgrades refused with 503,
`/api/health/ready` reports draining) → `server_restart` + close `1012` on
every socket → tear down rooms, clear queue/sessions/sockets/media → close
HTTP (2 s hard-exit backstop).

## Single-process design

One Node process owns all authority: sessions, queue, rooms, messages, media,
revisions, sockets, game states. There is no shared store, so a second
replica (or a second uvicorn worker, or `WEB_CONCURRENCY > 1`) holds a
separate, invisible queue — this is why production refuses to boot unless
`SINGLE_INSTANCE=true` with exactly one process. The Python orchestrator is
shadow-only (observes matches/icebreakers, responses discarded); the C++
module is reachable only through `native_bridge.py`. Scaling out requires a
shared session/queue store plus coordinated expiry first.

## State classification

| Class                  | What                                                                                                              | Lives in                                                                                                                            | Recovery guarantee                                                                                                                                                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ephemeral              | Sessions, queue, rooms, messages, media, typing, revisions, sockets, game states, chatbot prefs                   | `runtime.ts` memory                                                                                                                 | None by design. Restart or drain clears everything; clients start over at anonymous entry and re-match. REST polling (`GET /api/chat/messages`) recovers from socket loss, never from process loss.                                                                                         |
| Recoverable (degraded) | Music directory additions, chatbot local fallback memory                                                          | Process memory                                                                                                                      | Lost on restart; service continues with built-in catalog and fresh chatbot state. No user action needed.                                                                                                                                                                                    |
| Durable                | Reports, blocks, actor/IP bans, review excerpts (30 d), auto-triage flags, image-hash denylist, admin audit trail | `DATA_DIR/moderation.json` (atomic temp-write + rename) + `DATA_DIR/moderation.db` (SQLite, `CREATE TABLE IF NOT EXISTS` self-init) | Survives restarts. Restore = put both files back and restart. A parse failure logs and starts empty rather than crashing. Failed writes keep the last committed file; fail-closed validation refuses corrupt/oversized/self-target records. Without `DATA_DIR` both stores are memory-only. |

Durable data is moderation-only. Chat text, media, tokens, emails and IPs are
never part of ephemeral snapshots because no such snapshots exist — there is
nothing to back up except the two moderation files.
