export function renderDevStartView(root, { onStart }) {
  root.innerHTML = `
    <p><strong>Dev start:</strong> choose target and modality for this session, or keep random target assignment.</p>
    <div style="display:grid;gap:14px;">
      <div>
        <p style="margin:0 0 6px 0;"><strong>Target condition</strong></p>
        <label style="display:block;"><input type="radio" name="targetCondition" value="random" checked /> random (balanced)</label>
        <label style="display:block;"><input type="radio" name="targetCondition" value="character" /> character emotional state</label>
        <label style="display:block;"><input type="radio" name="targetCondition" value="self" /> own emotional state</label>
      </div>

      <div>
        <p style="margin:0 0 6px 0;"><strong>Input modality</strong></p>
        <label style="display:block;"><input type="radio" name="inputModality" value="hold" checked /> hold</label>
        <label style="display:block;"><input type="radio" name="inputModality" value="click_mark" /> single press</label>
        <label style="display:block;"><input type="radio" name="inputModality" value="toggle_state" /> toggle state</label>
        <label style="display:block;"><input type="radio" name="inputModality" value="popup_state" /> popup state</label>
      </div>
    </div>
    <div style="margin-top:12px;">
      <button id="beginSessionBtn">Begin Session</button>
      <p id="devStartError" class="muted" style="color:#9b1c1c;margin-top:8px;"></p>
    </div>
  `;

  root.querySelector("#beginSessionBtn").onclick = async () => {
    const target = root.querySelector('input[name="targetCondition"]:checked')?.value || "random";
    const modality = root.querySelector('input[name="inputModality"]:checked')?.value || "hold";
    const errEl = root.querySelector("#devStartError");
    errEl.textContent = "";
    try {
      await onStart({
        input_modality: modality,
        experiment_target_override: target === "random" ? undefined : target
      });
    } catch (error) {
      errEl.textContent = error instanceof Error ? error.message : "Failed to start session";
    }
  };
}
