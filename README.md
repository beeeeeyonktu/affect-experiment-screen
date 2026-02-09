# Affect Experiment Platform

Crash-resilient online reading experiment platform for Prolific participants.

## Scope in this scaffold

- Phase 0 foundations:
  - Monorepo-style structure
  - Shared event/session contracts
  - AWS CDK infrastructure stub
- Phase 1 core API:
  - `POST /session/start`
  - `POST /session/heartbeat`
- Phase 4 core durability:
  - `POST /events/batch`
  - Client-side IndexedDB outbox write-through
  - Batch upload with retry and restart-safe `run_id`

## Repository layout

- `frontend/`: static web app with calibration + experiment flow skeleton
- `backend/`: Lambda handler code (TypeScript)
- `shared/`: shared schema types and validation helpers
- `infra/`: CDK stack scaffold for API, Lambda, DynamoDB, S3, CloudFront
- `docs/`: design and operational notes

## Non-negotiable crash safety rule implemented

1. Capture event immediately on input edge (`keydown`/`keyup`)
2. Write-through to IndexedDB outbox immediately
3. Upload in batches every 3s or every 30 events
4. On reload, flush unsent events first, then start new `run_id`

## Next steps (required before production)

1. Implement real Prolific JWT verification (JWKS cache + `aud`/`exp` checks).
2. Add conditional DynamoDB writes for strict uniqueness and lease ownership.
3. Add automated load tests (k6) and browser fidelity tests (Playwright).
4. Add WAF/rate limits and CloudWatch alarms.
