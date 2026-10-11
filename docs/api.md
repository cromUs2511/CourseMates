# CourseMates API reference

Source of truth for the HTTP + WebSocket contract. Implementation lives in
`server.ts` (bootstrap, music, AI) and `runtime.ts` (sessions, matching, chat,
games, safety, admin, WebSocket). If code and this doc disagree, the code wins
— fix the doc, not the client.

## Conventions

- Base path: `/api/*`. Every `/api/*` response carries `Cache-Control: no-store`.
- Unknown `/api/*` paths return `404 { "error": "API endpoint not found." }`.
- Error format is always `{ "error": "<human-readable message>" }`. Clients
  should render `error` verbatim; it is already user-facing.
- Auth is the `cm_session` HttpOnly cookie (8-hour session). JSON bodies are
  required to be objects on `/api/*` routes (`requireObjectBody` rejects
  non-objects with `400`).
- Non-media JSON bodies are limited to 64 KB; `POST /api/chat/send` allows
  7 MB (media travels as base64 in JSON, never over the socket).
- Rate-limited responses return `429` with `Retry-After: 60`. Buckets (per IP
  per minute): auth 30, AI 30, search 30, other API 1200. Game actions have
  per-session limits (see Games). WebSocket: 120 upgrades/min per remote
  address, 240 messages/min per session.
- Common status codes: `400` validation/filter failure, `401` missing or
  expired session, `403` forbidden (anonymous disabled, banned), `404` room /
  message / report gone, `409` state conflict (handle change while queued,
  stale music revision, illegal game action), `410` retired endpoint,
  `429` rate limited, `503` unavailable (draining, at capacity, games
  disabled, provider unconfigured).

## Auth

| Method & route                                                | Auth              | Body / query                                | Success                                                             | Errors                                                                                   |
| ------------------------------------------------------------- | ----------------- | ------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /api/auth/config`                                        | none              | —                                           | `200 { allowAnonymousAccess }`                                      | —                                                                                        |
| `GET /api/public-config`                                      | none              | —                                           | `200 { supportEmail }`                                              | —                                                                                        |
| `POST /api/auth/anonymous`                                    | none              | `{ acceptedTerms: true }`                   | `200 { success, session }`, sets `cm_session` + `cm_device` cookies | `400` terms not accepted, `403` anonymous disabled or actor/IP banned, `503` at capacity |
| `POST /api/auth/school-email`, `POST /api/auth/verify-school` | none              | —                                           | never                                                               | `410` retired; use anonymous access                                                      |
| `GET /api/auth/session`                                       | cookie (optional) | —                                           | `200 { session \| null }` (never 401)                               | —                                                                                        |
| `POST /api/auth/reroll`                                       | cookie            | —                                           | `200 { session }` with new handle                                   | `401`, `409` while queued or in a room                                                   |
| `POST /api/auth/handle`                                       | cookie            | `{ name }` (2–40 chars, community-filtered) | `200 { session }`                                                   | `400` bad/filtered name, `401`, `409` while queued or in a room                          |
| `POST /api/auth/logout`                                       | cookie (optional) | —                                           | `200 { success: true }`, leaves room, clears cookie                 | —                                                                                        |

## Matching

Requires session cookie (`401 { error: "Your session expired. Please sign in again." }`
when missing).

| Method & route                                 | Body / query                                      | Success                                                                               | Errors                     |
| ---------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| `POST /api/match/join`                         | `{ interests?: string[], allowNormal?: boolean }` | `200 { status: "queued" \| "matched", ... }` (matched payload includes room id)       | `400` invalid join options |
| `GET /api/match/poll`, `GET /api/match/status` | — (polling refreshes queue liveness)              | `200 { status: "queued" \| "idle" \| "matched", position, interestMatchUnavailable }` | `401`                      |
| `POST /api/match/cancel`                       | —                                                 | `200 { success: true }`                                                               | `401`                      |

## Chat

Requires session cookie. `roomId` identifies the room; only the two room
members may call these routes.

| Method & route                                     | Body / query                                                                                              | Success                                                                                                                                                                                                                       | Errors                                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/chat/send` (7 MB limit)                 | `{ roomId, text?, clientMessageId?, images? (≤4), voice? (1), musicSnippet? (15–30 s window), replyTo? }` | `200 { success, message }`; repeated `clientMessageId` returns the original (idempotent)                                                                                                                                      | `404` room gone, `400` over 4,000 chars / filter violation / media locked (first 90 s) / bad magic bytes or non-canonical base64 |
| `GET /api/chat/messages?roomId&sinceRevision?`     | query                                                                                                     | `200 { active, messages, revision, music?, peerDisconnected, peerPresence, isPeerTyping }`; when the room is gone returns `200 { active: false, ... }`, not 404. Unchanged `sinceRevision` returns an empty `messages` array. | `401`                                                                                                                            |
| `POST /api/chat/edit`                              | `{ roomId, messageId, text }` (text only, ≤4,000 chars)                                                   | `200 { success, message }` (`edited: true`)                                                                                                                                                                                   | `404` room/message gone, `400` not own message / non-text / music snippet / filter violation                                     |
| `POST /api/chat/delete`                            | `{ roomId, messageId }`                                                                                   | `200 { success, message }` (message becomes `Message unsent.`, media freed)                                                                                                                                                   | `404`, `400` not own message                                                                                                     |
| `POST /api/chat/react`                             | `{ roomId, messageId, emoji \| null }` (six-emoji set in `src/data/reactions.ts`; `null` clears)          | `200 { reactions }`                                                                                                                                                                                                           | `404` room/message gone, `400` unsupported emoji, `401`                                                                          |
| `POST /api/chat/typing`                            | `{ roomId, isTyping }`                                                                                    | `200 { success: true }`, peer notified                                                                                                                                                                                        | `404`                                                                                                                            |
| `POST /api/chat/leave`                             | `{ roomId }`                                                                                              | `200 { success: true }` (idempotent; ends the room for both)                                                                                                                                                                  | `401`                                                                                                                            |
| `POST /api/chat/music`                             | `{ roomId, trackId, track?, queue? (≤50), position?, volume? }`                                           | `200 { music }`                                                                                                                                                                                                               | `404`, `400` invalid track/queue/position                                                                                        |
| `POST /api/chat/music/next`                        | `{ roomId, trackId, revision }`                                                                           | `200 { music }`                                                                                                                                                                                                               | `404`, `400` invalid transition, `409` playback not started                                                                      |
| `GET /api/chat/images/:roomId/:messageId/:imageId` | path params                                                                                               | `200` image bytes (`no-store`, `nosniff`)                                                                                                                                                                                     | `404` photo unavailable, `401`                                                                                                   |
| `GET /api/chat/voice/:roomId/:messageId/:voiceId`  | path params                                                                                               | `200` audio bytes                                                                                                                                                                                                             | `404` voice unavailable, `401`                                                                                                   |

