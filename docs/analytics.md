# Analytics policy

CourseMates measures the service, never the conversation. All product
analytics are aggregate counters; message-content analytics are explicitly
banned.

## Aggregate-only policy

The only metrics endpoint is `GET /api/admin/metrics` (admin-authenticated).
It returns counters: `requests`, `errors`, `rateLimited`, `rejectedOrigins`,
`providerFailures`, `startedAt`, plus gauged `sessions`, `queued`, `rooms`,
`sockets`, `mediaBytes`, `draining`, and process RSS. It never contains chat
text, media, tokens, emails, IPs, or report bodies. `logEvent` writes one JSON
line from an explicit field allowlist and must never serialize errors, URLs,
requests, IPs, or payloads; `runtime.ts` never logs message or media contents.

## What is measured (and why)

- Traffic health: `requests` / `errors` / `rateLimited` / `rejectedOrigins`
  (abuse, misconfiguration, proxy/origin drift).
- Capacity: `sessions`, `queued`, `rooms`, `sockets`, `mediaBytes`, memory
  RSS (single-process budget vs the 768 MB container limit).
- Dependencies: `providerFailures` (AI quota/outage → fallback rate).
- Availability: health/readiness probes and drain state.

Moderation review (`/api/admin/reports`, excerpts, audit trail) is a safety
workflow with 30-day retention, not analytics: it is human-gated,
report-scoped, and never aggregated into behavioral profiles.

## SLI targets

| Signal                                                        | Target                                                                                                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Match time (join → `matched`)                                 | p95 < 60 s with ≥2 eligible peers queued; queue entries refresh on poll/`ping` and expire after 30 s silence                                             |
| Message delivery (send → peer `new_message` / poll-visible)   | p95 < 2 s on a live socket; REST poll fallback ≤ 3 s staleness (`revision`-skipped when unchanged)                                                       |
| Game completion (invite → result without server-caused abort) | ≥ 99% of started games reach a result or an explicit leave notice; no silent game loss on socket drop (Draw & Guess turns survive deadline + 30 s grace) |

Measure these from counters and probe timings, never from message contents.

## Explicit ban on message-content analytics

Forbidden: logging, persisting, aggregating, embedding, training on, or
profiling message text, photos, voice, music choices, reactions, interests,
handles, or report notes — including "anonymized" or "aggregate" keyword,
sentiment, topic, or engagement statistics derived from content. AI calls send
only their documented context (icebreakers: topic/campus/discipline; chatbot:
the current message plus ≤6 compact history texts; assist: only when
explicitly invoked). Triage scores describe a filed report for a human
reviewer; they are not a dataset. Any proposal to measure content requires a
privacy review, explicit user consent, and a policy update first — the default
answer is no.
