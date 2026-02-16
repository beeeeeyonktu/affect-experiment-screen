import { completeSession, getSession } from "../lib/dynamo.js";
import { envOr } from "../lib/env.js";
import { json, parseBody } from "../lib/http.js";
import { assertString, type SessionCompleteRequest } from "../lib/contracts.js";
import { isoFromMs, nowMs } from "../lib/time.js";

function completionRedirectUrl(): string {
  const fullUrl = envOr("PROLIFIC_COMPLETION_URL", "").trim();
  if (fullUrl.length > 0) return fullUrl;

  const code = envOr("PROLIFIC_COMPLETION_CODE", "").trim();
  if (code.length === 0) return "";
  return `https://app.prolific.com/submissions/complete?cc=${encodeURIComponent(code)}`;
}

export async function handler(event: { body?: string | null }) {
  try {
    const body = parseBody<SessionCompleteRequest>(event.body);
    const session_id = assertString(body.session_id, "session_id");
    const lease_token = assertString(body.lease_token, "lease_token");

    const session = await getSession(session_id);
    if (!session) return json(404, { ok: false, error: "session not found" });
    if (session.lease_token !== lease_token) return json(409, { ok: false, active_elsewhere: true });

    await completeSession(session_id, lease_token, isoFromMs(nowMs()));
    return json(200, {
      ok: true,
      redirect_url: completionRedirectUrl() || null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(400, { ok: false, error: message });
  }
}

