import { PRACTICE_TEXTS } from "./config.js";

function uuid() {
  return crypto.randomUUID();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function modality(state) {
  return state.input_modality || "hold";
}

export function createExperimentRuntime({ state, saveLocal, api, getUnsentEvents, markSent, putOutboxEvent }) {
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
      input_modality: modality(state),
      t_rel_ms: performance.now(),
      t_epoch_client_ms: Date.now()
    };
  }

  async function emitLifecycle(type) {
    if (!state.run_id) return;
    await appendEvent(makeBaseEvent(type));
  }

  function closePracticeHold(autoClosed = false) {
    if (!state.practice_holding) return;
    const hold = state.practice_holding;
    state.practice_holding = null;
    state.practice_holds.push({
      start_word_index: hold.start_word_index,
      end_word_index: Math.max(state.currentWordIndex, hold.start_word_index),
      duration_ms: Math.max(0, performance.now() - hold.start_t_rel_ms),
      auto_closed: autoClosed
    });
  }

  function emitPracticeMark(state_label = null) {
    state.practice_holds.push({
      start_word_index: state.currentWordIndex,
      end_word_index: state.currentWordIndex,
      duration_ms: 0,
      auto_closed: false,
      state_label: state_label || undefined
    });
    state.practice_last_click_mark_ms = Date.now();
    saveLocal();
  }

  function togglePracticeUncertainty() {
    if (!state.practice_holding) {
      state.practice_holding = {
        start_word_index: state.currentWordIndex,
        start_t_rel_ms: performance.now()
      };
      saveLocal();
      return;
    }
    closePracticeHold(false);
    saveLocal();
  }

  function beginPracticePopupPrompt() {
    state.practice_popup_pending = true;
    state.practice_paused = true;
    saveLocal();
  }

  function clearPracticePopupPrompt() {
    state.practice_popup_pending = false;
    state.practice_paused = false;
    saveLocal();
  }

  function setPracticePopupState(state_label) {
    emitPracticeMark(state_label);
    clearPracticePopupPrompt();
  }

  async function emitHoldStart() {
    if (!state.run_id || !state.session_id || !state.stimulus_id) return;
    if (state.holding) return;
    const hold_id = uuid();
    const keydown = {
      ...makeBaseEvent("KEYDOWN"),
      hold_id,
      start_word_index: state.currentWordIndex
    };
    state.holding = {
      hold_id,
      start_word_index: state.currentWordIndex,
      start_t_rel_ms: keydown.t_rel_ms
    };
    await appendEvent(keydown);
  }

  async function emitHoldEnd(auto_closed = false) {
    if (!state.holding || !state.run_id || !state.session_id || !state.stimulus_id) return;
    const { hold_id, start_word_index, start_t_rel_ms } = state.holding;
    state.holding = null;
    const end_word_index = state.currentWordIndex;
    const keyup = {
      ...makeBaseEvent("KEYUP"),
      hold_id,
      start_word_index,
      start_t_rel_ms,
      end_word_index,
      auto_closed
    };
    await appendEvent(keyup);
    if (Array.isArray(state.current_run_holds)) {
      state.current_run_holds.push({
        hold_id,
        start_word_index,
        end_word_index,
        auto_closed
      });
    }
  }

  async function emitClickMark() {
    if (!state.run_id || !state.session_id || !state.stimulus_id) return;
    const hold_id = uuid();
    const ev = {
      ...makeBaseEvent("UNCERTAINTY_MARK"),
      hold_id,
      word_index: state.currentWordIndex
    };
    await appendEvent(ev);
    state.last_click_mark_ms = Date.now();
    if (Array.isArray(state.current_run_holds)) {
      state.current_run_holds.push({
        hold_id,
        start_word_index: state.currentWordIndex,
        end_word_index: state.currentWordIndex,
        auto_closed: false
      });
    }
  }

  async function toggleUncertaintyState() {
    if (!state.run_id || !state.session_id || !state.stimulus_id) return;
    if (!state.toggle_holding) {
      const hold_id = uuid();
      const startEv = {
        ...makeBaseEvent("UNCERTAINTY_START"),
        hold_id,
        start_word_index: state.currentWordIndex,
        word_index: state.currentWordIndex
      };
      state.toggle_holding = {
        hold_id,
        start_word_index: state.currentWordIndex,
        start_t_rel_ms: startEv.t_rel_ms
      };
      await appendEvent(startEv);
      return;
    }

    const { hold_id, start_word_index, start_t_rel_ms } = state.toggle_holding;
    state.toggle_holding = null;
    const end_word_index = state.currentWordIndex;
    const endEv = {
      ...makeBaseEvent("UNCERTAINTY_END"),
      hold_id,
      start_word_index,
      start_t_rel_ms,
      end_word_index,
      word_index: end_word_index
    };
    await appendEvent(endEv);
    if (Array.isArray(state.current_run_holds)) {
      state.current_run_holds.push({
        hold_id,
        start_word_index,
        end_word_index,
        auto_closed: false
      });
    }
  }

  async function setPopupState(state_label) {
    if (!state.run_id || !state.session_id || !state.stimulus_id) return;
    const hold_id = uuid();
    const ev = {
      ...makeBaseEvent("STATE_SET"),
      hold_id,
      word_index: state.currentWordIndex,
      state_label
    };
    await appendEvent(ev);
    if (Array.isArray(state.current_run_holds)) {
      state.current_run_holds.push({
        hold_id,
        start_word_index: state.currentWordIndex,
        end_word_index: state.currentWordIndex,
        auto_closed: false
      });
    }
  }

  function beginPopupPrompt() {
    state.popup_pending = true;
    state.main_paused = true;
    saveLocal();
  }

  function clearPopupPrompt() {
    state.popup_pending = false;
    state.main_paused = false;
    saveLocal();
  }

  async function closeMainIntervalsOnExit() {
    const m = modality(state);
    if (m === "hold") {
      await emitHoldEnd(true);
      return;
    }
    if (m === "toggle_state" && state.toggle_holding) {
      const { hold_id, start_word_index, start_t_rel_ms } = state.toggle_holding;
      state.toggle_holding = null;
      const end_word_index = state.currentWordIndex;
      const endEv = {
        ...makeBaseEvent("UNCERTAINTY_END"),
        hold_id,
        start_word_index,
        start_t_rel_ms,
        end_word_index,
        word_index: end_word_index
      };
      await appendEvent(endEv);
      if (Array.isArray(state.current_run_holds)) {
        state.current_run_holds.push({
          hold_id,
          start_word_index,
          end_word_index,
          auto_closed: true
        });
      }
    }
  }

  async function onKeyDown(e) {
    if (e.code !== "Space") return;

    if (state.ui_step === "practice" && state.practice_active) {
      e.preventDefault();
      const m = modality(state);
      if (m === "hold") {
        if (state.practice_holding) return;
        state.practice_holding = {
          start_word_index: state.currentWordIndex,
          start_t_rel_ms: performance.now()
        };
        return;
      }
      if (m === "click_mark") {
        emitPracticeMark();
        return;
      }
      if (m === "toggle_state") {
        togglePracticeUncertainty();
        return;
      }
      if (m === "popup_state" && !state.practice_popup_pending) {
        beginPracticePopupPrompt();
      }
      return;
    }

    if (!state.run_id || !state.session_id || !state.stimulus_id) return;
    e.preventDefault();
    const m = modality(state);

    if (m === "hold") {
      if (state.holding) return;
      await emitHoldStart();
      return;
    }
    if (m === "click_mark") {
      await emitClickMark();
      return;
    }
    if (m === "toggle_state") {
      await toggleUncertaintyState();
      return;
    }
    if (m === "popup_state") {
      if (!state.popup_pending) beginPopupPrompt();
    }
  }

  async function onKeyUp(e) {
    if (e.code !== "Space") return;

    if (state.ui_step === "practice" && state.practice_active) {
      e.preventDefault();
      if (modality(state) === "hold") {
        closePracticeHold(false);
      }
      return;
    }

    e.preventDefault();
    if (modality(state) === "hold") {
      await emitHoldEnd(false);
    }
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
      try {
        const ack = await api.eventsBatch(state.session_id, runId, payload, forceKeepalive);
        await markSent(state.session_id, runId, ack.acked_client_event_seq);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (
          msg.includes("stimulus not assigned to session") ||
          msg.includes("event session mismatch") ||
          msg.includes("event run mismatch") ||
          msg.includes("mixed stimulus in batch")
        ) {
          await markSent(
            state.session_id,
            runId,
            events.map((x) => x.client_event_seq)
          );
          continue;
        }
        throw error;
      }
    }

    state.eventBuffer = [];
    saveLocal();
  }

  async function revealWords(textEl, words, msPerWord, onStep) {
    textEl.textContent = "";
    state.currentWordIndex = -1;
    let i = 0;
    while (i < words.length) {
      while (state.main_paused) {
        await sleep(40);
      }
      while (state.practice_paused) {
        await sleep(40);
      }
      state.currentWordIndex = i;
      textEl.textContent += (i === 0 ? "" : " ") + words[i];
      i += 1;
      if (typeof onStep === "function") onStep(i, words.length);
      await sleep(msPerWord);
    }
  }

  function evaluatePractice() {
    const m = modality(state);
    const valid = state.practice_holds.filter((h) => {
      const validIndices =
        Number.isFinite(h.start_word_index) &&
        Number.isFinite(h.end_word_index) &&
        h.start_word_index >= 0 &&
        h.end_word_index >= h.start_word_index;
      if (!validIndices) return false;
      if (m === "hold" || m === "toggle_state") return h.duration_ms >= 120;
      return true;
    });
    return valid.length >= 1;
  }

  async function runPractice(textEl) {
    state.practice_active = true;
    state.practice_holding = null;
    state.practice_paused = false;
    state.practice_popup_pending = false;
    state.practice_holds = [];

    const words = PRACTICE_TEXTS[state.practice_index].split(/\s+/);
    await revealWords(textEl, words, state.ms_per_word);

    if (modality(state) === "hold" || modality(state) === "toggle_state") {
      closePracticeHold(true);
    }
    state.practice_paused = false;
    state.practice_popup_pending = false;
    state.practice_active = false;
    return evaluatePractice();
  }

  async function startMainRun(textEl) {
    if (!state.stimulus_text || !state.stimulus_id) throw new Error("Stimulus not loaded");
    if (typeof state.ms_per_word !== "number" || !Number.isFinite(state.ms_per_word) || state.ms_per_word <= 0) {
      throw new Error("Calibration not set");
    }

    state.run_id = uuid();
    state.client_event_seq = 1;
    state.current_run_holds = [];
    state.holding = null;
    state.toggle_holding = null;
    state.popup_pending = false;
    state.main_paused = false;
    saveLocal();

    await emitLifecycle("RUN_START");
    await emitLifecycle("REVEAL_START");

    const words = state.stimulus_text.split(/\s+/);
    await revealWords(textEl, words, state.ms_per_word);

    state.main_paused = false;
    state.popup_pending = false;
    await closeMainIntervalsOnExit();
    await emitLifecycle("REVEAL_END");
    await flushEvents();

    return {
      session_id: state.session_id,
      stimulus_id: state.stimulus_id,
      run_id: state.run_id,
      text: state.stimulus_text,
      holds: Array.isArray(state.current_run_holds) ? state.current_run_holds : []
    };
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
        // tolerate temporary disconnects
      }
    }, 15000);
  }

  function installLifecycleFlush() {
    window.addEventListener("visibilitychange", async () => {
      if (document.visibilityState === "hidden") {
        await emitLifecycle("VISIBILITY_HIDDEN");
        await closeMainIntervalsOnExit();
        await flushEvents(true);
      }
    });

    window.addEventListener("blur", async () => {
      await emitLifecycle("BLUR");
      await closeMainIntervalsOnExit();
      await flushEvents(true);
    });

    window.addEventListener("pagehide", async () => {
      await flushEvents(true);
    });

    window.addEventListener("beforeunload", async () => {
      await flushEvents(true);
    });
  }

  return {
    onKeyDown,
    onKeyUp,
    flushEvents,
    runPractice,
    startMainRun,
    startHeartbeat,
    installLifecycleFlush,
    emitClickMark,
    toggleUncertaintyState,
    beginPopupPrompt,
    clearPopupPrompt,
    setPopupState,
    emitPracticeMark,
    togglePracticeUncertainty,
    beginPracticePopupPrompt,
    clearPracticePopupPrompt,
    setPracticePopupState
  };
}
