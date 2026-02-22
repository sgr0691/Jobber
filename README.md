# Jobber

Jobber is a hybrid job agent that automates repetitive job-search work while preserving human-in-the-loop safety.

## Rivet-First v2 Architecture

- Brain: Cloudflare Worker with actor-style workflow classes
- Intelligence: Workers AI scoring + drafting
- Hands: Runner poller using Playwright-compatible execution
- UI: Astro dashboard with WebSocket subscriptions

Workflow:

```text
DISCOVER -> SCORE -> DRAFT -> APPLY -> OUTREACH -> FOLLOWUP
```

## Implemented Modules

### Worker Brain (`apps/worker`)

Actor definitions:

- `JobWorkspace`
  - State: jobs, scores, drafts, applications
  - Methods: `discover()`, `score(jobId)`, `draft(jobId)`, `queueApply(jobId)`, `markApplied(jobId)`
- `RunnerCoordinator`
  - State: pending tasks, in-flight tasks, retry tracking
  - Methods: `enqueueTask()`, `claimPending()`, `receiveResult()`

Realtime events:

- `job_scored`
- `application_submitted`
- `approval_required`

### Discovery + Scoring

Weighted scoring combines:

- title alignment
- skills overlap
- compensation fit
- remote compatibility
- semantic fit (Workers AI with heuristic fallback)

Risk flags:

- `CLEARANCE_REQUIRED`
- `ONSITE_ONLY`
- `WORKDAY_FLOW`

### Apply Autopilot Rules

Autopilot is implemented exactly as specified:

- Auto-apply if score >= 85, no risk flags, and simple apply flow
- Require approval for Workday flows or medium scores (70-84)
- Block if clearance required or onsite-only while remote is needed

### Runner (`runner`)

The runner loop:

1. Polls `GET /api/runner/pending`
2. Executes task (Playwright-ready path + dry-run safe mode)
3. Detects captcha checkpoints and returns `NEEDS_APPROVAL`
4. Sends outcome to `POST /api/runner/result`

### Dashboard (`apps/dashboard`)

Astro dashboard supports:

- state refresh (`/api/state`)
- seed demo jobs
- per-job score/draft/queue actions
- approval queue with approve/reject controls
- WebSocket event feed from worker `/ws`

## Worker API

- `GET /api/state`
- `POST /api/jobs/discover`
- `POST /api/jobs/:jobId/score`
- `POST /api/jobs/:jobId/draft`
- `POST /api/jobs/:jobId/queue-apply`
- `POST /api/jobs/:jobId/approve`
- `POST /api/jobs/:jobId/reject`
- `GET /api/runner/pending`
- `POST /api/runner/result`
- `GET /ws`

## Local Development

Install dependencies:

```bash
npm install
```

Start worker:

```bash
npm run dev:worker
```

Start dashboard:

```bash
npm run dev:dashboard
```

Start runner:

```bash
npm run dev:runner
```

Run tests:

```bash
npm test
```
