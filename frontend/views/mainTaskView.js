import { MAIN_RUNS } from "../config.js";

function getModality(state) {
  return state.input_modality || "hold";
}

function getInstruction(modality) {
  if (modality === "click_mark") {
    return "This is the actual task. Press Space at the moment your emotional understanding of the situation starts to shift.";
  }
  if (modality === "toggle_state") {
    return "This is the actual task. Press Space when your sense of the situation becomes unstable, then press Space again when it settles.";
  }
  if (modality === "popup_state") {
    return "This is the actual task. Press Space when your emotional understanding shifts, then choose the state in the popup.";
  }
  return "This is the actual task. Hold Space whenever your internal feeling is uncertain. Release when it feels clear again.";
}

export function renderMainTaskView(root, { state, saveLocal, setUiStep, render, runtime, api }) {
  const runNumber = Math.min(state.main_completed + 1, MAIN_RUNS);
  const modality = getModality(state);

  root.innerHTML = `
    <style>
      .taskSurface {
        position: relative;
      }
      .clickMarkDot {
        display: none;
        position: absolute;
        right: 14px;
        bottom: 14px;
        width: 14px;
        height: 14px;
        border-radius: 999px;
        background: #1f2937;
        opacity: 0.28;
        transform: scale(1);
        transition: transform 240ms ease, opacity 240ms ease;
        pointer-events: none;
      }
      .clickMarkDot.active {
        opacity: 0.9;
        transform: scale(1.5);
      }
      .stateModalBackdrop {
        display: none;
        position: absolute;
        inset: 0;
        background: rgba(246, 246, 239, 0.82);
        align-items: center;
        justify-content: center;
        z-index: 5;
        border-radius: 10px;
      }
      .stateModalBackdrop.open {
        display: flex;
      }
      .stateModal {
        width: min(460px, 90%);
        border: 1px solid #ddd9cc;
        border-radius: 12px;
        padding: 14px 16px;
        background: #fff;
        box-shadow: 0 8px 20px rgba(32, 34, 39, 0.12);
      }
      .stateModal legend {
        font-weight: 700;
        margin-bottom: 8px;
      }
      .stateModal fieldset {
        border: 0;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }
      .stateModal label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.98rem;
      }
      .stateModalHint {
        margin: 8px 0 0 0;
        color: #555;
        font-size: 0.92rem;
      }
    </style>
    <div class="taskSurface">
      <p><strong>Instructions:</strong> ${getInstruction(modality)}</p>
      <p class="muted">Text ${runNumber} of ${MAIN_RUNS}</p>
      <div id="mainLoader" class="loaderWrap" hidden><div class="loaderBar"></div></div>
      <div id="text" style="line-height:1.9;min-height:220px;"></div>

    <div id="popupPanel" class="stateModalBackdrop" aria-hidden="true">
      <div class="stateModal" role="dialog" aria-modal="true" aria-label="Select current emotional state">
        <form id="popupStateForm">
          <fieldset>
            <legend>Select one:</legend>
            <label>
              <input type="radio" name="popupState" value="mistake" />
              false alarm (no shift)
            </label>
            <label>
              <input type="radio" name="popupState" value="uncertain" />
              shift noticed, still unstable
            </label>
            <label>
              <input type="radio" name="popupState" value="clear" />
              shift noticed, now stable
            </label>
          </fieldset>
          <p id="popupStateHint" class="stateModalHint"></p>
        </form>
      </div>
    </div>

    <div id="toggleStatePanel" style="display:none;margin-top:12px;padding:6px 0;text-align:center;">
      <div style="width:260px;max-width:72vw;height:64px;overflow:hidden;margin:0 auto;">
        <img id="toggleStateGraphic" src="/graphics/straight.png" alt="" style="display:block;width:100%;height:auto;transform:translateY(-6px);" />
      </div>
      <p id="toggleStateText" style="margin:0 0 10px 0;font-weight:400;font-size:1.05rem;"></p>
    </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap; margin-top:10px;">
        <button id="startMain" ${state.main_running || state.main_completed >= MAIN_RUNS ? "disabled" : ""}>Start Text</button>
      </div>
      <div id="clickMarkDot" class="clickMarkDot" aria-hidden="true"></div>
      <p id="mainError" class="muted" style="color:#9b1c1c;"></p>
    </div>
  `;

  const textEl = root.querySelector("#text");
  const loader = root.querySelector("#mainLoader");
  const startBtn = root.querySelector("#startMain");
  const popupPanel = root.querySelector("#popupPanel");
  const popupStateForm = root.querySelector("#popupStateForm");
  const popupStateHint = root.querySelector("#popupStateHint");
  const toggleStatePanel = root.querySelector("#toggleStatePanel");
  const toggleStateGraphic = root.querySelector("#toggleStateGraphic");
  const toggleStateText = root.querySelector("#toggleStateText");
  const clickMarkDot = root.querySelector("#clickMarkDot");
  const errEl = root.querySelector("#mainError");

  const setError = (msg) => {
    errEl.textContent = msg || "";
  };

  const applyModalityControls = () => {
    const running = Boolean(state.main_running);
    const recentClick = Date.now() - (state.last_click_mark_ms || 0) < 320;
    clickMarkDot.style.display = modality === "click_mark" && running ? "block" : "none";
    clickMarkDot.classList.toggle("active", modality === "click_mark" && running && recentClick);

    if (modality === "toggle_state") {
      const uncertain = Boolean(state.toggle_holding);
      toggleStatePanel.style.display = "block";
      if (uncertain) {
        toggleStateGraphic.src = "/graphics/squiggle.png";
        toggleStateText.textContent = "emotional sense is unstable";
      } else {
        toggleStateGraphic.src = "/graphics/straight.png";
        toggleStateText.textContent = "emotional sense is stable";
      }
    } else {
      toggleStatePanel.style.display = "none";
    }

    if (modality === "popup_state" && state.popup_pending && running) {
      popupPanel.classList.add("open");
      popupPanel.setAttribute("aria-hidden", "false");
    } else {
      popupPanel.classList.remove("open");
      popupPanel.setAttribute("aria-hidden", "true");
    }
  };

  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const submitPopupState = async (label) => {
    try {
      for (const el of popupStateForm.querySelectorAll('input[name="popupState"]')) {
        el.disabled = true;
      }
      popupStateHint.textContent = "saved. continuing...";
      await runtime.setPopupState(label);
      await pause(320);
      runtime.clearPopupPrompt();
      popupStateForm.reset();
      for (const el of popupStateForm.querySelectorAll('input[name="popupState"]')) {
        el.disabled = false;
      }
      popupStateHint.textContent = "";
      setError("");
      applyModalityControls();
    } catch (error) {
      for (const el of popupStateForm.querySelectorAll('input[name="popupState"]')) {
        el.disabled = false;
      }
      popupStateHint.textContent = "Could not save. choose again.";
      setError(error instanceof Error ? error.message : "Failed to set state");
    }
  };

  popupStateForm.onchange = (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== "popupState") return;
    submitPopupState(target.value);
  };

  applyModalityControls();

  startBtn.onclick = async () => {
    state.main_running = true;
    startBtn.disabled = true;
    setError("");
    loader.hidden = false;
    applyModalityControls();

    const syncTimer = setInterval(() => {
      applyModalityControls();
    }, 120);

    try {
      try {
        await runtime.flushEvents();
      } catch {
        // stale outbox should not block run start
      }

      if (!state.stimulus_text || !state.stimulus_id) {
        const next = await api.stimulusNext(state.session_id);
        if (next.done) {
          clearInterval(syncTimer);
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
      clearInterval(syncTimer);

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
      clearInterval(syncTimer);
      state.main_running = false;
      loader.hidden = true;
      saveLocal();
      setError(error instanceof Error ? error.message : "Failed to run text");
      startBtn.disabled = false;
      applyModalityControls();
    }
  };
}
