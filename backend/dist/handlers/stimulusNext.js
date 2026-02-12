import { parseBody, json } from "../lib/http.js";
import { assertString } from "../lib/contracts.js";
import { getOrAssignNextStimulus } from "../lib/dynamo.js";
import { isoFromMs, nowMs } from "../lib/time.js";
export async function handler(event) {
    try {
        const body = parseBody(event.body);
        const session_id = assertString(body.session_id, "session_id");
        const stimulus = await getOrAssignNextStimulus(session_id, undefined, isoFromMs(nowMs()));
        return json(200, stimulus);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return json(400, { error: message });
    }
}
