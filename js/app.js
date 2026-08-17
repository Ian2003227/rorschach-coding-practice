// Main application controller: login/decrypt, practice view, dashboard, reference.

const State = {
  user: null,
  items: [],          // decrypted item bank
  locImages: {},       // { "1": dataURI, ... }
  filtered: [],         // current ordered id list for practice
  posInOrder: 0,
  answer: null,          // current in-progress answer object
  lastGrade: null,
  langMode: "both",      // "en" | "zh" | "both"
};

const LOCAL_KEY = () => `ror_local_attempts_${State.user}`;

function loadLocalAttempts() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY()) || "{}"); } catch { return {}; }
}
function saveLocalAttempt(itemId, allCorrect) {
  const map = loadLocalAttempts();
  map[itemId] = { allCorrect, at: Date.now() };
  localStorage.setItem(LOCAL_KEY(), JSON.stringify(map));
}

// ---------- Login ----------
function initLogin() {
  const sel = document.getElementById("userSelect");
  sel.innerHTML = window.RorConfig.USERS.map(u => `<option value="${u}">${u}</option>`).join("");
  document.getElementById("loginBtn").addEventListener("click", doLogin);
  document.getElementById("pwInput").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
}

async function doLogin() {
  const pw = document.getElementById("pwInput").value;
  const user = document.getElementById("userSelect").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  if (!pw) { errEl.textContent = "請輸入密語"; return; }
  try {
    const res = await fetch("data/items.enc");
    if (!res.ok) throw new Error("items.enc 讀取失敗 (" + res.status + ")");
    const envelope = await res.json();
    const data = await window.RorCrypto.decryptEnvelope(pw, envelope);
    State.items = data.items;
    State.locImages = data.locImages || {};
    State.user = user;
    document.getElementById("loginPanel").classList.add("hidden");
    document.getElementById("appRoot").classList.remove("hidden");
    document.getElementById("userBadge").textContent = "使用者：" + user;
    initApp();
    window.RorGas.flushQueue().catch(() => {});
  } catch (e) {
    if (String(e.message).includes("WRONG_PASSWORD")) {
      errEl.textContent = "密語錯誤，請再試一次";
    } else {
      errEl.textContent = "發生錯誤：" + e.message;
    }
  }
}

