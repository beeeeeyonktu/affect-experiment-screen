import { FEELING_LABELS, MAIN_RUNS } from "../config.js";

const SHIFT_OPTIONS = [
  { value: "yes", label: "yes" },
  { value: "no", label: "no (false alarm)" },
  { value: "not_sure", label: "not sure" }
];

const DIRECTION_OPTIONS = [
  { value: "more_positive", label: "more positive" },
  { value: "more_negative", label: "more negative" },
  { value: "mixed", label: "mixed" },
  { value: "unsure", label: "unsure" }
];

function renderHighlightedHoldText(text, holds, activeIndex) {
  const words = text.split(/\s+/);
  const activeHold = holds[activeIndex];
  return words
    .map((word, idx) => {
      let cls = "";
      if (
        activeHold &&
        idx >= activeHold.start_word_index &&
        idx <= activeHold.end_word_index
      ) {
        cls = "hl-active";
      }
      return cls ? `<span class="${cls}">${word}</span>` : `<span>${word}</span>`;
    })
    .join(" ");
}

function ensureResponse(annotation, index) {
  if (!Array.isArray(annotation.responses)) annotation.responses = [];
  if (!annotation.responses[index]) {
    annotation.responses[index] = {
      shift_decision: null,
      direction: null,
      feeling_before: "unsure",
      feeling_after: "unsure",
      confidence: 3
    };
  }
  return annotation.responses[index];
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
  const requiredDone = Boolean(response.shift_decision) && Boolean(response.direction);

  root.innerHTML = `
    <p><strong>Quick check:</strong> You marked ${annotation.holds.length} detected change(s) in this text.</p>
    <p class="muted">Text ${Math.min(state.main_completed + 1, MAIN_RUNS)} of ${MAIN_RUNS} • Detected change ${activeIndex + 1} of ${annotation.holds.length}</p>

    <div style="line-height:1.8;min-height:140px;border:1px solid #ddd9cc;border-radius:8px;padding:10px;background:#fff;">
      ${renderHighlightedHoldText(annotation.text, annotation.holds, activeIndex)}
    </div>

    <div style="margin-top:14px;display:grid;gap:16px;">
      <div style="margin-bottom:2px;">
        <p style="margin:0 0 6px 0;"><strong><em>At the time</em>, did you feel your internal feeling shifted here, or was this a mistake?</strong></p>
        <div id="shiftChoices" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
      </div>

      <div style="margin-bottom:2px;">
        <p style="margin:0 0 6px 0;"><strong>At the time, and now with the full story context, what direction did the shift feel like?</strong></p>
        <div id="directionChoices" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
      </div>

      <div style="margin-bottom:2px;">
        <p style="margin:0 0 6px 0;"><strong>If you had to label the feeling change, what was the feeling <em>before</em> the change?</strong></p>
        <div id="beforeChoices" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
      </div>

      <div style="margin-bottom:2px;">
        <p style="margin:0 0 6px 0;"><strong>If you had to label the feeling change, what was the feeling <em>after</em> the change?</strong></p>
        <div id="afterChoices" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
      </div>

      <div>
        <p style="margin:0 0 6px 0;"><strong>How confident are you that this feeling shift reflects what the story intended? (There are no right answers.)</strong></p>
        <input id="confidence" type="range" min="1" max="5" step="1" value="${response.confidence}" />
        <span id="confidenceVal">${response.confidence}</span>/5
      </div>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
      <button id="nextSegment" ${requiredDone ? "" : "disabled"}>
        ${activeIndex === annotation.holds.length - 1 ? "Finish Text" : "Next Detected Change"}
      </button>
    </div>
    <p class="muted" style="margin-top:6px;">Select the first two required questions to continue.</p>
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

  function renderSingleFeeling(el, selected, key) {
    const options = ["unsure", ...FEELING_LABELS];
    el.innerHTML = options
      .map((label) => `<button class="choiceChip ${selected === label ? "selected" : ""}" data-label="${label}">${label}</button>`)
      .join("");
    [...el.querySelectorAll("button")].forEach((btn) => {
      btn.onclick = () => {
        response[key] = btn.dataset.label || "";
        saveLocal();
        render();
      };
    });
  }

  renderChoiceChips(root.querySelector("#shiftChoices"), SHIFT_OPTIONS, response.shift_decision, (value) => {
    response.shift_decision = value;
    saveLocal();
    render();
  });

  renderChoiceChips(root.querySelector("#directionChoices"), DIRECTION_OPTIONS, response.direction, (value) => {
    response.direction = value;
    saveLocal();
    render();
  });

  renderSingleFeeling(root.querySelector("#beforeChoices"), response.feeling_before || "unsure", "feeling_before");
  renderSingleFeeling(root.querySelector("#afterChoices"), response.feeling_after || "unsure", "feeling_after");

  root.querySelector("#confidence").oninput = (e) => {
    response.confidence = Number(e.target.value);
    root.querySelector("#confidenceVal").textContent = String(response.confidence);
    saveLocal();
  };

  root.querySelector("#nextSegment").onclick = async () => {
    const errEl = root.querySelector("#annotationError");
    errEl.textContent = "";
    if (!requiredDone) {
      errEl.textContent = "Please answer the first two required questions.";
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
        shift_decision: response.shift_decision,
        direction: response.direction,
        feeling_before: response.feeling_before || undefined,
        feeling_after: response.feeling_after || undefined,
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
