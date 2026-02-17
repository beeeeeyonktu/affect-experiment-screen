import { createParticipantSessionAndLock } from "../lib/dynamo.js";
import { json, parseBody } from "../lib/http.js";
import { newLeaseToken, newSessionId } from "../lib/ids.js";
import { verifyProlificSecuredUrlJwt } from "../lib/prolific.js";
import { isoFromMs, nowMs } from "../lib/time.js";
import { assertString, type SessionStartRequest } from "../lib/contracts.js";
import { envOr } from "../lib/env.js";

const LEASE_SECONDS = Number(envOr("LEASE_SECONDS", "45"));

export async function handler(event: { body?: string | null }) {
  try {
    const body = parseBody<SessionStartRequest>(event.body);
    const securedJwt = assertString(body.secured_url_jwt, "secured_url_jwt");
    const claims = await verifyProlificSecuredUrlJwt(securedJwt);

    const now = nowMs();
    const participant_id = `${claims.STUDY_ID}#${claims.PROLIFIC_PID}`;
    const session_id = newSessionId();
    const lease_token = newLeaseToken();

    const record = {
      session_id,
      participant_id,
      study_id: claims.STUDY_ID,
      prolific_pid: claims.PROLIFIC_PID,
      prolific_session_id: claims.SESSION_ID,
      status: "active" as const,
      input_modality: "hold" as const,
      modality_version: "v1",
      current_index: 0,
      lease_token,
      lease_expires_at_utc: isoFromMs(now + LEASE_SECONDS * 1000),
      created_at_utc: isoFromMs(now),
      updated_at_utc: isoFromMs(now)
    };

    await createParticipantSessionAndLock({
      participant_id,
      prolific_pid: claims.PROLIFIC_PID,
      study_id: claims.STUDY_ID,
      prolific_session_id: claims.SESSION_ID,
      session: record
    });

    return json(200, {
      session_id,
      lease_token,
      lease_expires_at_utc: record.lease_expires_at_utc,
      stage: "calibration"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = message.includes("ConditionalCheckFailed") ? 409 : 400;
    return json(statusCode, { error: message });
  }
}
