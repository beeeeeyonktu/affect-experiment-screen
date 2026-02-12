import { MAIN_RUNS } from "../config.js";

export function renderMainTaskView(root, { state, saveLocal, setUiStep, render, runtime, api }) {
  const runNumber = Math.min(state.main_completed + 1, MAIN_RUNS);

  root.innerHTML = `
    <p><strong>Instructions:</strong> This is the actual task. Hold <kbd>Space</kbd> whenever your internal feeling is uncertain. Release when it feels clear again.</p>
    <p class="muted">Text ${runNumber} of ${MAIN_RUNS}</p>
    <div id="mainLoader" class="loaderWrap" hidden><div class="loaderBar"></div></div>
    <div id="text" style="line-height:1.9;min-height:220px;"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap; margin-top:10px;">
      <button id="startMain" ${state.main_running || state.main_ready_continue || state.main_completed >= MAIN_RUNS ? "disabled" : ""}>Start Text</button>
      <button id="continueMain" ${state.main_ready_continue ? "" : "disabled"}>${state.main_completed >= MAIN_RUNS ? "Finish" : "Continue"}</button>
    </div>
    <p id="mainError" class="muted" style="color:#9b1c1c;"></p>
  `;

  const textEl = root.querySelector("#text");
  const loader = root.querySelector("#mainLoader");
  const startBtn = root.querySelector("#startMain");
  const continueBtn = root.querySelector("#continueMain");
  const errEl = root.querySelector("#mainError");

  const lockControls = (locked) => {
    startBtn.disabled = locked || state.main_ready_continue || state.main_completed >= MAIN_RUNS;
    continueBtn.disabled = locked || !state.main_ready_continue;
  };

  startBtn.onclick = async () => {
    state.main_running = true;
    lockControls(true);
    errEl.textContent = "";
    loader.hidden = false;

    try {
      try {
        await runtime.flushEvents();
      } catch {
        // stale outbox should not block run start
      }

      if (!state.stimulus_text || !state.stimulus_id) {
        const next = await api.stimulusNext(state.session_id, state.stimulus_category);
        if (next.done) {
          state.main_completed = MAIN_RUNS;
          state.main_ready_continue = true;
          state.main_running = false;
          loader.hidden = true;
          saveLocal();
          render();
          return;
        }
        state.stimulus_id = next.stimulus_id;
        state.stimulus_text = next.text;
        saveLocal();
      }

      loader.hidden = true;
      await runtime.startMainRun(textEl);

      state.main_completed = Math.min(state.main_completed + 1, MAIN_RUNS);
      state.main_running = false;
      state.main_ready_continue = true;
      state.stimulus_id = null;
      state.stimulus_text = null;
      saveLocal();
      lockControls(false);
    } catch (error) {
      state.main_running = false;
      state.main_ready_continue = false;
      loader.hidden = true;
      saveLocal();
      errEl.textContent = error instanceof Error ? error.message : "Failed to run text";
      lockControls(false);
    }
  };

  continueBtn.onclick = () => {
    if (!state.main_ready_continue) return;
    if (state.main_completed >= MAIN_RUNS) {
      setUiStep("end");
      return;
    }
    state.main_ready_continue = false;
    saveLocal();
    render();
  };
}
