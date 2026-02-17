import { getSession, saveCalibration } from "../lib/dynamo.js";
import { json, parseBody } from "../lib/http.js";
import { assertString } from "../lib/contracts.js";
import { isoFromMs, nowMs } from "../lib/time.js";
const CALIBRATION_SPEEDS = {
    // Research-informed ranges around common adult silent reading rates.
    // 180, 240, 300 wpm => 333, 250, 200 ms/word.
    slow: 333,
    medium: 250,
    fast: 200
};
const ALLOWED_MODALITIES = ["hold", "click_mark", "toggle_state", "popup_state"];
export async function handler(event) {
    try {
        const body = parseBody(event.body);
        const session_id = assertString(body.session_id, "session_id");
        const lease_token = assertString(body.lease_token, "lease_token");
        if (!["slow", "medium", "fast"].includes(body.calibration_group)) {
            throw new Error("Invalid calibration_group");
        }
        const calibration_group = body.calibration_group;
        const input_modality = (body.input_modality ?? "hold");
        if (!ALLOWED_MODALITIES.includes(input_modality)) {
            throw new Error("Invalid input_modality");
        }
        const session = await getSession(session_id);
        if (!session)
            return json(404, { ok: false, error: "session not found" });
        if (session.lease_token !== lease_token)
            return json(409, { ok: false, active_elsewhere: true });
        const ms_per_word = CALIBRATION_SPEEDS[calibration_group];
        await saveCalibration(session_id, lease_token, calibration_group, input_modality, ms_per_word, isoFromMs(nowMs()));
        return json(200, {
            ok: true,
            calibration_group,
            input_modality,
            ms_per_word
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return json(400, { ok: false, error: message });
    }
}
