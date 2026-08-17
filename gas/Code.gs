/**
 * Backend for the Rorschach coding practice site.
 * Deploy: Extensions > Apps Script in a new Google Sheet, paste this file as Code.gs,
 * then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone with the link).
 * Copy the resulting /exec URL into js/config.js -> GAS_WEB_APP_URL.
 */

function getSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
  }
  return sh;
}

function attemptsSheet_() {
  return getSheet_("attempts", [
    "timestamp", "user", "item_id", "section",
    "answer_json", "field_results_json", "all_correct", "duration_sec",
  ]);
}

function flagsSheet_() {
  return getSheet_("flags", ["timestamp", "user", "item_id", "note"]);
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

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;
  const payload = body.payload || {};

  if (action === "submit") {
    const sh = attemptsSheet_();
    sh.appendRow([
      new Date().toISOString(),
      payload.user || "",
      payload.item_id || "",
      payload.section || "",
      JSON.stringify(payload.answer || {}),
      JSON.stringify(payload.field_results || {}),
      !!payload.all_correct,
      payload.duration_sec || 0,
    ]);
    return jsonOut_({ ok: true });
  }

  if (action === "flag") {
    const sh = flagsSheet_();
    sh.appendRow([new Date().toISOString(), payload.user || "", payload.item_id || "", payload.note || ""]);
    return jsonOut_({ ok: true });
  }

  if (action === "all") {
    return jsonOut_({
      attempts: sheetToObjects_(attemptsSheet_()),
      flags: sheetToObjects_(flagsSheet_()),
    });
  }

  return jsonOut_({ ok: false, error: "unknown action" });
}

function doGet(e) {
  return jsonOut_({ ok: true, message: "Rorschach practice backend is running." });
}
