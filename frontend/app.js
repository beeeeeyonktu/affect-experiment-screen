import { api } from "./api.js";
import { getUnsentEvents, markSent, putOutboxEvent } from "./outbox.js";
import { deriveEntryKey, extractSecuredToken } from "./sessionIdentity.js";
import { establishUiStep, loadLocal, resetForNewEntry, saveLocal, state } from "./state.js";
import { createExperimentRuntime } from "./experimentRuntime.js";
import { renderCalibrationView } from "./views/calibrationView.js";
import { renderDevStartView } from "./views/devStartView.js";
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
let runtimeBooted = false;

function bootRuntime() {
  if (runtimeBooted) return;
  runtimeBooted = true;
  runtime.startHeartbeat();
  runtime.installLifecycleFlush();
  document.addEventListener("keydown", runtime.onKeyDown);
  document.addEventListener("keyup", runtime.onKeyUp);
  if (!state.flushTimer) {
    state.flushTimer = setInterval(() => {
      runtime.flushEvents().catch(() => {});
    }, 3000);
  }
}

function setUiStep(step) {
  state.ui_step = step;
  saveLocal();
  render();
}

function updatePageHeading() {
  const h1 = document.querySelector("h1");
  if (!h1) return;
  const fromCopy = typeof state.copy_resolved?.target_title === "string" ? state.copy_resolved.target_title : "";
  if (fromCopy) {
    h1.textContent = fromCopy;
    return;
  }
  if (state.experiment_target === "character") {
    h1.textContent = "Tracking a Character's Emotional State";
    return;
  }
  if (state.experiment_target === "self") {
    h1.textContent = "Tracking Your Own Emotional State";
    return;
  }
  h1.textContent = "Affective Reading Task";
}

async function hydrateCopyForSession() {
  if (!state.session_id) return;
  const out = await api.copyGet({ session_id: state.session_id });
  state.copy_version = out.version || null;
  state.copy_resolved = out.resolved || null;
  state.copy_full = out.full || null;
  saveLocal();
}

async function initializeSessionFromUrl(options = {}, autoStart = true) {
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
  if (!autoStart) return;

  const securedToken = extractSecuredToken(params);
  const out = await api.sessionStart(securedToken, options);
  state.session_id = out.session_id;
  state.lease_token = out.lease_token;
  state.stage = out.stage;
  state.experiment_target = out.experiment_target || null;
  state.condition_id = out.condition_id || null;
  if (out.input_modality) state.input_modality = out.input_modality;
  saveLocal();
  await hydrateCopyForSession();
}

function render() {
  updatePageHeading();
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
  await initializeSessionFromUrl({}, false);
  const root = document.querySelector("#route");

  if (!state.session_id || !state.lease_token) {
    renderDevStartView(root, {
      onStart: async (opts) => {
        await initializeSessionFromUrl(opts);
        state.intro_index = 0;
        establishUiStep();
        saveLocal();
        bootRuntime();
        render();
      }
    });
    return;
  }

  try {
    await hydrateCopyForSession();
  } catch {
    // Continue with local fallback copy if backend copy is temporarily unavailable.
  }

  establishUiStep();
  saveLocal();
  bootRuntime();

  render();
}

main().catch((e) => {
  document.querySelector("#route").textContent = `Initialization failed: ${e.message}`;
});
