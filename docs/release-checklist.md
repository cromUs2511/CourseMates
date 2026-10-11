# Release checklist

Every gate must pass before a change is called done or merged. CI
(`.github/workflows/ci.yml`) enforces the same gates on push and pull request.

## Gates (in order)

1. **Typecheck** — `npm run typecheck` (`tsc --noEmit`, strict). Zero errors.
2. **Lint** — `npm run lint` (typecheck + ESLint over every `*.ts`/`*.tsx`).
   Zero warnings on touched files; no new suppressions without a linked reason.
3. **Format** — `npm run format:check` (Prettier). Run `npm run format` on
   touched files first; the gate must be green, not force-merged.
4. **Tests** — `npm test` (`node:test` runtime + utility suite, real
   HTTP/WebSocket clients). All green, run serially on Windows.
5. **Coverage** — `npm run test:coverage` (c8; thresholds in `.c8rc.json`:
   65% lines/statements/functions, 55% branches). No drop on touched modules.
6. **Python contracts** — `npm run test:python` (FastAPI shadow-service tests).
7. **Build** — `npm run build` (Vite client + `dist/.server/server.cjs`).
   Must succeed with no new bundle warnings.
8. **E2E** — `npm run test:e2e` (production bundle, port 3100, isolated env)
   and `npm run test:e2e:dev` (Vite dev server). Build before the production
   run; pick browsers with `PW_CHANNEL` (CI matrices `chrome` + `chromium`).
9. **Dependency audit** — `npm audit --audit-level=high`. Zero high/critical;
   document any exception with an expiry date.
10. **Secret scan** — `npm run scan:secrets`. Zero hits. Never commit real
    credentials; `.env*` (except `.env.example`) is git-ignored.
11. **Privacy review** — confirm: no message/media text in logs, metrics, or
    analytics; no new durable store beyond moderation records; new AI payloads
    send only the documented context (see `docs/analytics.md`); report
    excerpts stay text-only and ≤50 messages.
12. **Docs** — `docs/api.md` updated for any route/event change, `CHANGELOG.md`
    `Unreleased` entry added, `docs/operations.md` touched if limits, env, or
    recovery behavior changed.

## Rollback

- Single-process, ephemeral runtime: rollback is redeploy of the previous
  green build. No migration to reverse — moderation files are versioned and
  load legacy shapes in place.
- Never "fix" a bad deploy by adding a replica; that splits the queue.
- If moderation data was written by the bad build, keep both
  `moderation.json` and `moderation.db` together (copy while stopped); a parse
  failure starts empty rather than crashing, so verify record counts after
  restore.
- Native/Python changes roll back independently (shadow-only); confirm the
  Node contract is untouched before standing down.
