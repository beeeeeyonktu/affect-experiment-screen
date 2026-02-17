import { PRACTICE_RUNS } from "../config.js";

function getModality(state) {
  return state.input_modality || "hold";
}

function getPracticeInstruction(modality) {
  if (modality === "click_mark") {
    return "This is a practice run. Press Space at the moment your emotional understanding of the situation starts to shift.";
  }
  if (modality === "toggle_state") {
    return "This is a practice run. Press Space when your sense of the situation becomes unstable, then press again when it settles.";
  }
  if (modality === "popup_state") {
    return "This is a practice run. Press Space when your emotional understanding shifts, then choose the state in the popup.";
  }
  return "This is a practice run. Hold Space while your sense of the situation feels unstable, and release when it settles.";
}

export function renderPracticeView(root, { state, saveLocal, setUiStep, render, runtime }) {
  const idx = state.practice_index;
  const currentNumber = idx + 1;
  const modality = getModality(state);

  root.innerHTML = `
    <style>
      .practiceSurface {
        position: relative;
      }
      .practiceClickDot {
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
      .practiceClickDot.active {
        opacity: 0.9;
        transform: scale(1.5);
      }
      .practiceModalBackdrop {
        display: none;
        position: absolute;
        inset: 0;
        background: rgba(246, 246, 239, 0.82);
        align-items: center;
        justify-content: center;
        z-index: 5;
        border-radius: 10px;
      }
      .practiceModalBackdrop.open {
        display: flex;
      }
      .practiceModal {
        width: min(460px, 90%);
        border: 1px solid #ddd9cc;
        border-radius: 12px;
        padding: 14px 16px;
        background: #fff;
        box-shadow: 0 8px 20px rgba(32, 34, 39, 0.12);
      }
      .practiceModal legend {
        font-weight: 700;
        margin-bottom: 8px;
      }
      .practiceModal fieldset {
        border: 0;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }
      .practiceModal label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.98rem;
      }
      .practiceModalHint {
        margin: 8px 0 0 0;
        color: #555;
        font-size: 0.92rem;
      }
    </style>
    <div class="practiceSurface">
      <p><strong>Instructions:</strong> ${getPracticeInstruction(modality)}</p>
      <p class="muted">Practice ${currentNumber} of ${PRACTICE_RUNS}</p>
      <div id="practiceText" style="line-height:1.9;min-height:180px;"></div>

    <div id="practiceTogglePanel" style="display:none;margin:10px 0;padding:6px 0;text-align:center;">
      <div style="width:250px;max-width:70vw;height:62px;overflow:hidden;margin:0 auto;">
        <img id="practiceToggleFace" src="/graphics/straight.png" alt="" style="display:block;width:100%;height:auto;transform:translateY(-6px);" />
      </div>
      <p id="practiceToggleText" style="margin:2px 0 0 0;font-weight:400;"></p>
    </div>

    <div id="practicePopupPanel" class="practiceModalBackdrop" aria-hidden="true">
      <div class="practiceModal" role="dialog" aria-modal="true" aria-label="Select current emotional state">
        <form id="practicePopupStateForm">
          <fieldset>
            <legend>Select one:</legend>
            <label>
              <input type="radio" name="practicePopupState" value="mistake" />
              false alarm (no shift)
            </label>
            <label>
              <input type="radio" name="practicePopupState" value="uncertain" />
              shift noticed, still unstable
            </label>
            <label>
              <input type="radio" name="practicePopupState" value="clear" />
              shift noticed, now stable
            </label>
          </fieldset>
          <p id="practicePopupStateHint" class="practiceModalHint"></p>
        </form>
      </div>
    </div>

      <div id="practiceModeControls" style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;"></div>
      <div id="practiceClickDot" class="practiceClickDot" aria-hidden="true"></div>

      <p class="muted" id="practiceFeedback">${state.practice_feedback || ""}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="startPractice">Start Practice Text</button>
        <button id="changeSpeed">Change Text Speed</button>
        <button id="backIntro">Back to Instructions</button>
      </div>
      <p class="muted" style="margin-top:10px;">Practice complete: ${state.practice_passed.filter(Boolean).length}/${PRACTICE_RUNS}</p>
    </div>
  `;

  const textEl = root.querySelector("#practiceText");
  const feedbackEl = root.querySelector("#practiceFeedback");
  const startBtn = root.querySelector("#startPractice");
  const popupPanel = root.querySelector("#practicePopupPanel");
  const popupStateForm = root.querySelector("#practicePopupStateForm");
  const popupStateHint = root.querySelector("#practicePopupStateHint");
  const togglePanel = root.querySelector("#practiceTogglePanel");
  const toggleFace = root.querySelector("#practiceToggleFace");
  const toggleText = root.querySelector("#practiceToggleText");
  const clickDot = root.querySelector("#practiceClickDot");

  const applyPracticeControls = () => {
    const running = Boolean(state.practice_active);
    const recentClick = Date.now() - (state.practice_last_click_mark_ms || 0) < 320;
    togglePanel.style.display = modality === "toggle_state" ? "block" : "none";
    clickDot.style.display = modality === "click_mark" && running ? "block" : "none";
    clickDot.classList.toggle("active", modality === "click_mark" && running && recentClick);

    if (modality === "toggle_state") {
      const unstable = Boolean(state.practice_holding);
      if (unstable) {
        toggleFace.src = "/graphics/squiggle.png";
        toggleText.textContent = "emotional sense is unstable";
      } else {
        toggleFace.src = "/graphics/straight.png";
        toggleText.textContent = "emotional sense is stable";
      }
    }

    if (modality === "popup_state" && state.practice_popup_pending && running) {
      popupPanel.classList.add("open");
      popupPanel.setAttribute("aria-hidden", "false");
    } else {
      popupPanel.classList.remove("open");
      popupPanel.setAttribute("aria-hidden", "true");
    }
  };

  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const submitPracticePopupState = async (label) => {
    for (const el of popupStateForm.querySelectorAll('input[name="practicePopupState"]')) {
      el.disabled = true;
    }
    popupStateHint.textContent = "saved. continuing...";
    runtime.setPracticePopupState(label);
    await pause(320);
    popupStateForm.reset();
    for (const el of popupStateForm.querySelectorAll('input[name="practicePopupState"]')) {
      el.disabled = false;
    }
    popupStateHint.textContent = "";
    applyPracticeControls();
  };

  popupStateForm.onchange = (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== "practicePopupState") return;
    submitPracticePopupState(target.value);
  };

  applyPracticeControls();

  startBtn.onclick = async () => {
    startBtn.disabled = true;
    feedbackEl.textContent = "";
    state.practice_feedback = "";
    saveLocal();
    let syncTimer = null;

    try {
      applyPracticeControls();
      syncTimer = setInterval(() => applyPracticeControls(), 120);
      const passed = await runtime.runPractice(textEl);
      clearInterval(syncTimer);
      applyPracticeControls();
      if (passed) {
        state.practice_passed[idx] = true;
        state.practice_feedback = "Practice completed successfully.";
        saveLocal();
        if (idx < PRACTICE_RUNS - 1) {
          state.practice_index += 1;
          state.practice_feedback = "";
          saveLocal();
          render();
          return;
        }
        if (state.practice_passed.every(Boolean)) {
          state.practice_feedback = "";
          saveLocal();
          setUiStep("main");
          return;
        }
      } else {
        state.practice_passed[idx] = false;
        state.practice_feedback = "Please redo this practice text and use the same interaction pattern shown in this mode.";
      }
      saveLocal();
      render();
    } catch (error) {
      if (syncTimer) clearInterval(syncTimer);
      feedbackEl.textContent = error instanceof Error ? error.message : "Practice failed";
      startBtn.disabled = false;
      applyPracticeControls();
    }
  };

  root.querySelector("#changeSpeed").onclick = () => {
    state.return_step_after_calibration = "practice";
    saveLocal();
    setUiStep("calibration");
  };

  root.querySelector("#backIntro").onclick = () => {
    setUiStep("intro");
  };
}
