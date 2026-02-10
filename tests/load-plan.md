# Load Test Plan (Phase 8)

Use k6 to simulate 3000 users bursting over 5 minutes.

## Flow per virtual participant

1. `POST /session/start`
2. `POST /calibration/save`
3. Repeat 3 times:
- `GET /stimulus/next`
- 10 to 20x `POST /events/batch` (3 to 5 events per batch)
- `POST /ratings/save`
4. `POST /session/complete`

## Success criteria

- Error rate < 1% excluding injected faults
- No sustained DynamoDB throttle errors
- p95 latency:
- session start < 300 ms
- events batch < 250 ms
