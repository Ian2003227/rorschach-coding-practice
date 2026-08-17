# 部署後端（Google Apps Script + Sheets）

1. 開一份新的 Google Sheet（例如命名「羅夏克編碼練習－作答紀錄」）。
2. 上方選單「擴充功能」→「Apps Script」。
3. 把 `Code.gs` 的全部內容貼進去，取代預設內容，存檔。
4. 右上角「部署」→「新增部署作業」→類型選「網頁應用程式」：
   - 「執行身分」選你自己
   - 「誰可以存取」選「所有人」
5. 部署後會得到一個 `https://script.google.com/macros/s/xxx/exec` 網址，複製它。
6. 打開專案的 `js/config.js`，把網址貼進 `GAS_WEB_APP_URL`。
7. 重新部署網站（git commit + push）即可生效。

之後若改了 `Code.gs`，記得「管理部署作業」→ 編輯現有部署 → 更新版本，網址不會變。
