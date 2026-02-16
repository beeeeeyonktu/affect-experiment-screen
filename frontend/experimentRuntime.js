import { PRACTICE_TEXTS } from "./config.js";

function uuid() {
  return crypto.randomUUID();
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
      t_rel_ms: performance.now(),
      t_epoch_client_ms: Date.now()
    };
  }

  async function emitLifecycle(type) {
    if (!state.run_id) return;
    const ev = makeBaseEvent(type);
    await appendEvent(ev);
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

  async function onKeyDown(e) {
    if (e.code !== "Space") return;

    if (state.ui_step === "practice" && state.practice_active) {
      e.preventDefault();
      if (state.practice_holding) return;
      state.practice_holding = {
        start_word_index: state.currentWordIndex,
        start_t_rel_ms: performance.now()
      };
      return;
    }

    if (!state.run_id || !state.session_id || !state.stimulus_id) return;
    e.preventDefault();
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
    await appendEvent({
      ...keydown
    });
  }

  async function closeMainHold(auto_closed = false) {
    if (!state.holding) return;
    if (!state.run_id || !state.session_id || !state.stimulus_id) return;
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

  async function onKeyUp(e) {
    if (e.code !== "Space") return;

    if (state.ui_step === "practice" && state.practice_active) {
      e.preventDefault();
      closePracticeHold(false);
      return;
    }

    e.preventDefault();
    await closeMainHold(false);
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

  function revealWords(textEl, words, msPerWord, onStep) {
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
        if (typeof onStep === "function") onStep(i, words.length);
      }, msPerWord);
    });
  }

  function evaluatePractice() {
    const valid = state.practice_holds.filter(
      (h) =>
        Number.isFinite(h.start_word_index) &&
        Number.isFinite(h.end_word_index) &&
        h.start_word_index >= 0 &&
        h.end_word_index >= h.start_word_index &&
        h.duration_ms >= 120
    );
    return valid.length >= 1;
  }

  async function runPractice(textEl) {
    state.practice_active = true;
    state.practice_holding = null;
    state.practice_holds = [];

    const words = PRACTICE_TEXTS[state.practice_index].split(/\s+/);
    await revealWords(textEl, words, state.ms_per_word);

    closePracticeHold(true);
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
    saveLocal();

    await emitLifecycle("RUN_START");
    await emitLifecycle("REVEAL_START");

    const words = state.stimulus_text.split(/\s+/);
    await revealWords(textEl, words, state.ms_per_word);

    await closeMainHold(true);
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
        await closeMainHold(true);
        await flushEvents(true);
      }
    });

    window.addEventListener("blur", async () => {
      await emitLifecycle("BLUR");
      await closeMainHold(true);
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
    installLifecycleFlush
  };
}
