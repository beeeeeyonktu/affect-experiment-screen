# Critical Risks To Address Before Real Participants

1. JWT verification is currently stubbed.
This must be replaced with strict Prolific secured URL verification.

2. Participant lock behavior for reconnects is not complete.
Need explicit policy for lease steal vs resume on same device fingerprint.

3. Backend endpoints for calibration save, stimulus assignment, ratings, demographics, completion are not implemented yet.
These are required for full protocol.

4. Frontend currently uses one embedded demo stimulus.
Must switch to server-assigned stimuli from S3-backed versioned store.

5. No production auth/rate limiting/WAF in front of API.
Add AWS WAF and per-IP/token throttles.

6. No automated browser fidelity tests yet.
Add Playwright assertions for word index mapping across Chrome/Firefox/WebKit.
