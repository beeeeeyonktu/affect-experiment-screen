import { MAIN_RUNS } from "../config.js";

const SHIFT_VALUE_ORDER = ["yes", "no", "not_sure"];
const DIRECTION_VALUE_ORDER = ["more_positive", "more_negative", "mixed", "unsure"];

function isPopupMode(state) {
  return (state.input_modality || "hold") === "popup_state";
}

function getQuestionCopy(state) {
  const fromCopy = state.copy_resolved?.post_shift_questions || {};
  const validation = fromCopy.validation || {};
  const direction = fromCopy.direction || {};
  const confidenceLabel = state.copy_resolved?.confidence_label || "How confident are you about this shift?";
  const validationOptions = Array.isArray(validation.options)
    ? validation.options
    : ["Yes", "No (false alarm)", "Not sure"];
  const directionOptions = Array.isArray(direction.options)
    ? direction.options
    : ["More positive", "More negative", "Mixed", "Unsure"];

  return {
    q1:
      typeof validation.question === "string" && validation.question.length > 0
        ? validation.question
        : "At this moment, did your understanding of emotional state change?",
    q2:
      typeof direction.question === "string" && direction.question.length > 0
        ? direction.question
        : "In which direction did the emotional state shift?",
    q3: confidenceLabel,
    shiftChoices: SHIFT_VALUE_ORDER.map((value, idx) => ({
      value,
      label: validationOptions[idx] || validationOptions[0] || value
    })),
    directionChoices: DIRECTION_VALUE_ORDER.map((value, idx) => ({
      value,
      label: directionOptions[idx] || directionOptions[0] || value
    }))
  };
}

function renderHighlightedHoldText(text, holds, activeIndex) {
  const words = text.split(/\s+/);
  const activeHold = holds[activeIndex];
  return words
    .map((word, idx) => {
      const inActive = activeHold && idx >= activeHold.start_word_index && idx <= activeHold.end_word_index;
      return inActive ? `<span class="hl-active">${word}</span>` : `<span>${word}</span>`;
    })
    .join(" ");
}

function ensureResponse(annotation, index) {
  if (!Array.isArray(annotation.responses)) annotation.responses = [];
  if (!annotation.responses[index]) {
    annotation.responses[index] = {
      shift_decision: null,
      direction: null,
      confidence: 3
    };
  }
  return annotation.responses[index];
}

function inferPopupShiftDecision(hold, fallback) {
  if (hold?.state_label === "mistake") return "no";
  if (hold?.state_label === "uncertain" || hold?.state_label === "clear") return "yes";
  return fallback || "not_sure";
}

