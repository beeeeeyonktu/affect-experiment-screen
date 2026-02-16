import { api } from "./api.js";
import { getUnsentEvents, markSent, putOutboxEvent } from "./outbox.js";
import { deriveEntryKey, extractSecuredToken } from "./sessionIdentity.js";
import { establishUiStep, loadLocal, resetForNewEntry, saveLocal, state } from "./state.js";
import { createExperimentRuntime } from "./experimentRuntime.js";
import { renderCalibrationView } from "./views/calibrationView.js";
import { renderEndView } from "./views/endView.js";
import { renderIntroView } from "./views/introView.js";
import { renderMainTaskView } from "./views/mainTaskView.js";
import { renderAnnotationView } from "./views/annotationView.js";
import { renderPracticeView } from "./views/practiceView.js";

const runtime = createExperimentRuntime({
  state,
  saveLocal,
  api,
  getUnsentEvents,
  markSent,
  putOutboxEvent
});

function setUiStep(step) {
  state.ui_step = step;
  saveLocal();
  render();
}

async function initializeSessionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const incomingEntryKey = deriveEntryKey(params);

  if (incomingEntryKey) {
    const hasActiveSession = Boolean(state.session_id && state.lease_token);
    const sameEntry = state.entry_key === incomingEntryKey;
    if (hasActiveSession && !sameEntry) {
      resetForNewEntry();
    }
    state.entry_key = incomingEntryKey;
  }

  if (state.session_id && state.lease_token) return;

  const securedToken = extractSecuredToken(params);
  const out = await api.sessionStart(securedToken);
  state.session_id = out.session_id;
  state.lease_token = out.lease_token;
  state.stage = out.stage;
  saveLocal();
}

function render() {
  const root = document.querySelector("#route");
  const viewCtx = {
    state,
    saveLocal,
    setUiStep,
    render,
    runtime,
    api
  };

  if (state.ui_step === "intro") return renderIntroView(root, viewCtx);
  if (state.ui_step === "calibration") return renderCalibrationView(root, viewCtx);
  if (state.ui_step === "practice") return renderPracticeView(root, viewCtx);
  if (state.ui_step === "main") return renderMainTaskView(root, viewCtx);
  if (state.ui_step === "annotate") return renderAnnotationView(root, viewCtx);
  return renderEndView(root, viewCtx);
}

async function main() {
  loadLocal();
  await initializeSessionFromUrl();

  establishUiStep();
  saveLocal();

  runtime.startHeartbeat();
  runtime.installLifecycleFlush();

  document.addEventListener("keydown", runtime.onKeyDown);
  document.addEventListener("keyup", runtime.onKeyUp);

  if (!state.flushTimer) {
    state.flushTimer = setInterval(() => {
      runtime.flushEvents().catch(() => {});
    }, 3000);
  }

  render();
}

main().catch((e) => {
  document.querySelector("#route").textContent = `Initialization failed: ${e.message}`;
});
