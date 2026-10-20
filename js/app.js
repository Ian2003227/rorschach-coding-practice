// Main application controller: login/decrypt, practice view, dashboard, reference.

const State = {
  user: null,          // nickname
  token: null,         // signed session token from the backend
  items: [],          // decrypted item bank
  locImages: {},       // { "1": dataURI, ... }
  filtered: [],         // current ordered id list for practice
  posInOrder: 0,
  answer: null,          // current in-progress answer object
  lastGrade: null,
  langMode: "both",      // "en" | "zh" | "both"
};

const SESSION_KEY = "ror_session";  // { nickname, token, passphrase } — "stay logged in" on this browser
const LOCAL_KEY = () => `ror_local_attempts_${State.user}`;
const LAST_ITEM_KEY = () => `ror_last_item_${State.user}`;

function loadLocalAttempts() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY()) || "{}"); } catch { return {}; }
}
function saveLocalAttempt(itemId, allCorrect, answer, fieldResults) {
  const map = loadLocalAttempts();
  const prevCount = (map[itemId] && map[itemId].count) || 0;
  map[itemId] = { allCorrect, at: Date.now(), count: prevCount + 1, answer, fieldResults };
  localStorage.setItem(LOCAL_KEY(), JSON.stringify(map));
}

// Build a per-item {allCorrect, at, count} summary from this user's server-side attempt
// history, then merge it into the local cache so status badges / wrong-filter / overview
// reflect what was answered on OTHER devices too, not just this browser.
function buildServerAttemptMap(attempts) {
  const byItem = {};
  for (const a of attempts) {
    (byItem[a.item_id] = byItem[a.item_id] || []).push(a);
  }
  const map = {};
  for (const [id, list] of Object.entries(byItem)) {
    list.sort((x, y) => new Date(x.timestamp) - new Date(y.timestamp));
    const last = list[list.length - 1];
    let answer = null, fieldResults = null;
    try { answer = JSON.parse(last.answer_json || "null"); } catch { /* ignore */ }
    try { fieldResults = JSON.parse(last.field_results_json || "null"); } catch { /* ignore */ }
    map[id] = {
      allCorrect: last.all_correct === true || last.all_correct === "TRUE",
      at: new Date(last.timestamp).getTime() || Date.now(),
      count: list.length,
      answer,
      fieldResults,
    };
  }
  return map;
}

function mergeServerIntoLocal(serverMap) {
  const local = loadLocalAttempts();
  for (const [id, rec] of Object.entries(serverMap)) {
    local[id] = rec;
  }
  localStorage.setItem(LOCAL_KEY(), JSON.stringify(local));
}

async function syncAttemptsFromServer() {
  try {
    const data = await window.RorGas.fetchMine(State.token);
    mergeServerIntoLocal(buildServerAttemptMap(data.attempts || []));
    // refresh whatever's on screen so badges/overview reflect the sync
    if (!document.getElementById("view-practice").classList.contains("hidden")) renderQuestion();
  } catch (e) {
    if (e.message === "AUTH") {
      alert("登入狀態已失效，請重新登入。");
      logout();
    }
    // otherwise offline — local cache still works
  }
}

function saveLastItem(itemId) {
  if (itemId) localStorage.setItem(LAST_ITEM_KEY(), String(itemId));
}
function restoreLastPosition(savedId) {
  if (!savedId) return;
  const idx = State.filtered.indexOf(savedId);
  if (idx >= 0) { State.posInOrder = idx; renderQuestion(); }
}

// ---------- Login ----------
let authMode = "login"; // "login" | "register"

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll(".auth-tabs button").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  document.getElementById("confirmRow").classList.toggle("hidden", mode !== "register");
  document.getElementById("userPwInput").autocomplete = mode === "register" ? "new-password" : "current-password";
  document.getElementById("loginBtn").textContent = mode === "register" ? "註冊並進入" : "登入";
  document.getElementById("loginError").textContent = "";
}

function initLogin() {
  document.querySelectorAll(".auth-tabs button").forEach(b => b.addEventListener("click", () => setAuthMode(b.dataset.mode)));
  document.getElementById("loginBtn").addEventListener("click", doLogin);
  document.querySelectorAll("#loginPanel input").forEach(el =>
    el.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); }));
  document.getElementById("logoutBtn").addEventListener("click", () => {
    if (confirm("確定要登出嗎？（作答紀錄都已存在雲端，下次登入會接著做）")) logout();
  });

  const session = loadSession();
  if (session && session.token && session.passphrase) resumeSession(session);
}

