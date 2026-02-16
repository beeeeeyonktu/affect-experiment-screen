import { MAIN_RUNS } from "../config.js";

export function renderMainTaskView(root, { state, saveLocal, setUiStep, render, runtime, api }) {
  const runNumber = Math.min(state.main_completed + 1, MAIN_RUNS);

  root.innerHTML = `
    <p><strong>Instructions:</strong> This is the actual task. Hold <kbd>Space</kbd> whenever your internal feeling is uncertain. Release when it feels clear again.</p>
    <p class="muted">Text ${runNumber} of ${MAIN_RUNS}</p>
    <div id="mainLoader" class="loaderWrap" hidden><div class="loaderBar"></div></div>
    <div id="text" style="line-height:1.9;min-height:220px;"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap; margin-top:10px;">
      <button id="startMain" ${state.main_running || state.main_completed >= MAIN_RUNS ? "disabled" : ""}>Start Text</button>
    </div>
    <p id="mainError" class="muted" style="color:#9b1c1c;"></p>
  `;

  const textEl = root.querySelector("#text");
  const loader = root.querySelector("#mainLoader");
  const startBtn = root.querySelector("#startMain");
  const errEl = root.querySelector("#mainError");

  startBtn.onclick = async () => {
    state.main_running = true;
    startBtn.disabled = true;
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
          state.main_running = false;
          loader.hidden = true;
          saveLocal();
          setUiStep("end");
          return;
        }
        state.stimulus_id = next.stimulus_id;
        state.stimulus_text = next.text;
        saveLocal();
      }

      loader.hidden = true;
      const runOut = await runtime.startMainRun(textEl);
      state.main_running = false;

      const validHolds = (runOut.holds || []).filter(
        (s) =>
          typeof s.hold_id === "string" &&
          s.hold_id.length > 0 &&
          Number.isInteger(s.start_word_index) &&
          Number.isInteger(s.end_word_index) &&
          s.start_word_index >= 0 &&
          s.end_word_index >= s.start_word_index
      );

      if (validHolds.length > 0) {
        state.annotation = {
          stimulus_id: runOut.stimulus_id,
          run_id: runOut.run_id,
          text: runOut.text,
          holds: validHolds,
          active_index: 0,
          responses: []
        };
      } else {
        state.main_completed = Math.min(state.main_completed + 1, MAIN_RUNS);
      }

      state.stimulus_id = null;
      state.stimulus_text = null;
      saveLocal();

      if (state.annotation) {
        setUiStep("annotate");
        return;
      }
      if (state.main_completed >= MAIN_RUNS) {
        setUiStep("end");
        return;
      }
      render();
    } catch (error) {
      state.main_running = false;
      loader.hidden = true;
      saveLocal();
      errEl.textContent = error instanceof Error ? error.message : "Failed to run text";
      startBtn.disabled = false;
    }
  };
}
