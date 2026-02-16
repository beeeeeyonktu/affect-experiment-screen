import { handler as adminResultsSummary } from "./handlers/adminResultsSummary.js";
import { handler as adminSessionDetail } from "./handlers/adminSessionDetail.js";
import { handler as calibrationSave } from "./handlers/calibrationSave.js";
import { handler as eventsBatch } from "./handlers/eventsBatch.js";
import { handler as ratingsSave } from "./handlers/ratingsSave.js";
import { handler as sessionComplete } from "./handlers/sessionComplete.js";
import { handler as sessionHeartbeat } from "./handlers/sessionHeartbeat.js";
import { handler as sessionStart } from "./handlers/sessionStart.js";
import { handler as stimulusNext } from "./handlers/stimulusNext.js";
import { json } from "./lib/http.js";

interface ApiGatewayEvent {
  rawPath: string;
  requestContext?: {
    http?: { method?: string };
    authorizer?: {
      jwt?: {
        claims?: Record<string, unknown>;
      };
    };
  };
  body?: string | null;
}

export async function handler(event: ApiGatewayEvent) {
  const method = event.requestContext?.http?.method || "GET";

  if (method === "POST" && event.rawPath.endsWith("/session/start")) {
    return sessionStart(event);
  }
  if (method === "POST" && event.rawPath.endsWith("/session/heartbeat")) {
    return sessionHeartbeat(event);
  }
  if (method === "POST" && event.rawPath.endsWith("/session/complete")) {
    return sessionComplete(event);
  }
  if (method === "POST" && event.rawPath.endsWith("/calibration/save")) {
    return calibrationSave(event);
  }
  if (method === "POST" && event.rawPath.endsWith("/events/batch")) {
    return eventsBatch(event);
  }
  if (method === "POST" && event.rawPath.endsWith("/ratings/save")) {
    return ratingsSave(event);
  }
  if (method === "POST" && event.rawPath.endsWith("/stimulus/next")) {
    return stimulusNext(event);
  }
  if (method === "POST" && event.rawPath.endsWith("/admin/results/summary")) {
    return adminResultsSummary(event);
  }
  if (method === "POST" && event.rawPath.endsWith("/admin/results/session")) {
    return adminSessionDetail(event);
  }

  return json(404, { error: "not found" });
}
