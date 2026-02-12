import { INTRO_SLIDES } from "../config.js";

export function renderIntroView(root, { state, saveLocal, setUiStep, render }) {
  const slide = INTRO_SLIDES[state.intro_index];
  const isFirst = state.intro_index === 0;
  const isLast = state.intro_index === INTRO_SLIDES.length - 1;

  root.innerHTML = `
    <p><strong>Instructions:</strong> Read each story as it unfolds. Hold the <kbd>Space Bar</kbd> while your internal feeling is uncertain, and release when it feels clear again. You will complete 2 short practice texts, then 3 full task texts.</p>
    <div class="slideBox" style="border:1px solid #ddd9cc;border-radius:10px;padding:14px;background:#fdfdfd;min-height:170px;">
      <h3 style="margin:0 0 8px 0;">${slide.title}</h3>
      <img
        src="${slide.image}"
        alt="${slide.title}"
        style="display:block;width:100%;height:auto;max-height:min(56vh,560px);object-fit:contain;border-radius:8px;background:#fdfdfd;margin:0 0 12px 0;"
      />
      <p style="margin:0;line-height:1.7;">${slide.body}</p>
    </div>
    <p class="muted" style="margin-top:10px;">Step ${state.intro_index + 1} of ${INTRO_SLIDES.length}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="prevIntro" ${isFirst ? "disabled" : ""}>Previous</button>
      <button id="nextIntro">${isLast ? "Next: Calibration" : "Next"}</button>
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