async function decryptItems(passphrase) {
  const res = await fetch("data/items.enc");
  if (!res.ok) throw new Error("items.enc 讀取失敗 (" + res.status + ")");
  const data = await window.RorCrypto.decryptEnvelope(passphrase, await res.json());
  State.items = data.items;
  State.locImages = data.locImages || {};
}

async function resumeSession(session) {
  try {
    await decryptItems(session.passphrase);
  } catch {
    // passphrase changed since last visit (or file unreachable) — fall back to the login form
    localStorage.removeItem(SESSION_KEY);
    document.getElementById("nicknameInput").value = session.nickname || "";
    return;
  }
  enterApp(session.nickname, session.token);
}

async function doLogin() {
  const passphrase = document.getElementById("pwInput").value;
  const nickname = document.getElementById("nicknameInput").value.trim();
  const password = document.getElementById("userPwInput").value;
  const errEl = document.getElementById("loginError");
  const btn = document.getElementById("loginBtn");
  errEl.textContent = "";
  if (!passphrase) { errEl.textContent = "請輸入通關密語"; return; }
  if (!nickname) { errEl.textContent = "請輸入暱稱"; return; }
  if (!password) { errEl.textContent = "請輸入個人密碼"; return; }
  if (authMode === "register") {
    if (password.length < 4) { errEl.textContent = "個人密碼至少 4 個字"; return; }
    if (password !== document.getElementById("userPwConfirm").value) { errEl.textContent = "兩次輸入的個人密碼不一樣"; return; }
  }

  btn.disabled = true;
  try {
    try {
      await decryptItems(passphrase);
    } catch (e) {
      errEl.textContent = String(e.message).includes("WRONG_PASSWORD") ? "通關密語錯誤，請再試一次" : "發生錯誤：" + e.message;
      return;
    }
    let res;
    try {
      res = authMode === "register"
        ? await window.RorGas.register(passphrase, nickname, password)
        : await window.RorGas.login(nickname, password);
    } catch (e) {
      errEl.textContent = "無法連線到伺服器，請檢查網路後再試一次";
      return;
    }
    if (!res.ok) { errEl.textContent = res.error || "登入失敗"; return; }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ nickname: res.nickname, token: res.token, passphrase }));
    enterApp(res.nickname, res.token);
  } finally {
    btn.disabled = false;
  }
}

function enterApp(nickname, token) {
  State.user = nickname;
  State.token = token;
  document.getElementById("loginPanel").classList.add("hidden");
  document.getElementById("appRoot").classList.remove("hidden");
  document.getElementById("userBadge").textContent = "使用者：" + nickname;
  initApp();
  window.RorGas.flushQueue().then(() => syncAttemptsFromServer()).catch(() => syncAttemptsFromServer());
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  location.reload();
}

// ---------- App shell / nav ----------
function initApp() {
  const savedLastId = parseInt(localStorage.getItem(LAST_ITEM_KEY()), 10) || null;
  document.querySelectorAll("nav.tabs button").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  populateFilters();
  document.getElementById("orderMode").addEventListener("change", rebuildOrder);
  document.getElementById("sectionFilter").addEventListener("change", rebuildOrder);
  document.getElementById("cardFilter").addEventListener("change", rebuildOrder);
  document.getElementById("jumpBtn").addEventListener("click", jumpToItem);
  document.getElementById("overviewBtn").addEventListener("click", toggleOverview);
  const reviewToggle = document.getElementById("reviewModeToggle");
  const reviewKey = `ror_review_mode_${State.user}`;
  reviewToggle.checked = localStorage.getItem(reviewKey) === "1";
  State.reviewMode = reviewToggle.checked;
  reviewToggle.addEventListener("change", e => {
    State.reviewMode = e.target.checked;
    localStorage.setItem(reviewKey, e.target.checked ? "1" : "0");
    renderQuestion();
  });
  document.getElementById("lightbox").addEventListener("click", () => {
    document.getElementById("lightbox").classList.add("hidden");
  });
  rebuildOrder();
  restoreLastPosition(savedLastId);
  switchView("practice");
}

function switchView(view) {
  document.querySelectorAll("nav.tabs button").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  ["practice", "dashboard", "reference"].forEach(v => {
    document.getElementById("view-" + v).classList.toggle("hidden", v !== view);
  });
  if (view === "dashboard") renderDashboard();
  if (view === "reference") renderReference();
}

