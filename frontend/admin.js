const API_BASE = window.__API_BASE__ || "/api";

// Set these three values before deploying admin login.
const COGNITO_DOMAIN = window.__ADMIN_COGNITO_DOMAIN__ || "eu-west-1w3saobuwb.auth.eu-west-1.amazoncognito.com";
const COGNITO_CLIENT_ID = window.__ADMIN_COGNITO_CLIENT_ID__ || "4jp37pa1leaa1ik27mcver5ol3";
const COGNITO_REDIRECT_URI = window.__ADMIN_COGNITO_REDIRECT_URI__ || "https://dbs7op0qlg22f.cloudfront.net/admin.html";

function parseHashParams() {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const p = new URLSearchParams(hash);
  return {
    id_token: p.get("id_token"),
    access_token: p.get("access_token"),
    token_type: p.get("token_type")
  };
}

function getToken() {
  return sessionStorage.getItem("admin_id_token");
}

function setToken(token) {
  if (token) sessionStorage.setItem("admin_id_token", token);
}

function clearToken() {
  sessionStorage.removeItem("admin_id_token");
}

function requireCognitoConfig() {
  if (!COGNITO_DOMAIN || !COGNITO_CLIENT_ID || !COGNITO_REDIRECT_URI) {
    throw new Error("Admin auth not configured. Set Cognito domain/client/redirect values in admin.js.");
  }
}

function login() {
  requireCognitoConfig();
  const url = new URL(`https://${COGNITO_DOMAIN}/oauth2/authorize`);
  url.searchParams.set("client_id", COGNITO_CLIENT_ID);
  url.searchParams.set("response_type", "token");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("redirect_uri", COGNITO_REDIRECT_URI);
  window.location.href = url.toString();
}

function logout() {
  clearToken();
  if (COGNITO_DOMAIN && COGNITO_CLIENT_ID) {
    const url = new URL(`https://${COGNITO_DOMAIN}/logout`);
    url.searchParams.set("client_id", COGNITO_CLIENT_ID);
    url.searchParams.set("logout_uri", COGNITO_REDIRECT_URI);
    window.location.href = url.toString();
    return;
  }
  window.location.reload();
}

async function req(path, body) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body ?? {})
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt}`);
  return JSON.parse(txt);
}

function setAuthStatus(msg) {
  document.querySelector("#authStatus").textContent = msg;
}

function renderSessions(rows) {
  const body = document.querySelector("#sessionsBody");
  body.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${row.session_id}</td>
      <td class="mono">${row.prolific_pid || row.participant_id}</td>
      <td>${row.status}</td>
      <td>${row.calibration_group || "-"} ${row.ms_per_word ? `(${row.ms_per_word}ms)` : ""}</td>
      <td>${row.assigned_count}</td>
      <td>${row.done_count}</td>
      <td>${row.interrupted_count}</td>
      <td>${row.events_count}</td>
      <td>${row.created_at_utc}</td>
      <td><button data-session="${row.session_id}">Inspect</button></td>
    `;
    body.appendChild(tr);
  }

  for (const btn of body.querySelectorAll("button[data-session]")) {
    btn.onclick = async () => {
      const sessionId = btn.getAttribute("data-session");
      if (!sessionId) return;
      await loadDetail(sessionId);
    };
  }
}

function renderDetail(detail) {
  const stimuliHtml = renderStimuli(detail.stimuli || [], detail.holds || [], detail.events || []);
  const root = document.querySelector("#detail");
  root.innerHTML = `
    <h2>Session Detail</h2>
    <p><strong>Session:</strong> <span class="mono">${detail.session.session_id}</span></p>
    <p><strong>Participant:</strong> <span class="mono">${detail.participant?.prolific_pid || detail.session.participant_id}</span></p>
    <h3>Assignments</h3>
    <pre>${JSON.stringify(detail.assignments, null, 2)}</pre>
    <h3>Events ${detail.events_truncated ? "(truncated)" : ""}</h3>
    <pre>${JSON.stringify(detail.events, null, 2)}</pre>
    <h3>Holds</h3>
    <pre>${JSON.stringify(detail.holds || [], null, 2)}</pre>
    <h3>Stimuli With Highlighted Press Spans</h3>
    ${stimuliHtml}
  `;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderHighlightedText(text, holds) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "<p class=\"muted\">No text stored for this stimulus.</p>";

  const marks = new Array(words.length).fill(false);
  for (const hold of holds) {
    const start = Math.max(0, Math.min(words.length - 1, Number(hold.start_word_index)));
    const end = Math.max(0, Math.min(words.length - 1, Number(hold.end_word_index)));
    for (let i = start; i <= end; i += 1) marks[i] = true;
  }

  const html = words
    .map((w, i) => (marks[i] ? `<span style="background:#fff3a3;border-radius:3px;padding:1px 2px;">${escapeHtml(w)}</span>` : escapeHtml(w)))
    .join(" ");

  return `<p style="line-height:1.8">${html}</p>`;
}

function renderStimuli(stimuli, holds, events) {
  const ordered = [...stimuli].sort((a, b) => Number(a.stimulus_order) - Number(b.stimulus_order));
  if (!ordered.length) return "<p class=\"muted\">No assigned stimuli for this session.</p>";

  return ordered
    .map((s) => {
      const segs = holds.filter((x) => x && x.stimulus_id === s.stimulus_id);
      const byRun = new Map();
      for (const seg of segs) {
        if (!byRun.has(seg.run_id)) byRun.set(seg.run_id, 0);
        byRun.set(seg.run_id, byRun.get(seg.run_id) + 1);
      }
      const runSummary = [...byRun.entries()].map(([r, c]) => `${r}: ${c}`).join(" | ") || "none";
      return `
        <div style="border:1px solid #ddd9cc;border-radius:8px;padding:10px;margin-bottom:10px;background:#fbfbf7">
          <p><strong>Order ${s.stimulus_order}</strong> <span class="mono">${escapeHtml(s.stimulus_id)}</span></p>
          <p class="muted">Status: ${escapeHtml(s.status)} | Category: ${escapeHtml(s.category || "-")} | Segments by run: ${escapeHtml(runSummary)}</p>
          ${renderHighlightedText(s.text, segs)}
        </div>
      `;
    })
    .join("");
}

async function loadSummary() {
  const limit = Number(document.querySelector("#limitInput").value || 100);
  const out = await req("/admin/results/summary", { limit });
  renderSessions(out.rows || []);
}

async function loadDetail(session_id) {
  const out = await req("/admin/results/session", { session_id, event_limit: 1000 });
  renderDetail(out);
}

function initTokenFromHash() {
  const p = parseHashParams();
  if (p.id_token) {
    setToken(p.id_token);
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

async function main() {
  initTokenFromHash();
  document.querySelector("#loginBtn").onclick = login;
  document.querySelector("#logoutBtn").onclick = logout;
  document.querySelector("#refreshBtn").onclick = async () => {
    try {
      await loadSummary();
      setAuthStatus("Authenticated");
    } catch (err) {
      setAuthStatus(err instanceof Error ? err.message : "Load failed");
    }
  };

  const token = getToken();
  if (!token) {
    setAuthStatus("Not authenticated. Click Admin Login.");
    return;
  }
  try {
    await loadSummary();
    setAuthStatus("Authenticated");
  } catch (err) {
    setAuthStatus(err instanceof Error ? err.message : "Load failed");
  }
}

main().catch((err) => {
  setAuthStatus(err instanceof Error ? err.message : "Initialization failed");
});
