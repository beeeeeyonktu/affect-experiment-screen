import { CALIBRATION_SAMPLE, SPEED_GROUPS } from "../config.js";

export function renderCalibrationView(root, { state, saveLocal, setUiStep, api }) {
  const selectedModality = state.input_modality || "hold";
  const instructionsLabel = state.copy_resolved?.instructions_label || "Instructions:";
  const calibrationPrompt =
    state.copy_resolved?.calibration_prompt ||
    "Try out the different reading speeds and select the one you find most comfortable.";
  const responseStyleLabel = state.copy_resolved?.response_style_label || "Response style for this session:";
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
  const continueLabel = state.copy_resolved?.continue_button || "Continue";

  root.innerHTML = `
    <style>
      .calibrationSurface {
        position: relative;
      }
      .calibrationModalBackdrop {
        display: none;
        position: absolute;
        inset: 0;
        background: rgba(246, 246, 239, 0.82);
        align-items: center;
        justify-content: center;
        z-index: 4;
        border-radius: 10px;
      }
      .calibrationModalBackdrop.open {
        display: flex;
      }
      .calibrationModal {
        width: min(460px, 90%);
        border: 1px solid #ddd9cc;
        border-radius: 12px;
        padding: 14px 16px;
        background: #fff;
        box-shadow: 0 8px 20px rgba(32, 34, 39, 0.12);
      }
      .calibrationModal legend {
        font-weight: 700;
        margin-bottom: 8px;
      }
      .calibrationModal fieldset {
        border: 0;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }
      .calibrationModal label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.98rem;
      }
      .calibrationModalHint {
        margin: 8px 0 0 0;
        color: #555;
        font-size: 0.92rem;
      }
    </style>
    <div class="calibrationSurface">
    <p><strong>${instructionsLabel}</strong> ${calibrationPrompt}</p>
    <div>
      <span class="pill" data-speed="slow">Slow</span>
      <span class="pill" data-speed="medium">Medium</span>
      <span class="pill" data-speed="fast">Fast</span>
    </div>
    <div id="calibrationText" style="line-height:1.8;min-height:120px;margin:12px 0"></div>
    <p class="muted" style="margin:8px 0 14px 0;">${responseStyleLabel} <strong>${selectedModality}</strong></p>
    <div id="clickCalibrationPreview" style="display:none;margin:8px 0 14px 0;padding:6px 0;text-align:center;">
      <div id="clickCalibrationDot" style="display:block;width:14px;height:14px;border-radius:999px;background:#1f2937;opacity:0.28;margin:0 auto;transform:scale(1);transition:transform 240ms ease,opacity 240ms ease;"></div>
    </div>
    <div id="toggleCalibrationPreview" style="display:none;margin:8px 0 14px 0;padding:6px 0;text-align:center;">
      <div style="width:250px;max-width:70vw;height:62px;overflow:hidden;margin:0 auto;">
        <img id="toggleCalibrationFace" src="/graphics/straight.png" alt="" style="display:block;width:100%;height:auto;transform:translateY(-6px);" />
      </div>
      <p id="toggleCalibrationText" style="margin:2px 0 0 0;font-weight:400;"></p>
      <p class="muted" style="margin:6px 0 0 0;">Press <kbd>Space</kbd> to switch state during this preview.</p>
    </div>
    <div id="popupCalibrationPreview" style="display:none;margin:8px 0 14px 0;padding:6px 0;">
      <p class="muted" style="margin:0;"></p>
    </div>
    <div id="calibrationPopupPanel" class="calibrationModalBackdrop" aria-hidden="true">
      <div class="calibrationModal" role="dialog" aria-modal="true" aria-label="Select current emotional state">
        <form id="calibrationPopupStateForm">
          <fieldset>
            <legend>${selectOneLabel}</legend>
            <label>
              <input type="radio" name="calibrationPopupState" value="mistake" />
              ${popupLabels.mistake}
            </label>
            <label>
              <input type="radio" name="calibrationPopupState" value="uncertain" />
              ${popupLabels.uncertain}
            </label>
            <label>
              <input type="radio" name="calibrationPopupState" value="clear" />
              ${popupLabels.clear}
            </label>
          </fieldset>
          <p id="calibrationPopupHint" class="calibrationModalHint"></p>
        </form>
      </div>
    </div>
    <button id="confirmCalibration">${continueLabel}</button>
    </div>
  `;

  let selected = state.calibration_group || "medium";
  const pills = [...root.querySelectorAll(".pill")];
  const clickPreview = root.querySelector("#clickCalibrationPreview");
  const clickDot = root.querySelector("#clickCalibrationDot");
  const togglePreview = root.querySelector("#toggleCalibrationPreview");
  const popupPreview = root.querySelector("#popupCalibrationPreview");
  const popupPanel = root.querySelector("#calibrationPopupPanel");
  const popupStateForm = root.querySelector("#calibrationPopupStateForm");
  const popupHint = root.querySelector("#calibrationPopupHint");
  const toggleFace = root.querySelector("#toggleCalibrationFace");
  const toggleText = root.querySelector("#toggleCalibrationText");
  const calibrationText = root.querySelector("#calibrationText");
  let previewTimer = null;
  let clickPreviewLastMarkMs = 0;
  let holdPreviewActive = false;
  let togglePreviewUnstable = false;
  let popupPreviewPending = false;
  const words = CALIBRATION_SAMPLE.split(/\s+/);
  let previewSpans = [];
  let i = 0;

  const renderPreviewMaskedWords = () => {
    calibrationText.innerHTML = "";
    previewSpans = [];
    words.forEach((word, idx) => {
      const span = document.createElement("span");
      span.className = "iterWord iterWord--hidden";
      span.textContent = word;
      calibrationText.appendChild(span);
      previewSpans.push(span);
      if (idx < words.length - 1) {
        calibrationText.appendChild(document.createTextNode(" "));
      }
    });
  };

  const stopPreview = () => {
    if (!previewTimer) return;
    clearInterval(previewTimer);
    previewTimer = null;
  };

  const playPreview = () => {
    stopPreview();
    renderPreviewMaskedWords();
    i = 0;
    previewTimer = setInterval(() => {
      if (i >= words.length) {
        previewSpans.forEach((span) => {
          span.classList.remove("iterWord--shown");
          span.classList.add("iterWord--hidden");
        });
        i = 0;
      }
      previewSpans[i].classList.remove("iterWord--hidden");
      previewSpans[i].classList.add("iterWord--shown");
      i += 1;
    }, SPEED_GROUPS[selected].ms);
  };

  const paint = () => {
    pills.forEach((p) => p.classList.toggle("selected", p.dataset.speed === selected));
  };

  const paintTogglePreview = () => {
    const isToggle = selectedModality === "toggle_state";
    const isClick = selectedModality === "click_mark" || selectedModality === "hold";
    const isPopup = selectedModality === "popup_state";
    clickPreview.style.display = isClick ? "block" : "none";
    togglePreview.style.display = isToggle ? "block" : "none";
    popupPreview.style.display = isPopup ? "block" : "none";
    if (isPopup && popupPreviewPending) {
      popupPanel.classList.add("open");
      popupPanel.setAttribute("aria-hidden", "false");
    } else {
      popupPanel.classList.remove("open");
      popupPanel.setAttribute("aria-hidden", "true");
    }
    if (!isToggle) {
      return;
    }
    if (togglePreviewUnstable) {
      toggleFace.src = "/graphics/squiggle.png";
      toggleText.textContent = statusLabels.changing;
    } else {
      toggleFace.src = "/graphics/straight.png";
      toggleText.textContent = statusLabels.stable;
    }
  };

  const paintClickPreview = () => {
    if (selectedModality !== "click_mark" && selectedModality !== "hold") {
      clickDot.classList.remove("active");
      return;
    }
    const active =
      selectedModality === "hold" ? holdPreviewActive : Date.now() - clickPreviewLastMarkMs < 320;
    clickDot.style.opacity = active ? "0.9" : "0.28";
    clickDot.style.transform = active ? "scale(1.5)" : "scale(1)";
  };

  const onCalibrationKeyDown = (e) => {
    if (e.code !== "Space") return;
    if (popupPreviewPending) return;
    e.preventDefault();
    if (selectedModality === "toggle_state") {
      togglePreviewUnstable = !togglePreviewUnstable;
    } else if (selectedModality === "click_mark") {
      clickPreviewLastMarkMs = Date.now();
      paintClickPreview();
    } else if (selectedModality === "hold") {
      holdPreviewActive = true;
      paintClickPreview();
    } else if (selectedModality === "popup_state") {
      popupPreviewPending = true;
      stopPreview();
    }
    paintTogglePreview();
  };
  window.addEventListener("keydown", onCalibrationKeyDown);
  const onCalibrationKeyUp = (e) => {
    if (e.code !== "Space") return;
    if (selectedModality !== "hold") return;
    e.preventDefault();
    holdPreviewActive = false;
    paintClickPreview();
  };
  window.addEventListener("keyup", onCalibrationKeyUp);

  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const POPUP_RESUME_PAUSE_MS = 1400;

  popupStateForm.onchange = async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== "calibrationPopupState") return;
    for (const el of popupStateForm.querySelectorAll('input[name="calibrationPopupState"]')) {
      el.disabled = true;
    }
    popupHint.textContent = "";
    await pause(POPUP_RESUME_PAUSE_MS);
    popupPreviewPending = false;
    popupStateForm.reset();
    for (const el of popupStateForm.querySelectorAll('input[name="calibrationPopupState"]')) {
      el.disabled = false;
    }
    popupHint.textContent = "";
    paintTogglePreview();
    playPreview();
  };

  pills.forEach((p) => {
    p.onclick = () => {
      selected = p.dataset.speed;
      paint();
      playPreview();
    };
  });

  paint();
  playPreview();
  paintClickPreview();
  paintTogglePreview();

  root.querySelector("#confirmCalibration").onclick = async () => {
    const out = await api.calibrationSave(state.session_id, state.lease_token, selected, selectedModality);
    state.calibration_group = out.calibration_group;
    state.input_modality = out.input_modality || selectedModality;
    state.ms_per_word = out.ms_per_word;
    window.removeEventListener("keydown", onCalibrationKeyDown);
    window.removeEventListener("keyup", onCalibrationKeyUp);
    stopPreview();
    saveLocal();
    setUiStep(state.return_step_after_calibration || "practice");
  };
}
