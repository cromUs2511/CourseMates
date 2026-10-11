# Cost & sustainability

CourseMates is designed to run as a single small Node process with
pay-per-use AI and media handled in memory. This note lists what actually
costs money, which in-code limits bound those costs, and how to watch them.

## Cost drivers

| Driver                             | What burns money                                                                              | Bound in code                                                                                                                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting (Render/container)         | One always-on Node service + optional Python shadow service; memory pressure from media/games | `mem_limit: 768m`, caps: 2000 sessions / 500 rooms / 1000 queued / 2000 sockets / 128 MB global media, 24 MB per room, 500 messages per room                                                                                  |
| AI (Gemini primary, Groq fallback) | Per-request inference: icebreakers, suggestions, assist (summarize/explain), chatbot replies  | Chatbot history capped at 6 compact messages, short output limits, one request per reply; AI rate bucket 30/min/IP; provider guard (8 in flight, 30 s circuit after 5 failures); static icebreaker fallback when unconfigured |
| Media                              | YouTube Data API search quota; transient RAM for photos/voice (no object storage by design)   | Photos 4/msg, 1 MB each (3 MB GIF), 4 MB/msg, 1600 px; voice 4 MB/180 s, one per send; eviction and room teardown free bytes immediately                                                                                      |
| Moderation storage                 | Tiny persistent volume (`moderation.json` + `moderation.db`)                                  | 10,000-record cap, 30-day retention sweep, per-reporter daily cap, ≤50-message text-only excerpts                                                                                                                             |

Without `YOUTUBE_API_KEY` / `GEMINI_API_KEY` the service still runs fully on
built-in catalogs and rule-based fallbacks — AI and search cost can be zero.

## Usage limits already in code

Request/headers/keep-alive timeouts (30 s / 15 s / 5 s), 64 KB non-media
bodies, 7 MB chat-send bodies, per-IP rate buckets (auth/AI/search 30/min,
other API 1200/min), WS 120 upgrades + 240 messages/min, session lifetime
8 h, queue/room 30 s inactivity sweeps every 5 s. Saturation fails closed
(`WindowLimiter` never evicts an active key).

## Alerts guidance

Watch `GET /api/admin/metrics`: sustained `rateLimited` growth (abuse or too
tight buckets), `providerFailures` spikes (quota exhausted — expect AI
fallbacks, not outages), `mediaBytes` near the 128 MB cap, `rooms`/`sockets`
near caps, and RSS vs the 768 MB container limit. Readiness (`/api/health/ready`)
going 503 during business hours means drain or storage failure — page on that,
not on liveness. AI spend itself is metered in the Gemini/Groq consoles; set
billing alerts there, not in this repo.

## License notes

No license file is declared in the repo root (`package.json` has no
`license` field and there is no `LICENSE` file). Runtime dependencies are
MIT/Apache-2.0-style packages (Express, React, Vite, `ws`, chess.js) plus
provider SDKs (`@google/genai`, Groq/YouTube APIs) governed by their own
terms and billing. Before a public release: add a `LICENSE` file and a
`license` field, confirm font/media asset licensing for `public/`, and record
third-party API terms (Gemini, Groq, YouTube) alongside the privacy pages.