// ---------- App shell / nav ----------
function initApp() {
  document.querySelectorAll("nav.tabs button").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  populateFilters();
  document.getElementById("orderMode").addEventListener("change", rebuildOrder);
  document.getElementById("sectionFilter").addEventListener("change", rebuildOrder);
  document.getElementById("cardFilter").addEventListener("change", rebuildOrder);
  document.getElementById("jumpBtn").addEventListener("click", jumpToItem);
  document.getElementById("lightbox").addEventListener("click", () => {
    document.getElementById("lightbox").classList.add("hidden");
  });
  rebuildOrder();
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

  State.answer = blankAnswer();
  State.lastGrade = null;
  State.langMode = State.langMode || "both";

  const locImg = State.locImages[String(item.section)];
  const cardImgPath = `assets/cards/card_${item.card}.jpg`;
  const rotBadge = item.rotation ? `<span class="rotation-badge">卡片轉向: ${item.rotation}</span>` : "";

  panel.innerHTML = `
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
      <button class="btn-flag" id="flagBtn">標記討論</button>
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

  document.getElementById("gradeBtn").addEventListener("click", () => doGrade(item));
  document.getElementById("nextBtn").addEventListener("click", () => {
    State.posInOrder = Math.min(State.posInOrder + 1, State.filtered.length - 1);
    renderQuestion();
  });
  document.getElementById("flagBtn").addEventListener("click", () => doFlag(item));
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
  saveLocalAttempt(item.id, result.allCorrect);

  const labels = {
    location: "位置", dq: "DQ", determinants: "決定因子", fq: "FQ",
    pair: "成對", contents: "內容", popular: "P", z: "Z", special: "特殊計分",
  };
  const cellsHtml = Object.entries(result.fields).map(([k, v]) =>
    `<div class="feedback-cell ${v}">${labels[k]}：${v === "correct" ? "✓ 正確" : v === "lenient" ? "≈ 合理歧見" : "✗ 錯誤"}</div>`
  ).join("");

  document.getElementById("feedbackBlock").innerHTML = `
    <div class="feedback-panel">
      <strong>${result.allCorrect ? "🎉 全部正確！" : result.allOkOrLenient ? "大致正確（含合理歧見）" : "有錯誤，請對照下方答案"}</strong>
      <div class="feedback-grid">${cellsHtml}</div>
      <div class="answer-raw">標準答案：${escapeHtml(item.answer_raw)}</div>
    </div>
  `;

  window.RorGas.submitAttempt({
    user: State.user,
    item_id: item.id,
    section: item.section,
    answer: State.answer,
    field_results: result.fields,
    all_correct: result.allCorrect,
    duration_sec: 0,
  }).catch(() => {});
}

function doFlag(item) {
  const note = prompt("要記錄什麼討論重點？（可留空）") || "";
  const url = window.RorConfig.GAS_WEB_APP_URL;
  if (!url) { alert("尚未設定後端網址，暫時無法送出標記（已略過）。"); return; }
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "flag", payload: { user: State.user, item_id: item.id, note } }),
  }).then(() => alert("已標記，讀書會時可一起討論。")).catch(() => alert("送出失敗，請檢查網路。"));
}

// ---------- Dashboard ----------
async function renderDashboard() {
  const panel = document.getElementById("dashboardPanel");
  panel.innerHTML = "<p>載入中…</p>";
  let data;
  try {
    data = await window.RorGas.fetchAll();
  } catch (e) {
    panel.innerHTML = `<p>目前無法連線到後端（尚未設定 GAS 網址，或離線）。以下顯示本機進度。</p>`;
    renderLocalOnlyDashboard(panel);
    return;
  }
  const attempts = data.attempts || [];
  const flags = data.flags || [];

  const byUser = {};
  for (const u of window.RorConfig.USERS) byUser[u] = { total: 0, correct: 0, fieldCorrect: {}, fieldTotal: {} };
  for (const a of attempts) {
    const u = a.user;
    if (!byUser[u]) byUser[u] = { total: 0, correct: 0, fieldCorrect: {}, fieldTotal: {} };
    byUser[u].total++;
    if (a.all_correct === true || a.all_correct === "TRUE") byUser[u].correct++;
    let fr = {};
    try { fr = JSON.parse(a.field_results_json || a.field_results || "{}"); } catch {}
    for (const [field, v] of Object.entries(fr)) {
      byUser[u].fieldTotal[field] = (byUser[u].fieldTotal[field] || 0) + 1;
      if (v === "correct") byUser[u].fieldCorrect[field] = (byUser[u].fieldCorrect[field] || 0) + 1;
    }
  }

  const statCards = window.RorConfig.USERS.map(u => {
    const s = byUser[u];
    const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
    return `<div class="stat-card"><div class="num">${pct}%</div><div class="label">${u}（${s.total} 題）</div></div>`;
  }).join("");

  const fieldNames = ["location", "dq", "determinants", "fq", "pair", "contents", "popular", "z", "special"];
  const fieldLabels = { location: "位置", dq: "DQ", determinants: "決定因子", fq: "FQ", pair: "成對", contents: "內容", popular: "P", z: "Z", special: "特殊計分" };
  let fieldTableRows = fieldNames.map(f => {
    const cells = window.RorConfig.USERS.map(u => {
      const s = byUser[u];
      const t = s.fieldTotal[f] || 0;
      const c = s.fieldCorrect[f] || 0;
      return `<td>${t ? Math.round((c / t) * 100) + "%" : "-"}</td>`;
    }).join("");
    return `<tr><th>${fieldLabels[f]}</th>${cells}</tr>`;
  }).join("");

  // items attempted by everyone -> consistency table
  const byItem = {};
  for (const a of attempts) {
    (byItem[a.item_id] = byItem[a.item_id] || {})[a.user] = a;
  }
  const consensusRows = Object.entries(byItem)
    .filter(([, users]) => window.RorConfig.USERS.every(u => users[u]))
    .slice(-15)
    .map(([itemId, users]) => {
      const cells = window.RorConfig.USERS.map(u => {
        const ok = users[u].all_correct === true || users[u].all_correct === "TRUE";
        return `<td style="color:${ok ? "var(--ok)" : "var(--bad)"}">${ok ? "✓" : "✗"}</td>`;
      }).join("");
      return `<tr><th>#${itemId}</th>${cells}</tr>`;
    }).join("");

  const flagRows = flags.slice(-20).reverse().map(f =>
    `<tr><td>#${f.item_id}</td><td>${f.user}</td><td>${f.note || ""}</td></tr>`
  ).join("");

  panel.innerHTML = `
    <h2>整體表現</h2>
    <div class="stat-grid">${statCards}</div>

    <h3 style="margin-top:20px">各欄位正確率</h3>
    <table class="cmp-table"><thead><tr><th>欄位</th>${window.RorConfig.USERS.map(u => `<th>${u}</th>`).join("")}</tr></thead>
    <tbody>${fieldTableRows}</tbody></table>

    <h3 style="margin-top:20px">四人一致性（最近共同作答題目）</h3>
    <table class="cmp-table"><thead><tr><th>題號</th>${window.RorConfig.USERS.map(u => `<th>${u}</th>`).join("")}</tr></thead>
    <tbody>${consensusRows || '<tr><td colspan="5">尚無四人都作答過的題目</td></tr>'}</tbody></table>

    <h3 style="margin-top:20px">討論標記</h3>
    <table class="cmp-table"><thead><tr><th>題號</th><th>標記者</th><th>備註</th></tr></thead>
    <tbody>${flagRows || '<tr><td colspan="3">尚無標記</td></tr>'}</tbody></table>
  `;
}

