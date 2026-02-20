const API_BASE = window.__API_BASE__ || "/api";

async function req(path, body, keepalive = false) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
      keepalive
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "network request failed";
    throw new Error(`Network error calling ${path}: ${msg}`);
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status}: ${err}`);
  }
  return res.json();
}

export const api = {
  sessionStart: (secured_url_jwt, options = {}) =>
    req("/session/start", {
      secured_url_jwt,
      input_modality: options.input_modality,
      experiment_target_override: options.experiment_target_override
    }),
  heartbeat: (session_id, lease_token) => req("/session/heartbeat", { session_id, lease_token }),
  sessionComplete: (session_id, lease_token) => req("/session/complete", { session_id, lease_token }),
  calibrationSave: (session_id, lease_token, calibration_group, input_modality = "hold") =>
    req("/calibration/save", { session_id, lease_token, calibration_group, input_modality }),
  copyGet: (payload = {}) => req("/copy/get", payload),
  ratingsSave: (payload) => req("/ratings/save", payload),
  stimulusNext: (session_id) => req("/stimulus/next", { session_id }),
  eventsBatch: (session_id, run_id, events, keepalive = false) =>
    req("/events/batch", { session_id, run_id, events }, keepalive)
};
