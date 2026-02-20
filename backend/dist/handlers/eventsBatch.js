import { getSession, isStimulusAssignedToSession, markStimulusRunProgress, putEvent, putHold } from "../lib/dynamo.js";
import { json, parseBody } from "../lib/http.js";
import { assertString } from "../lib/contracts.js";
import { isoFromMs, nowMs } from "../lib/time.js";
function isConditionalFailure(error) {
    if (!error)
        return false;
    const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
    const message = typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "";
    return (name.includes("ConditionalCheckFailed") ||
        message.includes("ConditionalCheckFailed") ||
        message.toLowerCase().includes("conditional request failed"));
}
function validateBatch(payload) {
    assertString(payload.session_id, "session_id");
    assertString(payload.run_id, "run_id");
    if (!Array.isArray(payload.events) || payload.events.length === 0) {
        throw new Error("events must be non-empty array");
    }
}
function toStoredEvent(ev, experiment_target) {
    return {
        event_key: `${ev.stimulus_id}#${ev.run_id}#${String(ev.client_event_seq).padStart(10, "0")}`,
        ...ev,
        experiment_target,
        t_server_received_utc_ms: nowMs()
    };
}
function parseWordIndex(ev) {
    const candidates = [ev.word_index, ev.start_word_index, ev.end_word_index];
    for (const v of candidates) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0)
            return Math.floor(n);
    }
    return null;
}
function parsePopupStateLabel(value) {
    if (value === "mistake" || value === "uncertain" || value === "clear")
        return value;
    return undefined;
}
export async function handler(event) {
    try {
        const payload = parseBody(event.body);
        validateBatch(payload);
        const firstStimulus = payload.events[0]?.stimulus_id;
        if (!firstStimulus)
            throw new Error("missing stimulus_id");
        const session = await getSession(payload.session_id);
        if (!session)
            throw new Error("session not found");
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
                await putEvent(toStoredEvent(ev, session.experiment_target));
            }
            catch (error) {
                // Idempotency: if duplicate key already exists, treat as acked.
                if (!isConditionalFailure(error))
                    throw error;
            }
            if (ev.type === "KEYUP" || ev.type === "UNCERTAINTY_END") {
                const keyup = ev;
                const start_word_index = Number(keyup.start_word_index);
                const end_word_index = Number(keyup.end_word_index);
                const start_t_rel_ms = Number(keyup.start_t_rel_ms);
                const end_t_rel_ms = Number(keyup.t_rel_ms);
                const hold_id = String(keyup.hold_id || "");
                if (hold_id &&
                    Number.isFinite(start_word_index) &&
                    Number.isFinite(end_word_index) &&
                    Number.isFinite(start_t_rel_ms) &&
                    Number.isFinite(end_t_rel_ms)) {
                    const start = Math.min(start_word_index, end_word_index);
                    const end = Math.max(start_word_index, end_word_index);
                    const duration_ms = Math.max(0, end_t_rel_ms - start_t_rel_ms);
                    const created_at_utc = isoFromMs(nowMs());
                    try {
                        await putHold({
                            session_id: payload.session_id,
                            hold_id,
                            participant_id: session.participant_id,
                            experiment_target: session.experiment_target,
                            stimulus_id: ev.stimulus_id,
                            run_id: ev.run_id,
                            episode_type: ev.type === "KEYUP" ? "hold_interval" : "toggle_interval",
                            input_modality: session.input_modality,
                            start_word_index: start,
                            end_word_index: end,
                            start_t_rel_ms,
                            end_t_rel_ms,
                            duration_ms,
                            auto_closed: Boolean(keyup.auto_closed),
                            created_at_utc
                        });
                    }
                    catch (error) {
                        if (!isConditionalFailure(error))
                            throw error;
                    }
                }
            }
            if (ev.type === "UNCERTAINTY_MARK") {
                const mark = ev;
                const word_index = parseWordIndex(mark);
                if (word_index !== null) {
                    const hold_id = typeof mark.hold_id === "string" && mark.hold_id.length > 0
                        ? mark.hold_id
                        : `${ev.run_id}#${String(ev.client_event_seq).padStart(10, "0")}`;
                    const point_t = Number(ev.t_rel_ms);
                    const created_at_utc = isoFromMs(nowMs());
                    try {
                        await putHold({
                            session_id: payload.session_id,
                            hold_id,
                            participant_id: session.participant_id,
                            experiment_target: session.experiment_target,
                            stimulus_id: ev.stimulus_id,
                            run_id: ev.run_id,
                            episode_type: "click_point",
                            input_modality: session.input_modality,
                            start_word_index: word_index,
                            end_word_index: word_index,
                            start_t_rel_ms: point_t,
                            end_t_rel_ms: point_t,
                            duration_ms: 0,
                            created_at_utc
                        });
                    }
                    catch (error) {
                        if (!isConditionalFailure(error))
                            throw error;
                    }
                }
            }
            if (ev.type === "STATE_SET") {
                const stateSet = ev;
                const word_index = parseWordIndex(stateSet);
                const state_label = parsePopupStateLabel(stateSet.state_label);
                if (word_index !== null && state_label) {
                    const hold_id = typeof stateSet.hold_id === "string" && stateSet.hold_id.length > 0
                        ? stateSet.hold_id
                        : `${ev.run_id}#${String(ev.client_event_seq).padStart(10, "0")}`;
                    const point_t = Number(ev.t_rel_ms);
                    const created_at_utc = isoFromMs(nowMs());
                    try {
                        await putHold({
                            session_id: payload.session_id,
                            hold_id,
                            participant_id: session.participant_id,
                            experiment_target: session.experiment_target,
                            stimulus_id: ev.stimulus_id,
                            run_id: ev.run_id,
                            episode_type: "popup_state_point",
                            input_modality: session.input_modality,
                            state_label,
                            start_word_index: word_index,
                            end_word_index: word_index,
                            start_t_rel_ms: point_t,
                            end_t_rel_ms: point_t,
                            duration_ms: 0,
                            created_at_utc
                        });
                    }
                    catch (error) {
                        if (!isConditionalFailure(error))
                            throw error;
                    }
                }
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
