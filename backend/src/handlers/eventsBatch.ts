import { getSession, isStimulusAssignedToSession, markStimulusRunProgress, putEvent, putHold } from "../lib/dynamo.js";
import { json, parseBody } from "../lib/http.js";
import { assertString, type EventBatchRequest, type ExperimentEvent } from "../lib/contracts.js";
import { isoFromMs, nowMs } from "../lib/time.js";

function validateBatch(payload: EventBatchRequest) {
  assertString(payload.session_id, "session_id");
  assertString(payload.run_id, "run_id");
  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    throw new Error("events must be non-empty array");
  }
}

function toStoredEvent(ev: ExperimentEvent) {
  return {
    event_key: `${ev.stimulus_id}#${ev.run_id}#${String(ev.client_event_seq).padStart(10, "0")}`,
    ...ev,
    t_server_received_utc_ms: nowMs()
  };
}

export async function handler(event: { body?: string | null }) {
  try {
    const payload = parseBody<EventBatchRequest>(event.body);
    validateBatch(payload);
    const firstStimulus = payload.events[0]?.stimulus_id;
    if (!firstStimulus) throw new Error("missing stimulus_id");
    const session = await getSession(payload.session_id);
    if (!session) throw new Error("session not found");
    const assigned = await isStimulusAssignedToSession(payload.session_id, firstStimulus);
    if (!assigned) throw new Error("stimulus not assigned to session");

    const acked: number[] = [];
    let sawRevealEnd = false;
    let sawAnyEvent = false;
    let stimulus_id = "";
    for (const ev of payload.events) {
      if (ev.session_id !== payload.session_id) throw new Error("event session mismatch");
      if (ev.run_id !== payload.run_id) throw new Error("event run mismatch");
      assertString(ev.type, "event.type");
      if (!stimulus_id) stimulus_id = ev.stimulus_id;
      if (stimulus_id !== ev.stimulus_id) throw new Error("mixed stimulus in batch");
      sawAnyEvent = true;
      if (ev.type === "REVEAL_END") sawRevealEnd = true;

      try {
        await putEvent(toStoredEvent(ev));
      } catch (error) {
        const msg = error instanceof Error ? error.message : "";
        // Idempotency: if duplicate key already exists, treat as acked.
        if (!msg.includes("ConditionalCheckFailed")) throw error;
      }

      if (ev.type === "KEYUP") {
        const keyup = ev as ExperimentEvent & {
          hold_id?: unknown;
          start_word_index?: unknown;
          end_word_index?: unknown;
          start_t_rel_ms?: unknown;
          auto_closed?: unknown;
        };
        const start_word_index = Number(keyup.start_word_index);
        const end_word_index = Number(keyup.end_word_index);
        const start_t_rel_ms = Number(keyup.start_t_rel_ms);
        const end_t_rel_ms = Number(keyup.t_rel_ms);
        const hold_id = String(keyup.hold_id || "");

        if (
          hold_id &&
          Number.isFinite(start_word_index) &&
          Number.isFinite(end_word_index) &&
          Number.isFinite(start_t_rel_ms) &&
          Number.isFinite(end_t_rel_ms)
        ) {
          const start = Math.min(start_word_index, end_word_index);
          const end = Math.max(start_word_index, end_word_index);
          const duration_ms = Math.max(0, end_t_rel_ms - start_t_rel_ms);
          const created_at_utc = isoFromMs(nowMs());
          try {
            await putHold({
              session_id: payload.session_id,
              hold_id,
              participant_id: session.participant_id,
              stimulus_id: ev.stimulus_id,
              run_id: ev.run_id,
              start_word_index: start,
              end_word_index: end,
              start_t_rel_ms,
              end_t_rel_ms,
              duration_ms,
              auto_closed: Boolean(keyup.auto_closed),
              created_at_utc
            });
          } catch (error) {
            const msg = error instanceof Error ? error.message : "";
            if (!msg.includes("ConditionalCheckFailed")) throw error;
          }
        }
      }
      acked.push(ev.client_event_seq);
    }

    if (sawAnyEvent) {
      await markStimulusRunProgress(payload.session_id, stimulus_id, payload.run_id, sawRevealEnd, isoFromMs(nowMs()));
    }

    return json(200, { acked_client_event_seq: acked });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(400, { error: message });
  }
}
