import { api } from "./api.js";
import { getUnsentEvents, markSent, putOutboxEvent } from "./outbox.js";

const SPEED_GROUPS = {
  slow: 420,
  medium: 300,
  fast: 220
};

const state = {
  session_id: null,
  lease_token: null,
  calibration_group: null,
  ms_per_word: null,
  stimulus_category: null,
  stimulus_id: null,
  stimulus_text: null,
  run_id: null,
  client_event_seq: 1,
  currentWordIndex: -1,
  holding: null,
  eventBuffer: [],
  flushTimer: null,
  heartbeatTimer: null,
  stage: "calibration"
};

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
      // fall through and regenerate
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

function saveLocal() {
  localStorage.setItem("affect_session_state", JSON.stringify(state));
}

function loadLocal() {
  const raw = localStorage.getItem("affect_session_state");
  if (!raw) return;
  const parsed = JSON.parse(raw);
  Object.assign(state, parsed);

  if (typeof state.run_id !== "string") state.run_id = null;
  if (typeof state.client_event_seq !== "number" || !Number.isFinite(state.client_event_seq)) {
    state.client_event_seq = 1;
  }

  // Refresh policy: always ask backend for next stimulus after reload.
  // Backend will keep unseen assignments, and mark seen-but-incomplete as interrupted.
  state.stimulus_id = null;
  state.stimulus_text = null;
}

async function appendEvent(ev) {
  if (!ev.session_id || !ev.run_id || !ev.stimulus_id) return;
  state.eventBuffer.push(ev);
  await putOutboxEvent(ev);
  saveLocal();
  if (state.eventBuffer.length >= 30) await flushEvents();
}

function makeBaseEvent(type) {
  return {
    session_id: state.session_id,
    run_id: state.run_id,
    stimulus_id: state.stimulus_id,
    client_event_seq: state.client_event_seq++,
    type,
    t_rel_ms: performance.now(),
    t_epoch_client_ms: Date.now()
  };
}

async function emitLifecycle(type) {
  if (!state.run_id) return;
  const ev = makeBaseEvent(type);
  await appendEvent(ev);
}

async function onKeyDown(e) {
  if (e.code !== "Space") return;
  if (!state.run_id || !state.session_id || !state.stimulus_id) return;
  e.preventDefault();
  if (state.holding) return;

  const hold_id = uuid();
  state.holding = { hold_id, start_word_index: state.currentWordIndex };
  await appendEvent({
    ...makeBaseEvent("KEYDOWN"),
    hold_id,
    start_word_index: state.currentWordIndex
  });
}

async function closeHold(auto_closed = false) {
  if (!state.holding) return;
  if (!state.run_id || !state.session_id || !state.stimulus_id) return;
  const { hold_id } = state.holding;
  state.holding = null;

  await appendEvent({
    ...makeBaseEvent("KEYUP"),
    hold_id,
    end_word_index: state.currentWordIndex,
    auto_closed
  });
}

async function onKeyUp(e) {
  if (e.code !== "Space") return;
  e.preventDefault();
  await closeHold(false);
}

async function flushEvents(forceKeepalive = false) {
  if (!state.session_id) return;

  const unsent = await getUnsentEvents(state.session_id, 50);
  if (!unsent.length) return;

  const byRun = new Map();
  for (const ev of unsent) {
    if (!byRun.has(ev.run_id)) byRun.set(ev.run_id, []);
    byRun.get(ev.run_id).push(ev);
  }

  for (const [runId, events] of byRun.entries()) {
    const payload = events.map(({ sent, ...x }) => x);
    const ack = await api.eventsBatch(state.session_id, runId, payload, forceKeepalive);
    await markSent(state.session_id, runId, ack.acked_client_event_seq);
  }
  state.eventBuffer = [];
  saveLocal();
}

function revealWords(textEl, words, msPerWord) {
  return new Promise((resolve) => {
    textEl.textContent = "";
    state.currentWordIndex = -1;
    let i = 0;
    const timer = setInterval(() => {
      if (i >= words.length) {
        clearInterval(timer);
        resolve(undefined);
        return;
      }
      state.currentWordIndex = i;
      textEl.textContent += (i === 0 ? "" : " ") + words[i];
      i += 1;
    }, msPerWord);
  });
}

async function startRun(textEl) {
  if (!state.stimulus_text || !state.stimulus_id) {
    throw new Error("Stimulus has not been loaded yet");
  }

  state.run_id = uuid();
  state.client_event_seq = 1;
  saveLocal();

  await emitLifecycle("RUN_START");
  await emitLifecycle("REVEAL_START");

  const words = state.stimulus_text.split(/\s+/);
  await revealWords(textEl, words, state.ms_per_word);

  await closeHold(true);
  await emitLifecycle("REVEAL_END");
  await flushEvents();
}

