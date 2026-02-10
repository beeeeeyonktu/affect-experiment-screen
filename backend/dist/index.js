import { handler as eventsBatch } from "./handlers/eventsBatch.js";
import { handler as sessionHeartbeat } from "./handlers/sessionHeartbeat.js";
import { handler as sessionStart } from "./handlers/sessionStart.js";
import { handler as stimulusNext } from "./handlers/stimulusNext.js";
import { json } from "./lib/http.js";
export async function handler(event) {
    const method = event.requestContext?.http?.method || "GET";
    if (method === "POST" && event.rawPath.endsWith("/session/start")) {
        return sessionStart(event);
    }
    if (method === "POST" && event.rawPath.endsWith("/session/heartbeat")) {
        return sessionHeartbeat(event);
    }
    if (method === "POST" && event.rawPath.endsWith("/events/batch")) {
        return eventsBatch(event);
    }
    if (method === "POST" && event.rawPath.endsWith("/stimulus/next")) {
        return stimulusNext(event);
    }
    return json(404, { error: "not found" });
}
