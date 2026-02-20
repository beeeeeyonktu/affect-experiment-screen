import { PRACTICE_RUNS } from "../config.js";

function getModality(state) {
  return state.input_modality || "hold";
}

function getPracticeInstruction(state, modality) {
  const fromCopy = state.copy_resolved?.task_instruction;
  if (typeof fromCopy === "string" && fromCopy.length > 0) return `Practice run: ${fromCopy}`;
  if (modality === "hold") return "Practice run: Press and hold Space when emotional state begins to change. Release when it settles.";
  if (modality === "click_mark") return "Practice run: Press Space once when emotional state begins to change.";
  if (modality === "toggle_state") return "Practice run: Press Space when emotional state starts changing, then press again when it settles.";
  if (modality === "popup_state") return "Practice run: Press Space when emotional state starts changing, then choose the current state in the popup.";
  return "Practice run: Follow the instructions for this session.";
}

export function renderPracticeView(root, { state, saveLocal, setUiStep, render, runtime }) {
  const idx = state.practice_index;
  const currentNumber = idx + 1;
  const modality = getModality(state);
  const instructionsLabel = state.copy_resolved?.instructions_label || "Instructions:";
  const selectOneLabel = state.copy_resolved?.select_one_label || "Select one:";
  const popupLabels = state.copy_resolved?.popup_labels || {
    mistake: "Press was a mistake",
    uncertain: "Emotional state starting to change",
    clear: "Emotional state settling"
  };
  const statusLabels = state.copy_resolved?.status_labels || {
    stable: "Emotional state: stable",
    changing: "Emotional state: changing"
  };
  const startButtonLabel = state.copy_resolved?.start_button || "Start Text";

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
      <p><strong>${instructionsLabel}</strong> ${getPracticeInstruction(state, modality)}</p>
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
            <legend>${selectOneLabel}</legend>
            <label>
              <input type="radio" name="practicePopupState" value="mistake" />
              ${popupLabels.mistake}
            </label>
            <label>
              <input type="radio" name="practicePopupState" value="uncertain" />
              ${popupLabels.uncertain}
            </label>
            <label>
              <input type="radio" name="practicePopupState" value="clear" />
              ${popupLabels.clear}
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
        <button id="startPractice">${startButtonLabel}</button>
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
    const showCornerDot = (modality === "click_mark" || modality === "hold") && running;
    const dotActive =
      (modality === "click_mark" && recentClick) || (modality === "hold" && Boolean(state.practice_holding));
    clickDot.style.display = showCornerDot ? "block" : "none";
    clickDot.classList.toggle("active", showCornerDot && dotActive);

    if (modality === "toggle_state") {
      const unstable = Boolean(state.practice_holding);
      if (unstable) {
        toggleFace.src = "/graphics/squiggle.png";
        toggleText.textContent = statusLabels.changing;
      } else {
        toggleFace.src = "/graphics/straight.png";
        toggleText.textContent = statusLabels.stable;
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
  const POPUP_RESUME_PAUSE_MS = 1400;
  const POPUP_MARK_VISIBLE_MS = 1600;

  const applyPracticePopupWordMarker = () => {
    const activeMarks = root.querySelectorAll(".iterWord--pressMark");
    activeMarks.forEach((el) => el.classList.remove("iterWord--pressMark"));
    if (modality !== "popup_state" || !state.practice_active) return;
    const markIndex = Number(state.practice_popup_mark_word_index);
    const markAgeMs = Date.now() - Number(state.practice_popup_marked_at_ms || 0);
    if (!Number.isInteger(markIndex) || markIndex < 0 || markAgeMs > POPUP_MARK_VISIBLE_MS) return;
    const marker = textEl.querySelector(`.iterWord[data-word-index="${markIndex}"]`);
    if (marker) marker.classList.add("iterWord--pressMark");
  };

  const submitPracticePopupState = async (label) => {
    for (const el of popupStateForm.querySelectorAll('input[name="practicePopupState"]')) {
      el.disabled = true;
    }
    popupStateHint.textContent = "saved. continuing...";
    runtime.setPracticePopupState(label);
    await pause(POPUP_RESUME_PAUSE_MS);
    popupStateForm.reset();
    for (const el of popupStateForm.querySelectorAll('input[name="practicePopupState"]')) {
      el.disabled = false;
    }
    popupStateHint.textContent = "";
    applyPracticeControls();
    applyPracticePopupWordMarker();
  };

  popupStateForm.onchange = (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== "practicePopupState") return;
    submitPracticePopupState(target.value);
  };

  applyPracticeControls();
  applyPracticePopupWordMarker();

  startBtn.onclick = async () => {
    startBtn.disabled = true;
    feedbackEl.textContent = "";
    state.practice_feedback = "";
    saveLocal();
    let syncTimer = null;

    try {
      applyPracticeControls();
      syncTimer = setInterval(() => {
        applyPracticeControls();
        applyPracticePopupWordMarker();
      }, 120);
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
