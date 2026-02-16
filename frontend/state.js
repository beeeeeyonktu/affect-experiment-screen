import { MAIN_RUNS, PRACTICE_RUNS } from "./config.js";

const STORAGE_KEY = "affect_session_state";

function createInitialState() {
  return {
    entry_key: null,
    session_id: null,
    lease_token: null,
    calibration_group: null,
    ms_per_word: null,

    stage: "calibration",
    ui_step: "intro",
    return_step_after_calibration: "practice",

    intro_index: 0,

    practice_index: 0,
    practice_passed: new Array(PRACTICE_RUNS).fill(false),
    practice_active: false,
    practice_holding: null,
    practice_holds: [],
    practice_feedback: "",

    main_completed: 0,
    main_running: false,
    main_ready_continue: false,
    annotation: null,

    stimulus_category: null,
    stimulus_id: null,
    stimulus_text: null,
    run_id: null,
    client_event_seq: 1,
    currentWordIndex: -1,
    holding: null,
    eventBuffer: [],
    flushTimer: null,
    heartbeatTimer: null
  };
}

export const state = createInitialState();

export function resetForNewEntry() {
  const fresh = createInitialState();
  Object.keys(state).forEach((k) => {
    delete state[k];
  });
  Object.assign(state, fresh);
}

export function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  const parsed = JSON.parse(raw);
  Object.assign(state, parsed);

  if (!Array.isArray(state.practice_passed) || state.practice_passed.length !== PRACTICE_RUNS) {
    state.practice_passed = new Array(PRACTICE_RUNS).fill(false);
  }
  if (typeof state.run_id !== "string") state.run_id = null;
  if (typeof state.client_event_seq !== "number" || !Number.isFinite(state.client_event_seq)) {
    state.client_event_seq = 1;
  }
  if (!["intro", "calibration", "practice", "main", "annotate", "end"].includes(state.ui_step)) {
    state.ui_step = "intro";
  }

  state.stimulus_id = null;
  state.stimulus_text = null;
  state.main_running = false;
  state.main_ready_continue = false;
  state.practice_active = false;
  state.practice_holding = null;
}

export function establishUiStep() {
  if (state.main_completed >= MAIN_RUNS) {
    state.ui_step = "end";
    return;
  }
  if (state.annotation && Array.isArray(state.annotation.holds) && state.annotation.holds.length > 0) {
    state.ui_step = "annotate";
    return;
  }
  if (state.practice_passed.every(Boolean)) {
    state.ui_step = "main";
    return;
  }
  if (state.calibration_group && state.ms_per_word) {
    state.ui_step = "practice";
    return;
  }
  state.ui_step = "intro";
}
