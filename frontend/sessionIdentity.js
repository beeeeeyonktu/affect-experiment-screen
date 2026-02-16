function uuid() {
  return crypto.randomUUID();
}

function getOrCreateDevClaims() {
  const key = "affect_dev_claims";
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.PROLIFIC_PID && parsed.STUDY_ID && parsed.SESSION_ID) return parsed;
    } catch {
      // regenerate below
    }
  }

  const claims = {
    PROLIFIC_PID: `dev_pid_${uuid().slice(0, 8)}`,
    STUDY_ID: "dev_study",
    SESSION_ID: `dev_${Date.now()}`
  };
  localStorage.setItem(key, JSON.stringify(claims));
  return claims;
}

export function extractSecuredToken(params) {
  const prolificToken = params.get("prolific_token");
  if (prolificToken) return prolificToken;

  const prolificPid = params.get("PROLIFIC_PID") || params.get("prolific_pid");
  const studyId = params.get("STUDY_ID") || params.get("study_id");
  const sessionId = params.get("SESSION_ID") || params.get("session_id");
  if (prolificPid && studyId && sessionId) {
    return JSON.stringify({
      PROLIFIC_PID: prolificPid,
      STUDY_ID: studyId,
      SESSION_ID: sessionId
    });
  }

  const devJwt = params.get("dev_jwt");
  if (devJwt) return devJwt;
  if (params.get("dev") === "1") return JSON.stringify(getOrCreateDevClaims());

  throw new Error("Missing Prolific token. Access this study from Prolific or use ?dev=1 for local simulation.");
}

export function deriveEntryKey(params) {
  const prolificPid = params.get("PROLIFIC_PID") || params.get("prolific_pid");
  const studyId = params.get("STUDY_ID") || params.get("study_id");
  const sessionId = params.get("SESSION_ID") || params.get("session_id");
  if (prolificPid && studyId && sessionId) {
    return `ids:${prolificPid}|${studyId}|${sessionId}`;
  }
  const prolificToken = params.get("prolific_token");
  if (prolificToken) return `token:${prolificToken}`;
  const devJwt = params.get("dev_jwt");
  if (devJwt) return `devjwt:${devJwt}`;
  if (params.get("dev") === "1") return "dev:auto";
  return null;
}