function startHeartbeat() {
  if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
  state.heartbeatTimer = setInterval(async () => {
    try {
      const out = await api.heartbeat(state.session_id, state.lease_token);
      if (out.active_elsewhere) {
        alert("Session became active on another device. This window will stop.");
        window.location.reload();
      }
    } catch {
      // keep retrying; offline tolerance
    }
  }, 15000);
}

function installLifecycleFlush() {
  window.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "hidden") {
      await emitLifecycle("VISIBILITY_HIDDEN");
      await closeHold(true);
      await flushEvents(true);
    }
  });

  window.addEventListener("blur", async () => {
    await emitLifecycle("BLUR");
    await closeHold(true);
    await flushEvents(true);
  });

  window.addEventListener("pagehide", async () => {
    await flushEvents(true);
  });

  window.addEventListener("beforeunload", async () => {
    await flushEvents(true);
  });
}

function renderCalibration(root) {
  root.innerHTML = `
    <p class="muted">Select the reading speed that feels most comfortable.</p>
    <div>
      <span class="pill" data-speed="slow">Slow</span>
      <span class="pill" data-speed="medium">Medium</span>
      <span class="pill" data-speed="fast">Fast</span>
    </div>
    <p id="speedValue" class="muted"></p>
    <button id="confirmCalibration">Confirm and Continue</button>
  `;

  let selected = state.calibration_group || "medium";
  const pills = [...root.querySelectorAll(".pill")];
  const value = root.querySelector("#speedValue");
  const paint = () => {
    pills.forEach((p) => p.classList.toggle("selected", p.dataset.speed === selected));
    value.textContent = `${selected} (${SPEED_GROUPS[selected]} ms/word)`;
  };

  pills.forEach((p) => {
    p.onclick = () => {
      selected = p.dataset.speed;
      paint();
    };
  });
  paint();

  root.querySelector("#confirmCalibration").onclick = async () => {
    state.calibration_group = selected;
    state.ms_per_word = SPEED_GROUPS[selected];
    state.stage = "experiment";
    saveLocal();
    render();
  };
}

function renderExperiment(root) {
  root.innerHTML = `
    <p><strong>Instructions:</strong> Press and hold <kbd>Space</kbd> while uncertain about affective change. Release when your model updates.</p>
    <p class="muted">Please avoid refreshing or closing this page during a text.</p>
    <div id="text"></div>
    <p class="muted" id="status">Preparing...</p>
    <button id="startBtn">Start Stimulus</button>
  `;

  const textEl = root.querySelector("#text");
  const status = root.querySelector("#status");

  root.querySelector("#startBtn").onclick = async () => {
    status.textContent = "Flushing unsent events...";
    await flushEvents();

    if (!state.stimulus_text || !state.stimulus_id) {
      status.textContent = "Loading stimulus...";
      const next = await api.stimulusNext(state.session_id, state.stimulus_category);
      if (next.done) {
        status.textContent = "All assigned stimuli are complete.";
        return;
      }
      state.stimulus_id = next.stimulus_id;
      state.stimulus_text = next.text;
      saveLocal();
    }

    status.textContent = "Running...";
    await startRun(textEl);

    status.textContent = "Stimulus complete. Events uploaded.";
    state.stimulus_id = null;
    state.stimulus_text = null;
    saveLocal();
  };
}

async function bootstrapSession() {
  if (state.session_id && state.lease_token) return;

  const params = new URLSearchParams(window.location.search);
  state.stimulus_category = params.get("category") || state.stimulus_category;
  const devJwt = params.get("dev_jwt") || JSON.stringify(getOrCreateDevClaims());

  const out = await api.sessionStart(devJwt);
  state.session_id = out.session_id;
  state.lease_token = out.lease_token;
  state.stage = out.stage;
  saveLocal();
}

function render() {
  const root = document.querySelector("#route");
  if (state.stage === "calibration") return renderCalibration(root);
  return renderExperiment(root);
}

async function main() {
  loadLocal();
  await bootstrapSession();
  startHeartbeat();

  installLifecycleFlush();
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  if (!state.flushTimer) {
    state.flushTimer = setInterval(() => {
      flushEvents().catch(() => {});
    }, 3000);
  }

  render();
}

main().catch((e) => {
  document.querySelector("#route").textContent = `Initialization failed: ${e.message}`;
});
