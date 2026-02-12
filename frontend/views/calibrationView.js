import { CALIBRATION_SAMPLE, SPEED_GROUPS } from "../config.js";

export function renderCalibrationView(root, { state, saveLocal, setUiStep, api }) {
  root.innerHTML = `
    <p><strong>Instructions:</strong> Try out the different reading speeds and select the one you find most comfortable.</p>
    <div>
      <span class="pill" data-speed="slow">Slow</span>
      <span class="pill" data-speed="medium">Medium</span>
      <span class="pill" data-speed="fast">Fast</span>
    </div>
    <div id="calibrationText" style="line-height:1.8;min-height:120px;margin:12px 0"></div>
    <button id="confirmCalibration">Continue</button>
  `;

  let selected = state.calibration_group || "medium";
  const pills = [...root.querySelectorAll(".pill")];
  const calibrationText = root.querySelector("#calibrationText");
  let previewTimer = null;
  const words = CALIBRATION_SAMPLE.split(/\s+/);
  let i = 0;

  const stopPreview = () => {
    if (!previewTimer) return;
    clearInterval(previewTimer);
    previewTimer = null;
  };

  const playPreview = () => {
    stopPreview();
    calibrationText.textContent = "";
    i = 0;
    previewTimer = setInterval(() => {
      if (i >= words.length) {
        calibrationText.textContent = "";
        i = 0;
      }
      calibrationText.textContent += (i === 0 ? "" : " ") + words[i];
      i += 1;
    }, SPEED_GROUPS[selected].ms);
  };

  const paint = () => {
    pills.forEach((p) => p.classList.toggle("selected", p.dataset.speed === selected));
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

  root.querySelector("#confirmCalibration").onclick = async () => {
    const out = await api.calibrationSave(state.session_id, state.lease_token, selected);
    state.calibration_group = out.calibration_group;
    state.ms_per_word = out.ms_per_word;
    stopPreview();
    saveLocal();
    setUiStep(state.return_step_after_calibration || "practice");
  };
}
