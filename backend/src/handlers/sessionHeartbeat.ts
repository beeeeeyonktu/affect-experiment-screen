import { getSession, refreshLease } from "../lib/dynamo.js";
import { json, parseBody } from "../lib/http.js";
import { isoFromMs, nowMs } from "../lib/time.js";
import { assertString, type SessionHeartbeatRequest } from "../lib/contracts.js";
import { envOr } from "../lib/env.js";

const LEASE_SECONDS = Number(envOr("LEASE_SECONDS", "45"));

export async function handler(event: { body?: string | null }) {
  try {
    const body = parseBody<SessionHeartbeatRequest>(event.body);
    const session_id = assertString(body.session_id, "session_id");
    const lease_token = assertString(body.lease_token, "lease_token");

    const session = await getSession(session_id);
    if (!session) {
      return json(404, { ok: false, error: "session not found" });
    }

    if (session.lease_token !== lease_token) {
      return json(409, { ok: false, active_elsewhere: true });
    }

    const now = nowMs();
    const nextLease = isoFromMs(now + LEASE_SECONDS * 1000);
    const updated = isoFromMs(now);
    await refreshLease(session_id, lease_token, nextLease, updated);

    return json(200, { ok: true, lease_expires_at_utc: nextLease });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(400, { ok: false, error: message });
  }
}