## Games

`GET /api/chat/{tictactoe,rps,connectfour,chess,trivia,wyr,drawing}?roomId`
returns the current game snapshot (per-viewer serialization for RPS, trivia,
WYR and Draw & Guess so hidden state never leaks).
`POST` to the same paths takes `{ roomId, action, ... }` with actions
`invite | respond (accept) | move/... | rematch | leave` depending on the game.
Only one non-UNO peer game (or an in-room UNO table) may be live per room;
`invite`/`respond(accept)`/`rematch` while another game is active returns
`409`. Every game POST is per-session rate limited (`429`); all game routes
return `503` when `CHAT_MULTIPLAYER_V2=false`. Game errors use `409` for
rule violations, `404` when the room is gone.

UNO tables:

| Method & route                                                                                               | Notes                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/uno/state`                                                                                         | Per-viewer UNO state (hands hidden).                                                                                                                                            |
| `POST /api/uno/arena`                                                                                        | Legacy arena path. Returns `410` while `CHAT_MULTIPLAYER_V2` is on (UNO lives inside the chat); otherwise `{ size, opponents }` join. `429` on fast rejoins, `409` on conflict. |
| `POST /api/uno/arena/cancel`                                                                                 | `{ success: true }`.                                                                                                                                                            |
| `POST /api/uno/challenge` `{ roomId }`                                                                       | Challenge the room peer. `404` room/peer gone, `429`, `409` another game active.                                                                                                |
| `POST /api/uno/challenge/respond` `{ challengeId, accept }`                                                  | `{ started }`. `400` unknown challenge.                                                                                                                                         |
| `POST /api/uno/action` `{ gameId, action: play \| draw \| pass \| uno \| rematch, cardId?, color?, round? }` | Per-viewer state. `404` table gone, `400` illegal action or stale round, `429`.                                                                                                 |
| `POST /api/uno/away` `{ away }`                                                                              | Marks the caller away without ending the table.                                                                                                                                 |
| `POST /api/uno/leave`                                                                                        | `{ success: true }`; posts one timeline notice.                                                                                                                                 |

## Music

| Method & route                                                | Auth   | Notes                                                                               |
| ------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `GET /api/music/directory`                                    | none   | `200 { tracks, total }` built-in catalog.                                           |
| `GET /api/music/search?q=`                                    | cookie | YouTube search. `400` query < 2 chars, `401`, `503` without `YOUTUBE_API_KEY`.      |
| `POST /api/music/directory` `{ youtubeUrl, title?, artist? }` | cookie | Adds a community track (≤100 kept). `400` bad link or filtered title/artist, `401`. |

## AI

`POST /api/ai/*` bodies are validated (`400 Invalid AI input or conversation
context.`) and provider-guarded (`429` under load).

| Method & route             | Auth   | Body                                                                                             | Success                                                                                        | Errors                                                                           |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `POST /api/ai/icebreakers` | none   | `{ topic?, discipline?, campus? }` — topic/campus/discipline only, never chat text               | `200 { icebreakers[4], topicSuggestions[4], encouragingNote }`; static fallback when no AI key | never 503 (falls back)                                                           |
| `POST /api/ai/suggestions` | none   | `{ topic?, discipline?, campus?, recentMessages? }`                                              | `200` suggestions; local fallback pool when no AI key                                          | —                                                                                |
| `POST /api/ai/assist`      | none   | `{ action: summarize \| explain \| suggest, chatHistory?, query?, topic? }`                      | `200 { result }`                                                                               | `503` for `summarize`/`explain` without `GEMINI_API_KEY`, or on provider failure |
| `POST /api/ai/chatbot`     | cookie | `{ message (≤4,000), history (last 6, ≤1,000 each), topic? }`; `/model` commands switch backends | `200 { reply, source, verified? }` (`source`: `gemini`/`groq`/`local-rules`/`command`)         | `401`, `400` empty message                                                       |

## Safety

Requires session cookie; both routes operate on the caller's current room.

| Method & route            | Body                                                                                                                                                 | Success                                                                              | Errors                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `POST /api/safety/report` | `{ roomId, category (harassment\|spam\|sexual\|threats\|other), reason? (≤500), messageId? (peer's text message), imageHashes? (SHA-256 hex, ≤20) }` | `200 { success, reportId }`; saves a ≤50-message text-only excerpt plus triage score | `404` room/peer gone, `400` bad category / reason / message / self-report |
| `POST /api/safety/block`  | `{ roomId }`                                                                                                                                         | `200 { success: true }`; blocks the peer actor and leaves the room                   | `404` room/peer gone, `400` storage failure                               |

## Admin

Dashboard session is an HttpOnly cookie scoped to `/api/admin` (plus the
optional legacy `ADMIN_TOKEN` Bearer credential). Login is per-IP limited
(`429 Too many sign-in attempts.`).

| Method & route                          | Body / query                                                                                                                                                                                                        | Success                                                                     | Errors                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| `POST /api/admin/login`                 | `{ username, password }` (constant-time compare)                                                                                                                                                                    | `200 { authenticated: true }`, sets cookie                                  | `401` bad credentials, `429`                           |
| `GET /api/admin/session`                | —                                                                                                                                                                                                                   | `200 { authenticated }`                                                     | —                                                      |
| `POST /api/admin/logout`                | —                                                                                                                                                                                                                   | `200 { success: true }`, clears cookie                                      | —                                                      |
| `GET /api/admin/metrics`                | —                                                                                                                                                                                                                   | `200` counters only (see docs/analytics.md)                                 | `401`                                                  |
| `GET /api/admin/reports?status=`        | `status` in `open\|resolved\|dismissed\|escalated\|all`                                                                                                                                                             | `200 { reports[], bans[] }` (metadata + counts, never message text)         | `401`, `400` bad status, `503` storage down            |
| `GET /api/admin/reports/:id`            | UUID path                                                                                                                                                                                                           | `200 { report, context (≤50 text messages), actions, triage, imageHashes }` | `401`, `400` bad id, `404` not found, `503`            |
| `GET /api/admin/images`                 | —                                                                                                                                                                                                                   | `200 { bannedImages }` (fingerprints only)                                  | `401`, `503`                                           |
| `GET /api/admin/actions?reportId&limit` | optional UUID + limit                                                                                                                                                                                               | `200 { actions }` audit trail                                               | `401`, `400` bad id, `503`                             |
| `POST /api/admin/moderate`              | `{ action, reportId?, actor?, durationMs? (1/2/3-day or permanent), includeIp?, ipAddress?, imageHash?, note? (≤1,000) }` where `action` is `resolve\|dismiss\|escalate\|ban\|unban\|unbanIp\|banImage\|unbanImage` | `200 { success: true }`; bans evict live sessions                           | `401`, `400` invalid action/target, `503` storage down |

## Health

| Method & route                            | Notes                                                                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`, `GET /api/health/live` | `200 { status: "ok" }` while the process runs, including during drain.                                                                                                 |
| `GET /api/health/ready`                   | `200 { status: "ready" }`, or `503 { status: "draining" \| "unavailable" }` while draining or when the moderation store cannot be read. Container health check target. |

## Realtime: `/ws/chat`

WebSocket endpoint. Upgrade requires: path exactly `/ws/chat` (`404`
otherwise), `Origin` equal to `APP_URL` (or host-derived default; `403`
otherwise), a valid `cm_session` cookie (`401`), and capacity (sockets <
2000, 120 upgrades/min per address, not draining; `503`). One socket per
session — a new connection closes the old one. If no `join_queue` arrives
within 5 s the server closes with `1008 Join required`. Max payload 16 KB;
240 messages/min per session closes with `1008 Rate limit exceeded`. Messages
without a string `type`, or containing a `token` field, close with `1008`.

Client → server messages (all JSON):

| `type`           | Fields                                                                                        | Effect                                                               |
| ---------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `join_queue`     | `{ interests?, allowNormal? }`                                                                | Enters the match queue (or rejoins the live room); liveness refresh. |
| `leave_queue`    | —                                                                                             | Leaves queue/room.                                                   |
| `ping`           | —                                                                                             | Liveness refresh; server replies `pong`.                             |
| `send_message`   | `{ roomId, text?, clientMessageId?, replyTo? }` (text only — media over HTTP returns `error`) | Sends a chat message.                                                |
| `delete_message` | `{ roomId, messageId }`                                                                       | Same semantics as `POST /api/chat/delete`.                           |
| `edit_message`   | `{ roomId, messageId, text }`                                                                 | Same semantics as `POST /api/chat/edit`.                             |
| `music_update`   | `{ roomId, trackId, ... }`                                                                    | Same semantics as `POST /api/chat/music`.                            |
| `leave_room`     | `{ roomId }`                                                                                  | Leaves the room.                                                     |

Server → client events:

| `type`                                                                                                           | Payload                                                     | Meaning                                                                            |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `queued`                                                                                                         | queue status + position                                     | Waiting for a peer.                                                                |
| `matched`                                                                                                        | room id, peer handle, topic, `mediaUnlockAt`                | Paired; open the chat.                                                             |
| `new_message`                                                                                                    | `{ roomId, revision, message }`                             | New chat or system notice (including game-leave notices).                          |
| `message_edited`                                                                                                 | `{ roomId, revision, message }`                             | Edited message.                                                                    |
| `message_unsent`                                                                                                 | `{ roomId, revision, messageId }`                           | Message deleted.                                                                   |
| `message_reactions`                                                                                              | `{ roomId, revision, messageId, reactions }`                | Reaction map changed.                                                              |
| `peer_typing`                                                                                                    | `{ roomId, isTyping }`                                      | Peer typing indicator.                                                             |
| `peer_disconnected`                                                                                              | `{ roomId }`                                                | Peer socket dropped (room survives; use REST polling).                             |
| `music_state`                                                                                                    | `{ roomId, music (+serverNow) }`                            | Shared playback changed.                                                           |
| `tictactoe_state`, `rps_state`, `connectfour_state`, `chess_state`, `trivia_state`, `wyr_state`, `drawing_state` | `{ roomId, state }` (per-viewer for RPS/trivia/WYR/drawing) | Game update; REST `GET` is the recovery path.                                      |
| `uno_state`                                                                                                      | per-viewer UNO state                                        | UNO update.                                                                        |
| `pong`                                                                                                           | —                                                           | `ping` reply.                                                                      |
| `error`                                                                                                          | `{ error }`                                                 | Recoverable failure (e.g. room gone, media over socket); same text as REST errors. |
| `server_restart`                                                                                                 | —                                                           | Sent before close `1012` during drain; client must re-enter via REST.              |

REST polling (`GET /api/chat/messages`, `GET /api/match/poll`, per-game
`GET`s) is the recovery path for every event above. Losing the socket never
ends a room.