async function saveWithRetry(api, payload) {
  let lastError = null;
  for (let i = 0; i < 3; i += 1) {
    try {
      await api.ratingsSave(payload);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to save hold response");
}

export function renderAnnotationView(root, { state, saveLocal, setUiStep, render, api }) {
  const annotation = state.annotation;
  if (!annotation || !Array.isArray(annotation.holds) || annotation.holds.length === 0) {
    setUiStep("main");
    return;
  }

  const activeIndex = Math.max(0, Math.min(annotation.active_index || 0, annotation.holds.length - 1));
  annotation.active_index = activeIndex;
  const activeHold = annotation.holds[activeIndex];
  const response = ensureResponse(annotation, activeIndex);
  const popupMode = isPopupMode(state);
  const q = getQuestionCopy(state);
  const quickCheckLabel = state.copy_resolved?.quick_check_label || "Quick check:";
  const continueLabel = state.copy_resolved?.continue_button || "Next";
  const finishLabel = state.copy_resolved?.finish_button || "Finish Text";
  const requiredDone = popupMode ? Boolean(response.direction) : Boolean(response.shift_decision) && Boolean(response.direction);

  root.innerHTML = `
    <p><strong>${quickCheckLabel}</strong> You marked ${annotation.holds.length} detected change(s) in this text.</p>
    <p class="muted">Text ${Math.min(state.main_completed + 1, MAIN_RUNS)} of ${MAIN_RUNS} • Detected change ${activeIndex + 1} of ${annotation.holds.length}</p>

    <div style="line-height:1.8;min-height:140px;border:1px solid #ddd9cc;border-radius:8px;padding:10px;background:#fff;">
      ${renderHighlightedHoldText(annotation.text, annotation.holds, activeIndex)}
    </div>

    <div style="margin-top:14px;display:grid;gap:16px;">
      ${
        popupMode
          ? ""
          : `
      <div style="margin-bottom:2px;">
        <p style="margin:0 0 6px 0;"><strong>${q.q1}</strong></p>
        <div id="shiftChoices" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
      </div>`
      }

      <div style="margin-bottom:2px;">
        <p style="margin:0 0 6px 0;"><strong>${q.q2}</strong></p>
        <div id="directionChoices" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
      </div>

      <div>
        <p style="margin:0 0 6px 0;"><strong>${q.q3}</strong></p>
        <input id="confidence" type="range" min="1" max="5" step="1" value="${response.confidence}" />
        <span id="confidenceVal">${response.confidence}</span>/5
      </div>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
      <button id="nextSegment" ${requiredDone ? "" : "disabled"}>
        ${activeIndex === annotation.holds.length - 1 ? finishLabel : continueLabel}
      </button>
    </div>
    <p class="muted" style="margin-top:6px;">${popupMode ? "Select direction to continue." : "Select the required questions to continue."}</p>
    <p id="annotationError" class="muted" style="color:#9b1c1c;"></p>
  `;

  function renderChoiceChips(el, items, selectedValue, onPick) {
    el.innerHTML = items
      .map((x) => `<button class="choiceChip ${selectedValue === x.value ? "selected" : ""}" data-value="${x.value}">${x.label}</button>`)
      .join("");
    [...el.querySelectorAll("button")].forEach((btn) => {
      btn.onclick = () => onPick(btn.dataset.value);
    });
  }

  if (!popupMode) {
    renderChoiceChips(root.querySelector("#shiftChoices"), q.shiftChoices, response.shift_decision, (value) => {
      response.shift_decision = value;
      saveLocal();
      render();
    });
  }

  renderChoiceChips(root.querySelector("#directionChoices"), q.directionChoices, response.direction, (value) => {
    response.direction = value;
    saveLocal();
    render();
  });

  root.querySelector("#confidence").oninput = (e) => {
    response.confidence = Number(e.target.value);
    root.querySelector("#confidenceVal").textContent = String(response.confidence);
    saveLocal();
  };

  root.querySelector("#nextSegment").onclick = async () => {
    const errEl = root.querySelector("#annotationError");
    errEl.textContent = "";
    if (!requiredDone) {
      errEl.textContent = popupMode
        ? "Please answer direction before continuing."
        : "Please answer the required questions.";
      return;
    }
    if (!activeHold.hold_id) {
      errEl.textContent = "Missing hold id for this change. Please redo this text.";
      return;
    }
    try {
      root.querySelector("#nextSegment").disabled = true;
      errEl.textContent = "Saving...";
      await saveWithRetry(api, {
        session_id: state.session_id,
        lease_token: state.lease_token,
        hold_id: activeHold.hold_id,
        stimulus_id: annotation.stimulus_id,
        run_id: annotation.run_id,
        shift_decision: popupMode
          ? inferPopupShiftDecision(activeHold, response.shift_decision)
          : response.shift_decision,
        direction: response.direction,
        confidence: response.confidence
      });
      errEl.textContent = "";
    } catch (error) {
      errEl.textContent = `Could not save this hold response. ${error instanceof Error ? error.message : ""}`.trim();
      root.querySelector("#nextSegment").disabled = false;
      return;
    }

    if (activeIndex < annotation.holds.length - 1) {
      annotation.active_index = activeIndex + 1;
      saveLocal();
      render();
      return;
    }

    state.annotation = null;
    state.main_completed += 1;
    saveLocal();

    if (state.main_completed >= MAIN_RUNS) {
      setUiStep("end");
      return;
    }

    setUiStep("main");
  };
}
