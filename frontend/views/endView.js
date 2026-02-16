function extractCompletionCode(redirectUrl) {
  if (!redirectUrl) return "";
  try {
    const u = new URL(redirectUrl);
    return u.searchParams.get("cc") || "";
  } catch {
    return "";
  }
}

export function renderEndView(root, { state, runtime, api }) {
  root.innerHTML = `
    <p><strong>Thank you.</strong> You have completed the reading task.</p>
    <p class="muted">If you have questions or concerns, contact: bianca.sutcliffe@outlook.com</p>
    <p class="muted" id="completionHint"></p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="submitProlific">Submit on Prolific</button>
    </div>
  `;

  const hint = root.querySelector("#completionHint");
  root.querySelector("#submitProlific").onclick = async () => {
    hint.textContent = "Finalizing...";
    await runtime.flushEvents(true);
    const out = await api.sessionComplete(state.session_id, state.lease_token);
    const cc = extractCompletionCode(out.redirect_url);
    if (cc) {
      hint.textContent = `Completion code: ${cc}`;
    } else {
      hint.textContent = "Completion code was not available in the redirect URL.";
    }
    if (out.redirect_url) {
      window.location.href = out.redirect_url;
    }
  };
}
