import { adminListRecentSessions } from "../lib/dynamo.js";
import { json, parseBody } from "../lib/http.js";
import { assertOptionalNumber, type AdminSummaryRequest } from "../lib/contracts.js";
import { assertAdminAuthorized, type ApiRequestContext } from "../lib/auth.js";

export async function handler(event: { body?: string | null; requestContext?: ApiRequestContext }) {
  try {
    assertAdminAuthorized(event.requestContext);
    const body = event.body ? parseBody<AdminSummaryRequest>(event.body) : {};
    const requestedLimit = assertOptionalNumber(body.limit, "limit");
    const limit = Math.max(1, Math.min(500, requestedLimit ?? 100));
    const rows = await adminListRecentSessions(limit);
    return json(200, { rows, limit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const code = message === "admin unauthorized" ? 401 : 400;
    return json(code, { error: message });
  }
}