function renderLocalOnlyDashboard(panel) {
  const local = loadLocalAttempts();
  const ids = Object.keys(local);
  const correct = ids.filter(id => local[id].allCorrect).length;
  panel.innerHTML += `
    <div class="stat-grid">
      <div class="stat-card"><div class="num">${ids.length}</div><div class="label">已作答</div></div>
      <div class="stat-card"><div class="num">${ids.length ? Math.round(correct / ids.length * 100) : 0}%</div><div class="label">全對率</div></div>
    </div>
  `;
}

// ---------- Reference ----------
function renderReference() {
  const panel = document.getElementById("referencePanel");

  // Empirical Z-value / Popular tables derived from the decrypted item bank itself.
  const zByCard = {};
  const popByCard = {};
  for (const it of State.items) {
    const card = it.card;
    zByCard[card] = zByCard[card] || { W: new Set(), "D/Dd": new Set(), S: new Set() };
    if (it.answer.z != null) {
      const bucket = it.answer.space ? "S" : (it.answer.location_base === "W" ? "W" : "D/Dd");
      zByCard[card][bucket].add(it.answer.z);
    }
    if (it.answer.popular) {
      popByCard[card] = popByCard[card] || new Set();
      popByCard[card].add(it.answer.contents.join(","));
    }
  }

  const zRows = window.RorConst.CARDS.map(c => {
    const z = zByCard[c] || { W: new Set(), "D/Dd": new Set(), S: new Set() };
    return `<tr><th>${c}</th><td>${[...z.W].sort((a, b) => a - b).join(", ") || "-"}</td><td>${[...z["D/Dd"]].sort((a, b) => a - b).join(", ") || "-"}</td><td>${[...z.S].sort((a, b) => a - b).join(", ") || "-"}</td></tr>`;
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

    <h3>Z 分數（本題庫實際出現的數值，依位置類型分組）</h3>
    <p style="color:var(--muted);font-size:0.85rem">這是從本題庫 300 題答案key中萃取出來的實際數值，不是外部教科書表格；同一分組內若有多個數值，代表該類型下仍需依組織複雜程度判斷。</p>
    <table class="ref-table"><thead><tr><th>卡片</th><th>W（整體）</th><th>D／Dd（局部）</th><th>S（含空白）</th></tr></thead><tbody>${zRows}</tbody></table>

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
