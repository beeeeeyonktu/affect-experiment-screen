import { isStimulusAssignedToSession, markStimulusRunProgress, putEvent } from "../lib/dynamo.js";
import { json, parseBody } from "../lib/http.js";
import { assertString } from "../lib/contracts.js";
import { isoFromMs, nowMs } from "../lib/time.js";
function validateBatch(payload) {
    assertString(payload.session_id, "session_id");
    assertString(payload.run_id, "run_id");
    if (!Array.isArray(payload.events) || payload.events.length === 0) {
        throw new Error("events must be non-empty array");
    }
}
function toStoredEvent(ev) {
    return {
        event_key: `${ev.stimulus_id}#${ev.run_id}#${String(ev.client_event_seq).padStart(10, "0")}`,
        ...ev,
        t_server_received_utc_ms: nowMs()
    };
}
export async function handler(event) {
    try {
        const payload = parseBody(event.body);
        validateBatch(payload);
        const firstStimulus = payload.events[0]?.stimulus_id;
        if (!firstStimulus)
            throw new Error("missing stimulus_id");
        const assigned = await isStimulusAssignedToSession(payload.session_id, firstStimulus);
        if (!assigned)
            throw new Error("stimulus not assigned to session");
        const acked = [];
        let sawRevealEnd = false;
        let sawAnyEvent = false;
        let stimulus_id = "";
        for (const ev of payload.events) {
            if (ev.session_id !== payload.session_id)
                throw new Error("event session mismatch");
            if (ev.run_id !== payload.run_id)
                throw new Error("event run mismatch");
            assertString(ev.type, "event.type");
            if (!stimulus_id)
                stimulus_id = ev.stimulus_id;
            if (stimulus_id !== ev.stimulus_id)
                throw new Error("mixed stimulus in batch");
            sawAnyEvent = true;
            if (ev.type === "REVEAL_END")
                sawRevealEnd = true;
            try {
                await putEvent(toStoredEvent(ev));
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : "";
                // Idempotency: if duplicate key already exists, treat as acked.
                if (!msg.includes("ConditionalCheckFailed"))
                    throw error;
            }
            acked.push(ev.client_event_seq);
        }
        if (sawAnyEvent) {
            await markStimulusRunProgress(payload.session_id, stimulus_id, payload.run_id, sawRevealEnd, isoFromMs(nowMs()));
        }
        return json(200, { acked_client_event_seq: acked });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return json(400, { error: message });
    }
}