function populateFilters() {
  const sections = [...new Set(State.items.map(i => i.section))].sort((a, b) => a - b);
  document.getElementById("sectionFilter").innerHTML =
    '<option value="">全部章節</option>' + sections.map(s => `<option value="${s}">Section ${s}</option>`).join("");
  document.getElementById("cardFilter").innerHTML =
    '<option value="">全部卡片</option>' + window.RorConst.CARDS.map(c => `<option value="${c}">卡片 ${c}</option>`).join("");
}

function rebuildOrder() {
  const mode = document.getElementById("orderMode").value;
  const sec = document.getElementById("sectionFilter").value;
  const card = document.getElementById("cardFilter").value;
  const local = loadLocalAttempts();

  let list = State.items.filter(i =>
    (!sec || String(i.section) === sec) && (!card || i.card === card) && !i.missing_source
  );
  if (mode === "wrong") {
    list = list.filter(i => local[i.id] && local[i.id].allCorrect === false);
  }
  list = list.map(i => i.id);
  if (mode === "random") {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  State.filtered = list;
  State.posInOrder = 0;
  renderQuestion();
  if (!document.getElementById("overviewPanel").classList.contains("hidden")) renderOverview();
}

function toggleOverview() {
  const panel = document.getElementById("overviewPanel");
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden")) renderOverview();
}

function renderOverview() {
  const sec = document.getElementById("sectionFilter").value;
  const card = document.getElementById("cardFilter").value;
  const local = loadLocalAttempts();
  const items = State.items.filter(i => (!sec || String(i.section) === sec) && (!card || i.card === card));

  const done = items.filter(i => local[i.id]);
  const correct = done.filter(i => local[i.id].allCorrect).length;
  const wrong = done.length - correct;

  const chips = items.map(i => {
    const st = local[i.id];
    let style = "";
    let title = `#${i.id}：尚未作答`;
    if (i.missing_source) {
      style = "opacity:0.35";
      title = `#${i.id}：原書缺頁，暫無題目文字`;
    } else if (st) {
      style = st.allCorrect
        ? "background:var(--ok-bg);color:var(--ok);border-color:var(--ok)"
        : "background:var(--bad-bg);color:var(--bad);border-color:var(--bad)";
      title = `#${i.id}：${st.allCorrect ? "答對過" : "答錯過"}${st.count > 1 ? `（共 ${st.count} 次）` : ""}`;
    }
    return `<span class="chip overview-chip" data-id="${i.id}" style="${style}" title="${title}">${i.id}</span>`;
  }).join("");

  document.getElementById("overviewPanel").innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <strong>題目總覽（${items.length} 題中已作答 ${done.length} 題：${correct} 對／${wrong} 錯）</strong>
      <span style="font-size:0.8rem;color:var(--muted)">🟢 答對過　🔴 答錯過　⚪ 未作答　點擊可直接跳題</span>
    </div>
    <div class="chip-list" style="max-height:320px">${chips}</div>
  `;
  document.querySelectorAll(".overview-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const id = parseInt(chip.dataset.id, 10);
      const idx = State.filtered.indexOf(id);
      if (idx >= 0) State.posInOrder = idx;
      else { State.filtered.unshift(id); State.posInOrder = 0; }
      renderQuestion();
      document.getElementById("questionPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function jumpToItem() {
  const idStr = prompt("跳到題號 (1-300)：");
  const id = parseInt(idStr, 10);
  if (!id || !State.items.find(i => i.id === id)) { alert("找不到這個題號"); return; }
  const idx = State.filtered.indexOf(id);
  if (idx >= 0) { State.posInOrder = idx; }
  else { State.filtered.unshift(id); State.posInOrder = 0; }
  renderQuestion();
}

function currentItem() {
  const id = State.filtered[State.posInOrder];
  return State.items.find(i => i.id === id);
}

// ---------- Answer state ----------
function blankAnswer() {
  return {
    location_base: "W", space: false, loc_num: null,
    dq: "o",
    determinants: [{ code: "F", ap: null }],
    fq: "o",
    pair: false,
    contents: [],
    popular: false,
    z: null,
    special: [],
  };
}

// ---------- Rendering: practice question ----------
function renderQuestion() {
  const item = currentItem();
  const panel = document.getElementById("questionPanel");
  document.getElementById("progressText").textContent =
    `第 ${State.posInOrder + 1} / ${State.filtered.length} 題（題號 #${item ? item.id : "-"}）`;

  if (!item) { panel.innerHTML = "<p>此篩選條件下沒有題目。</p>"; return; }
  saveLastItem(item.id);

  const status = loadLocalAttempts()[item.id];
  const canReview = State.reviewMode && status && status.answer && status.fieldResults;
  State.answer = canReview ? JSON.parse(JSON.stringify(status.answer)) : blankAnswer();
  State.lastGrade = null;
  State.langMode = State.langMode || "both";

  const locImg = State.locImages[String(item.section)];
  const cardImgPath = `assets/cards/card_${item.card}.jpg`;
  const rotBadge = item.rotation ? `<span class="rotation-badge">卡片轉向: ${item.rotation}</span>` : "";

  let statusBadge = `<span class="rotation-badge" style="background:var(--line);color:var(--muted)">尚未作答過</span>`;
  if (status) {
    const times = status.count > 1 ? `（共答 ${status.count} 次）` : "";
    statusBadge = status.allCorrect
      ? `<span class="rotation-badge" style="background:var(--ok-bg);color:var(--ok)">✓ 你之前答對過${times}</span>`
      : `<span class="rotation-badge" style="background:var(--bad-bg);color:var(--bad)">✗ 上次作答有錯${times}</span>`;
  }

  panel.innerHTML = `
    <div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <a href="${window.RorConfig.REFERENCE_DRIVE_URL}" target="_blank" rel="noopener" class="btn-flag" style="display:inline-block;text-decoration:none;padding:6px 12px;border-radius:8px;font-size:0.85rem">📎 位置／形狀品質對照表（Google Drive）</a>
      ${statusBadge}
    </div>
    <div class="stim-row">
      <div class="stim-box">
        <img id="cardImg" src="${cardImgPath}" alt="Card ${item.card}" />
        <div class="cap">卡片 ${item.card} ${rotBadge}</div>
      </div>
      <div class="stim-box">
        ${locImg ? `<img id="locImg" src="${locImg}" alt="Section ${item.section} location map" />` : ""}
        <div class="cap">位置圖（第 ${item.section} 節；找題號 #${item.id}）</div>
      </div>
    </div>

    <div class="lang-toggle">
      <button data-lang="en" class="${State.langMode === "en" ? "active" : ""}">English</button>
      <button data-lang="zh" class="${State.langMode === "zh" ? "active" : ""}">中文</button>
      <button data-lang="both" class="${State.langMode === "both" ? "active" : ""}">中英對照</button>
    </div>

    <div id="textBlock"></div>

    <div id="codingForm"></div>

    <div class="action-row">
      <button class="btn-primary" id="gradeBtn">送出並對答案</button>
      <button class="btn-secondary" id="nextBtn">下一題</button>
    </div>

    <div id="feedbackBlock"></div>
  `;

  document.getElementById("cardImg").addEventListener("click", e => openLightbox(e.target.src));
  const li = document.getElementById("locImg");
  if (li) li.addEventListener("click", e => openLightbox(e.target.src));

  panel.querySelectorAll(".lang-toggle button").forEach(b => {
    b.addEventListener("click", () => { State.langMode = b.dataset.lang; renderTextBlock(item); syncLangButtons(); });
  });

  renderTextBlock(item);
  renderCodingForm();

  if (canReview) {
    renderComparisonFeedback(
      document.getElementById("feedbackBlock"), item, status.fieldResults, status.answer,
      "📝 訂正模式：這是你上次的作答（已幫你填回表單，可直接修改後重新送出）"
    );
  }

  document.getElementById("gradeBtn").addEventListener("click", () => doGrade(item));
  document.getElementById("nextBtn").addEventListener("click", () => {
    State.posInOrder = Math.min(State.posInOrder + 1, State.filtered.length - 1);
    renderQuestion();
  });
}

function syncLangButtons() {
  document.querySelectorAll(".lang-toggle button").forEach(b => b.classList.toggle("active", b.dataset.lang === State.langMode));
}

function renderTextBlock(item) {
  if (item.missing_source) {
    document.getElementById("textBlock").innerHTML = `
      <div class="feedback-panel" style="border-color:var(--bad)">
        <strong>⚠ 此題原始掃描缺頁</strong>
        <p>來源手冊第 310–311 頁在掃描檔中缺漏，此題（#${item.id}）的反應期/詢問期文字暫時無法提供。
        位置與標準答案仍然完整，如果之後拿得到原書這兩頁，可以再補上文字。</p>
      </div>`;
    return;
  }
  const mode = State.langMode;
  const showEn = mode === "en" || mode === "both";
  const showZh = mode === "zh" || mode === "both";
  let html = `<div class="response-text">`;
  if (showEn) html += `<div>${escapeHtml(item.response_en)}</div>`;
  if (showZh) html += `<div style="color:var(--muted)">${escapeHtml(item.response_zh)}</div>`;
  html += `</div><div class="inquiry-block">`;
  for (const turn of item.inquiry) {
    html += `<div class="inquiry-turn"><span class="who">${turn.who}:</span>`;
    if (showEn) html += `<span>${escapeHtml(turn.en)}</span>`;
    if (showEn && showZh) html += `<br>`;
    if (showZh) html += `<span style="color:var(--muted)">${escapeHtml(turn.zh)}</span>`;
    html += `</div>`;
  }
  html += `</div>`;
  document.getElementById("textBlock").innerHTML = html;
}

// ---------- Answer comparison (used by grading AND review mode) ----------
const FIELD_LABELS = {
  location: "位置", dq: "DQ", determinants: "決定因子", fq: "FQ",
  pair: "成對", contents: "內容", popular: "P", z: "Z", special: "特殊計分",
};

function describeAnswer(ans) {
  if (!ans) return null;
  const loc = `${ans.space ? "S" : ""}${ans.location_base}${ans.location_base !== "W" && ans.loc_num ? ans.loc_num : ""}`;
  const dets = (ans.determinants || []).map(d => d.code + (d.ap || "")).join(".");
  return {
    location: loc || "-",
    dq: ans.dq || "-",
    determinants: dets || "-",
    fq: ans.fq || "（無）",
    pair: ans.pair ? "成對 (2)" : "不成對",
    contents: (ans.contents || []).join(",") || "（無）",
    popular: ans.popular ? "P" : "（無）",
    z: (ans.z ?? "（無）"),
    special: (ans.special || []).join(",") || "（無）",
  };
}

function renderComparisonFeedback(container, item, fieldResults, userAnswer, title) {
  const userDesc = describeAnswer(userAnswer) || {};
  const keyDesc = describeAnswer(item.answer);
  const values = Object.values(fieldResults);
  const allCorrect = values.every(v => v === "correct");
  const allOk = values.every(v => v !== "wrong");

  const rows = Object.keys(FIELD_LABELS).map(k => {
    const v = fieldResults[k];
    const mark = v === "correct" ? "✓" : v === "lenient" ? "≈" : "✗";
    return `<tr>
      <th>${FIELD_LABELS[k]}</th>
      <td>${escapeHtml(String(userDesc[k] ?? "-"))}</td>
      <td class="feedback-cell ${v}" style="text-align:center">${mark}</td>
      <td>${escapeHtml(String(keyDesc[k]))}</td>
    </tr>`;
  }).join("");

  container.innerHTML = `
    <div class="feedback-panel">
      <strong>${title || (allCorrect ? "🎉 全部正確！" : allOk ? "大致正確（含合理歧見）" : "有錯誤，請對照下方答案")}</strong>
      <div style="overflow-x:auto;margin-top:8px">
        <table class="cmp-table" style="width:100%">
          <thead><tr><th>欄位</th><th>你的答案</th><th>結果</th><th>正確答案</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="answer-raw" style="margin-top:8px">標準答案完整字串：${escapeHtml(item.answer_raw)}</div>
    </div>
  `;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function openLightbox(src) {
  document.getElementById("lightboxImg").src = src;
  document.getElementById("lightbox").classList.remove("hidden");
}

// ---------- Coding form ----------
function renderCodingForm() {
  const a = State.answer;
  const el = document.getElementById("codingForm");
  el.innerHTML = `
    <div class="coding-grid">
      <div class="field-group">
        <h4>位置</h4>
        <select id="f_locbase">
          ${["W", "D", "Dd"].map(v => `<option value="${v}" ${a.location_base === v ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        <input type="number" id="f_locnum" placeholder="位置編號 (D/Dd)" value="${a.loc_num ?? ""}" min="1" />
        <label class="checkbox-row"><input type="checkbox" id="f_space" ${a.space ? "checked" : ""}/> 含切割空白 (S)</label>
      </div>

      <div class="field-group">
        <h4>發展品質 DQ</h4>
        <select id="f_dq">
          ${window.RorConst.DQ_OPTIONS.map(v => `<option value="${v}" ${a.dq === v ? "selected" : ""}>${v}</option>`).join("")}
        </select>
      </div>

      <div class="field-group" style="grid-column: span 2">
        <h4>決定因子</h4>
        <div id="detRows"></div>
        <button class="add-det-btn" id="addDetBtn">+ 新增 blend</button>
      </div>

      <div class="field-group">
        <h4>形狀品質 FQ</h4>
        <select id="f_fq">
          <option value="">（無）</option>
          ${window.RorConst.FQ_OPTIONS.map(v => `<option value="${v}" ${a.fq === v ? "selected" : ""}>${v}</option>`).join("")}
        </select>
      </div>

      <div class="field-group">
        <h4>成對 / Popular</h4>
        <label class="checkbox-row"><input type="checkbox" id="f_pair" ${a.pair ? "checked" : ""}/> 成對反應 (2)</label>
        <label class="checkbox-row" style="margin-top:6px"><input type="checkbox" id="f_popular" ${a.popular ? "checked" : ""}/> Popular (P)</label>
      </div>

      <div class="field-group">
        <h4>Z 分數</h4>
        <input type="number" step="0.5" id="f_z" placeholder="無則留空" value="${a.z ?? ""}" />
      </div>

      <div class="field-group" style="grid-column: span 2">
        <h4>內容計分</h4>
        <div class="chip-list" id="contentChips"></div>
      </div>

      <div class="field-group" style="grid-column: span 2">
        <h4>特殊計分</h4>
        <div class="chip-list" id="specialChips"></div>
      </div>
    </div>
  `;

  renderDetRows();
  renderChips("contentChips", window.RorConst.CONTENTS.map(c => c[0]), a.contents);
  renderChips("specialChips", window.RorConst.SPECIALS.map(s => s[0]), a.special);

  document.getElementById("f_locbase").addEventListener("change", e => { a.location_base = e.target.value; });
  document.getElementById("f_locnum").addEventListener("input", e => { a.loc_num = e.target.value ? parseInt(e.target.value, 10) : null; });
  document.getElementById("f_space").addEventListener("change", e => { a.space = e.target.checked; });
  document.getElementById("f_dq").addEventListener("change", e => { a.dq = e.target.value; });
  document.getElementById("f_fq").addEventListener("change", e => { a.fq = e.target.value || null; });
  document.getElementById("f_pair").addEventListener("change", e => { a.pair = e.target.checked; });
  document.getElementById("f_popular").addEventListener("change", e => { a.popular = e.target.checked; });
  document.getElementById("f_z").addEventListener("input", e => { a.z = e.target.value ? parseFloat(e.target.value) : null; });
  document.getElementById("addDetBtn").addEventListener("click", () => {
    a.determinants.push({ code: "F", ap: null });
    renderDetRows();
  });
}

function renderDetRows() {
  const a = State.answer;
  const wrap = document.getElementById("detRows");
  wrap.innerHTML = a.determinants.map((d, idx) => {
    const needsAp = ["M", "FM", "m"].includes(d.code);
    return `
      <div class="blend-row" data-idx="${idx}">
        <select class="det-code">
          ${window.RorConst.DETERMINANTS.map(x => `<option value="${x.code}" ${d.code === x.code ? "selected" : ""}>${x.code}</option>`).join("")}
        </select>
        ${needsAp ? `
          <select class="det-ap">
            <option value="">-</option>
            <option value="a" ${d.ap === "a" ? "selected" : ""}>主動 a</option>
            <option value="p" ${d.ap === "p" ? "selected" : ""}>被動 p</option>
          </select>` : ""}
        ${a.determinants.length > 1 ? `<button class="del-det">刪除</button>` : ""}
      </div>
    `;
  }).join("");

  wrap.querySelectorAll(".blend-row").forEach(row => {
    const idx = parseInt(row.dataset.idx, 10);
    row.querySelector(".det-code").addEventListener("change", e => {
      a.determinants[idx].code = e.target.value;
      if (!["M", "FM", "m"].includes(e.target.value)) a.determinants[idx].ap = null;
      renderDetRows();
    });
    const apSel = row.querySelector(".det-ap");
    if (apSel) apSel.addEventListener("change", e => { a.determinants[idx].ap = e.target.value || null; });
    const delBtn = row.querySelector(".del-det");
    if (delBtn) delBtn.addEventListener("click", () => { a.determinants.splice(idx, 1); renderDetRows(); });
  });
}

function renderChips(containerId, codes, selectedArr) {
  const el = document.getElementById(containerId);
  el.innerHTML = codes.map(c => `<span class="chip ${selectedArr.includes(c) ? "selected" : ""}" data-code="${c}">${c}</span>`).join("");
  el.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const code = chip.dataset.code;
      const i = selectedArr.indexOf(code);
      if (i >= 0) selectedArr.splice(i, 1); else selectedArr.push(code);
      chip.classList.toggle("selected");
    });
  });
}

// ---------- Grading ----------
async function doGrade(item) {
  const result = window.RorGrade.gradeItem(State.answer, item.answer);
  State.lastGrade = result;
  const answerSnapshot = JSON.parse(JSON.stringify(State.answer));
  saveLocalAttempt(item.id, result.allCorrect, answerSnapshot, result.fields);

  renderComparisonFeedback(document.getElementById("feedbackBlock"), item, result.fields, answerSnapshot);

  window.RorGas.submitAttempt({
    token: State.token,
    item_id: item.id,
    section: item.section,
    answer: State.answer,
    field_results: result.fields,
    all_correct: result.allCorrect,
  }).catch(() => {});

  if (!document.getElementById("overviewPanel").classList.contains("hidden")) renderOverview();
}

// ---------- Dashboard ----------
// Personal stats only, computed from the local cache (already merged with the server
// history at login), counting each item's most recent attempt.
function renderDashboard() {
  const panel = document.getElementById("dashboardPanel");
  const local = loadLocalAttempts();
  const usable = State.items.filter(i => !i.missing_source);
  const done = usable.filter(i => local[i.id]);
  const correct = done.filter(i => local[i.id].allCorrect).length;
  const tries = done.reduce((sum, i) => sum + (local[i.id].count || 1), 0);
  const pct = (c, t) => t ? Math.round((c / t) * 100) + "%" : "-";

  const statCards = [
    [`${done.length} / ${usable.length}`, "已作答題數"],
    [pct(correct, done.length), `全對率（${correct} 題全對）`],
    [done.length - correct, "待訂正題數"],
    [tries, "累計作答次數"],
  ].map(([num, label]) => `<div class="stat-card"><div class="num">${num}</div><div class="label">${label}</div></div>`).join("");

  const fieldNames = ["location", "dq", "determinants", "fq", "pair", "contents", "popular", "z", "special"];
  const fieldLabels = { location: "位置", dq: "DQ", determinants: "決定因子", fq: "FQ", pair: "成對", contents: "內容", popular: "P", z: "Z", special: "特殊計分" };
  const graded = done.map(i => local[i.id].fieldResults).filter(Boolean);
  const fieldRows = fieldNames.map(f => {
    const vals = graded.map(fr => fr[f]).filter(Boolean);
    const c = vals.filter(v => v === "correct").length;
    const l = vals.filter(v => v === "lenient").length;
    return `<tr><th>${fieldLabels[f]}</th><td>${pct(c, vals.length)}</td><td>${l || "-"}</td><td>${vals.length - c - l || "-"}</td></tr>`;
  }).join("");

  const groupRows = (keys, keyOf, label) => keys.map(k => {
    const items = usable.filter(i => String(keyOf(i)) === String(k));
    const d = items.filter(i => local[i.id]);
    const c = d.filter(i => local[i.id].allCorrect).length;
    return `<tr><th>${label} ${k}</th><td>${d.length} / ${items.length}</td><td>${pct(c, d.length)}</td></tr>`;
  }).join("");
  const sections = [...new Set(usable.map(i => i.section))].sort((a, b) => a - b);
  const sectionRows = groupRows(sections, i => i.section, "Section");
  const cardRows = groupRows(window.RorConst.CARDS, i => i.card, "卡片");

  panel.innerHTML = `
    <h2>我的學習狀況</h2>
    <p style="font-size:0.85rem;color:var(--muted)">以每題「最後一次作答」計算。</p>
    <div class="stat-grid">${statCards}</div>

    <h3 style="margin-top:20px">各欄位正確率</h3>
    <table class="cmp-table"><thead><tr><th>欄位</th><th>正確率</th><th>合理歧見</th><th>答錯</th></tr></thead>
    <tbody>${fieldRows}</tbody></table>

    <h3 style="margin-top:20px">各章節</h3>
    <table class="cmp-table"><thead><tr><th>章節</th><th>已作答</th><th>全對率</th></tr></thead>
    <tbody>${sectionRows}</tbody></table>

    <h3 style="margin-top:20px">各卡片</h3>
    <table class="cmp-table"><thead><tr><th>卡片</th><th>已作答</th><th>全對率</th></tr></thead>
    <tbody>${cardRows}</tbody></table>
  `;
}

// ---------- Reference ----------
function renderReference() {
  const panel = document.getElementById("referencePanel");

  // Popular table derived from the decrypted item bank's own answer key (authoritative).
  const popByCard = {};
  for (const it of State.items) {
    const card = it.card;
    if (it.answer.popular) {
      popByCard[card] = popByCard[card] || new Set();
      popByCard[card].add(it.answer.contents.join(","));
    }
  }

  // Official Exner CS Table 9: Organizational (Z) Values for each of the 10 cards.
  const Z_TABLE = {
    I:   { ZW: 1.0, ZA: 4.0, ZD: 6.0, ZS: 3.5 },
    II:  { ZW: 4.5, ZA: 3.0, ZD: 5.5, ZS: 4.5 },
    III: { ZW: 5.5, ZA: 3.0, ZD: 4.0, ZS: 4.5 },
    IV:  { ZW: 2.0, ZA: 4.0, ZD: 3.5, ZS: 5.0 },
    V:   { ZW: 1.0, ZA: 2.5, ZD: 5.0, ZS: 4.0 },
    VI:  { ZW: 2.5, ZA: 2.5, ZD: 6.0, ZS: 6.5 },
    VII: { ZW: 2.5, ZA: 1.0, ZD: 3.0, ZS: 4.0 },
    VIII:{ ZW: 4.5, ZA: 3.0, ZD: 3.0, ZS: 4.0 },
    IX:  { ZW: 5.5, ZA: 2.5, ZD: 4.5, ZS: 5.0 },
    X:   { ZW: 5.5, ZA: 4.0, ZD: 4.5, ZS: 6.0 },
  };
  const zRows = window.RorConst.CARDS.map(c => {
    const z = Z_TABLE[c];
    return `<tr><th>${c}</th><td>${z.ZW}</td><td>${z.ZA}</td><td>${z.ZD}</td><td>${z.ZS}</td></tr>`;
  }).join("");

  const popRows = window.RorConst.CARDS.map(c => {
    const p = popByCard[c] ? [...popByCard[c]].join(" ／ ") : "-";
    return `<tr><th>${c}</th><td>${p}</td></tr>`;
  }).join("");

  const detGlossary = window.RorConst.DETERMINANTS.map(d => `<tr><th>${d.code}</th><td>${d.zh}</td></tr>`).join("");
  const contentGlossary = window.RorConst.CONTENTS.map(([c, zh]) => `<tr><th>${c}</th><td>${zh}</td></tr>`).join("");
  const specialGlossary = window.RorConst.SPECIALS.map(([c, zh]) => `<tr><th>${c}</th><td>${zh}</td></tr>`).join("");

  panel.innerHTML = `
    <h2>速查表</h2>

    <h3>Z 分數（Table 9：各卡片組織活動分數）</h3>
    <table class="ref-table"><thead><tr><th>卡片</th><th>ZW<br><span style="font-weight:400;color:var(--muted)">(DQ: +, v/+, o)</span></th><th>ZA<br><span style="font-weight:400;color:var(--muted)">Adjacent Detail</span></th><th>ZD<br><span style="font-weight:400;color:var(--muted)">Distant Detail</span></th><th>ZS<br><span style="font-weight:400;color:var(--muted)">White Space</span></th></tr></thead><tbody>${zRows}</tbody></table>

    <h3>Popular 反應（本題庫中標記 P 的內容組合）</h3>
    <table class="ref-table"><thead><tr><th>卡片</th><th>內容</th></tr></thead><tbody>${popRows}</tbody></table>

    <h3>決定因子代碼</h3>
    <table class="ref-table"><tbody>${detGlossary}</tbody></table>

    <h3>內容計分代碼</h3>
    <table class="ref-table"><tbody>${contentGlossary}</tbody></table>

    <h3>特殊計分代碼</h3>
    <table class="ref-table"><tbody>${specialGlossary}</tbody></table>
  `;
}

// ---------- Boot ----------
initLogin();
