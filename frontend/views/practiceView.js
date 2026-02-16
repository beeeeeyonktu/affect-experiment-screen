import { PRACTICE_RUNS } from "../config.js";

export function renderPracticeView(root, { state, saveLocal, setUiStep, render, runtime }) {
  const idx = state.practice_index;
  const currentNumber = idx + 1;

  root.innerHTML = `
    <p><strong>Instructions:</strong> This is a practice run. Use <kbd>Space</kbd> in the same way as the real task.</p>
    <p class="muted">Practice ${currentNumber} of ${PRACTICE_RUNS}</p>
    <div id="practiceText" style="line-height:1.9;min-height:180px;"></div>
    <p class="muted" id="practiceFeedback">${state.practice_feedback || ""}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="startPractice">Start Practice Text</button>
      <button id="changeSpeed">Change Text Speed</button>
      <button id="backIntro">Back to Instructions</button>
    </div>
    <p class="muted" style="margin-top:10px;">Practice complete: ${state.practice_passed.filter(Boolean).length}/${PRACTICE_RUNS}</p>
  `;

  const textEl = root.querySelector("#practiceText");
  const feedbackEl = root.querySelector("#practiceFeedback");
  const startBtn = root.querySelector("#startPractice");

  startBtn.onclick = async () => {
    startBtn.disabled = true;
    feedbackEl.textContent = "";
    state.practice_feedback = "";
    saveLocal();

    try {
      const passed = await runtime.runPractice(textEl);
      if (passed) {
        state.practice_passed[idx] = true;
        state.practice_feedback = "Practice completed. Good use of the space bar.";
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
        state.practice_feedback = "Please redo this practice text and use the space bar when your internal feeling is uncertain.";
      }
      saveLocal();
      render();
    } catch (error) {
      feedbackEl.textContent = error instanceof Error ? error.message : "Practice failed";
      startBtn.disabled = false;
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
