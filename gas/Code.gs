/**
 * Backend for the Rorschach coding practice site: nickname + password accounts and
 * per-user attempt storage. See gas/README.md for deployment steps.
 *
 * Script Properties (Project Settings > Script properties):
 *   ACCESS_CODE   the site passphrase; required to register a new account.
 *   TOKEN_SECRET  generated automatically on first use; signs login tokens.
 *                 Deleting it logs everyone out (they just log in again).
 */

const NICKNAME_MAX = 20;
const PASSWORD_MIN = 4;
const HASH_ROUNDS = 1000;

function getSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
  }
  return sh;
}

function usersSheet_() {
  return getSheet_("users", ["created_at", "nickname", "salt", "password_hash"]);
}

function recordsSheet_() {
  return getSheet_("records", [
    "timestamp", "nickname", "item_id", "section",
    "answer_json", "field_results_json", "all_correct",
  ]);
}

// Leading apostrophe keeps user-supplied strings as literal text in Sheets
// (no formula evaluation, no "001" -> 1 conversion); getValues() strips it.
function text_(s) {
  return "'" + String(s);
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheetToObjects_(sh) {
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function props_() {
  return PropertiesService.getScriptProperties();
}

function tokenSecret_() {
  let secret = props_().getProperty("TOKEN_SECRET");
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props_().setProperty("TOKEN_SECRET", secret);
  }
  return secret;
}

function b64url_(bytesOrString) {
  return Utilities.base64EncodeWebSafe(bytesOrString);
}

function hashPassword_(password, salt) {
  let digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, salt + ":" + password, Utilities.Charset.UTF_8);
  for (let i = 0; i < HASH_ROUNDS; i++) {
    digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, digest);
  }
  return Utilities.base64Encode(digest);
}

function signToken_(nickname) {
  const sig = Utilities.computeHmacSha256Signature(nickname, tokenSecret_(), Utilities.Charset.UTF_8);
  return b64url_(Utilities.newBlob(nickname).getBytes()) + "." + b64url_(sig);
}

// Returns the nickname a token was issued for, or null if it is not genuine.
function verifyToken_(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  let nickname;
  try {
    nickname = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString("UTF-8");
  } catch (e) {
    return null;
  }
  return signToken_(nickname) === token ? nickname : null;
}

function findUser_(nickname) {
  const key = nickname.toLowerCase();
  return sheetToObjects_(usersSheet_()).find(u => String(u.nickname).toLowerCase() === key) || null;
}

function register_(p) {
  const accessCode = props_().getProperty("ACCESS_CODE");
  if (!accessCode) return { ok: false, error: "後端尚未設定 ACCESS_CODE，請聯絡管理者" };
  if (String(p.access_code || "") !== accessCode) return { ok: false, error: "通關密語錯誤" };

  const nickname = String(p.nickname || "").trim();
  const password = String(p.password || "");
  if (!nickname || nickname.length > NICKNAME_MAX) return { ok: false, error: `暱稱需為 1–${NICKNAME_MAX} 個字` };
  if (password.length < PASSWORD_MIN) return { ok: false, error: `個人密碼至少 ${PASSWORD_MIN} 個字` };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (findUser_(nickname)) return { ok: false, error: "這個暱稱已經有人使用，請換一個" };
    const salt = Utilities.getUuid();
    usersSheet_().appendRow([new Date().toISOString(), text_(nickname), text_(salt), text_(hashPassword_(password, salt))]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, nickname, token: signToken_(nickname) };
}

function login_(p) {
  const user = findUser_(String(p.nickname || "").trim());
  if (!user || hashPassword_(String(p.password || ""), user.salt) !== user.password_hash) {
    return { ok: false, error: "暱稱或個人密碼錯誤" };
  }
  const nickname = String(user.nickname);
  return { ok: true, nickname, token: signToken_(nickname) };
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;
  const payload = body.payload || {};

  if (action === "register") return jsonOut_(register_(payload));
  if (action === "login") return jsonOut_(login_(payload));

  const nickname = verifyToken_(payload.token);
  if (!nickname) return jsonOut_({ ok: false, error: "AUTH" });

  if (action === "submit") {
    recordsSheet_().appendRow([
      new Date().toISOString(),
      text_(nickname),
      Number(payload.item_id) || "",
      Number(payload.section) || "",
      text_(JSON.stringify(payload.answer || {})),
      text_(JSON.stringify(payload.field_results || {})),
      !!payload.all_correct,
    ]);
    return jsonOut_({ ok: true });
  }

  if (action === "mine") {
    const attempts = sheetToObjects_(recordsSheet_()).filter(r => String(r.nickname) === nickname);
    return jsonOut_({ ok: true, attempts });
  }

  return jsonOut_({ ok: false, error: "unknown action" });
}

// Run this once from the Apps Script editor (select checkSetup, press Run) after pasting
// the code: it triggers the permission prompt and reports whether ACCESS_CODE is set.
function checkSetup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  lock.releaseLock();
  tokenSecret_();
  usersSheet_();
  recordsSheet_();
  const code = props_().getProperty("ACCESS_CODE");
  Logger.log(code ? "設定完成：ACCESS_CODE 已設定（" + code.length + " 個字）" : "尚未設定 ACCESS_CODE，請到「專案設定 → 指令碼屬性」新增");
}

function doGet(e) {
  return jsonOut_({ ok: true, message: "Rorschach practice backend is running." });
}
