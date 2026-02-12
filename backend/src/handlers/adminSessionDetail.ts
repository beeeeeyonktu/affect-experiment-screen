import { adminGetSessionDetail } from "../lib/dynamo.js";
import { json, parseBody } from "../lib/http.js";
import { assertOptionalNumber, assertString, type AdminSessionDetailRequest } from "../lib/contracts.js";
import { assertAdminAuthorized, type ApiRequestContext } from "../lib/auth.js";

export async function handler(event: { body?: string | null; requestContext?: ApiRequestContext }) {
  try {
    assertAdminAuthorized(event.requestContext);
    const body = parseBody<AdminSessionDetailRequest>(event.body);
    const session_id = assertString(body.session_id, "session_id");
    const requestedLimit = assertOptionalNumber(body.event_limit, "event_limit");
    const eventLimit = Math.max(10, Math.min(5000, requestedLimit ?? 1000));

    const detail = await adminGetSessionDetail(session_id, eventLimit);
    if (!detail) return json(404, { error: "session not found" });

    return json(200, detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const code = message === "admin unauthorized" ? 401 : 400;
    return json(code, { error: message });
  }
}
