// Talks to the Google Apps Script Web App backend. Falls back to a localStorage queue
// when offline or before GAS_WEB_APP_URL is configured, and flushes it opportunistically.

const QUEUE_KEY = "ror_pending_attempts";

function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}
function setQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }

async function postToGas(action, payload) {
  const url = window.RorConfig.GAS_WEB_APP_URL;
  if (!url) throw new Error("NO_GAS_URL");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight on Apps Script
    body: JSON.stringify({ action, payload }),
  });
  if (!res.ok) throw new Error("GAS_HTTP_" + res.status);
  return res.json();
}

async function submitAttempt(record) {
  try {
    await postToGas("submit", record);
    return { ok: true, queued: false };
  } catch (e) {
    const q = getQueue();
    q.push(record);
    setQueue(q);
    return { ok: false, queued: true, error: String(e) };
  }
}

async function flushQueue() {
  const q = getQueue();
  if (!q.length) return { flushed: 0, remaining: 0 };
  const remaining = [];
  let flushed = 0;
  for (const record of q) {
    try {
      await postToGas("submit", record);
      flushed++;
    } catch {
      remaining.push(record);
    }
  }
  setQueue(remaining);
  return { flushed, remaining: remaining.length };
}

async function fetchAll() {
  return postToGas("all", {});
}

window.RorGas = { submitAttempt, flushQueue, fetchAll, getQueue };
