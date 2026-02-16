import { getHold, getSession, isStimulusAssignedToSession, putHoldRating } from "../lib/dynamo.js";
import { json, parseBody } from "../lib/http.js";
import { assertString } from "../lib/contracts.js";
import { isoFromMs, nowMs } from "../lib/time.js";
const SHIFT_OPTIONS = ["yes", "no", "not_sure"];
const DIRECTION_OPTIONS = ["more_positive", "more_negative", "mixed", "unsure"];
function assertFiniteNumber(value, field) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Invalid ${field}`);
    }
    return value;
}
export async function handler(event) {
    try {
        const body = parseBody(event.body);
        const session_id = assertString(body.session_id, "session_id");
        const lease_token = assertString(body.lease_token, "lease_token");
        const hold_id = assertString(body.hold_id, "hold_id");
        const stimulus_id = assertString(body.stimulus_id, "stimulus_id");
        const run_id = assertString(body.run_id, "run_id");
        const confidence = assertFiniteNumber(body.confidence, "confidence");
        if (!SHIFT_OPTIONS.includes(body.shift_decision))
            throw new Error("Invalid shift_decision");
        if (!DIRECTION_OPTIONS.includes(body.direction))
            throw new Error("Invalid direction");
        if (!Number.isInteger(confidence) || confidence < 1 || confidence > 5)
            throw new Error("Invalid confidence");
        const feeling_before = typeof body.feeling_before === "string" && body.feeling_before.length > 0 ? body.feeling_before : undefined;
        const feeling_after = typeof body.feeling_after === "string" && body.feeling_after.length > 0 ? body.feeling_after : undefined;
        const session = await getSession(session_id);
        if (!session)
            return json(404, { ok: false, error: "session not found" });
        if (session.lease_token !== lease_token)
            return json(409, { ok: false, active_elsewhere: true });
        const assigned = await isStimulusAssignedToSession(session_id, stimulus_id);
        if (!assigned)
            return json(400, { ok: false, error: "stimulus not assigned to session" });
        const hold = await getHold(session_id, hold_id);
        if (!hold)
            return json(400, { ok: false, error: "hold not found" });
        if (hold.stimulus_id !== stimulus_id)
            return json(400, { ok: false, error: "hold stimulus mismatch" });
        if (hold.run_id !== run_id)
            return json(400, { ok: false, error: "hold run mismatch" });
        await putHoldRating({
            session_id,
            hold_id,
            stimulus_id,
            run_id,
            shift_decision: body.shift_decision,
            direction: body.direction,
            feeling_before,
            feeling_after,
            confidence,
            created_at_utc: isoFromMs(nowMs())
        });
        return json(200, { ok: true });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return json(400, { ok: false, error: message });
    }
}
