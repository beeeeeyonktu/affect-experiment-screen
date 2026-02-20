export function renderIntroView(root, { state, saveLocal, setUiStep, render }) {
  const instructionsLabel = state.copy_resolved?.instructions_label || "Instructions:";
  const introPrompt = state.copy_resolved?.intro_prompt || "Read each step below carefully before starting calibration.";
  const stepLabel = state.copy_resolved?.step_label || "Step";
  const continueLabel = state.copy_resolved?.continue_button || "Next";
  const backLabel = state.copy_resolved?.back_button || "Previous";
  const onboarding =
    Array.isArray(state.copy_resolved?.onboarding) && state.copy_resolved.onboarding.length > 0
      ? state.copy_resolved.onboarding
      : ["Follow the instructions for this session."];
  const boundedIndex = Math.max(0, Math.min(state.intro_index || 0, onboarding.length - 1));
  if (boundedIndex !== state.intro_index) {
    state.intro_index = boundedIndex;
    saveLocal();
  }
  const slideText = onboarding[boundedIndex];
  const isFirst = state.intro_index === 0;
  const isLast = state.intro_index === onboarding.length - 1;

  root.innerHTML = `
    <p><strong>${instructionsLabel}</strong> ${introPrompt}</p>
    <div class="slideBox" style="border:1px solid #ddd9cc;border-radius:10px;padding:16px;background:#fdfdfd;min-height:170px;">
      <p style="margin:0;line-height:1.8;font-size:1.06rem;">${slideText}</p>
    </div>
    <p class="muted" style="margin-top:10px;">${stepLabel} ${state.intro_index + 1} of ${onboarding.length}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="prevIntro" ${isFirst ? "disabled" : ""}>${backLabel}</button>
      <button id="nextIntro">${isLast ? `${continueLabel}: Calibration` : continueLabel}</button>
    </div>
  `;

  root.querySelector("#prevIntro").onclick = () => {
    if (state.intro_index > 0) {
      state.intro_index -= 1;
      saveLocal();
      render();
    }
  };

  root.querySelector("#nextIntro").onclick = () => {
    if (!isLast) {
      state.intro_index += 1;
      saveLocal();
      render();
      return;
    }
    state.return_step_after_calibration = "practice";
    saveLocal();
    setUiStep("calibration");
  };
}
