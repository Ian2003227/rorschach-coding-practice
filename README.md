# 羅夏克墨漬測驗編碼練習平台

給臺大臨床心理學組使用的 Rorschach Comprehensive System 編碼練習網站。題庫來源是版權保護的練習題手冊，因此**題目內容一律加密**，只有知道通關密語的人能在瀏覽器端解密使用；GitHub repo 本身是公開的，但看不到任何明文題目。**請勿將通關密語外流到組外。**

## 給使用者：如何練習

1. **第一次使用**：開啟網站，點「註冊新帳號」，輸入通關密語，自己取一個暱稱和個人密碼（至少 4 個字）。
   - 暱稱不能和別人重複；個人密碼**忘記了無法找回**，只能換一個暱稱重新註冊，請記好。
2. **之後**：同一台裝置會自動保持登入；換電腦或手機時，用「登入」輸入通關密語、暱稱、個人密碼即可，作答紀錄都存在雲端，會接著上次的進度。在公用電腦上用完記得按右上角「登出」。
3. 「練習」分頁：可切換出題順序（依章節／隨機／只出錯題）、篩選章節或卡片；「總覽／訂正本」看每題對錯，「訂正模式」會把上次的答案填回來並對照正確答案。
4. 每題會顯示卡片圖、位置圖（在圖上找到題號對應的墨漬位置）、反應期與詢問期逐字稿（可切換中/英/對照）。
5. 填寫九個欄位（位置、DQ、決定因子、FQ、成對、內容、Popular、Z、特殊計分）後按「送出並對答案」，會立即逐欄位標示對錯（黃色代表 Exner 手冊中認可的合理歧見，例如 FC vs CF）。
6. 「儀表板」分頁看自己的進度：已作答題數、全對率、各欄位／各章節／各卡片正確率。
7. 「速查表」分頁有決定因子/內容/特殊計分代碼表，以及從本題庫實際答案萃取出的 Z 分數與 Popular 對照。

## 給維護者：專案結構

```
index.html, css/, js/          前端（純靜態，無需 build step）
data/items.enc                 加密後的題庫（300題，含逐題翻譯、答案、位置圖）— 唯一進 git 的資料檔
data-raw/                      transcription 中間產物，gitignore，不進 git
assets/cards/                  10張標準墨漬卡（1921年作品，公有領域，明文）
assets/loc/                    位置圖原始檔（明文，gitignore，只用來 build，不進 git）
gas/Code.gs                    Google Apps Script 後端（見 gas/README.md 部署步驟）
scripts/build.py               合併 data-raw/section*.json → 加密輸出 data/items.enc
scripts/rekey.py               更換通關密語（不需要 data-raw，直接把 items.enc 用新密語重新加密）
```

### 重新產生題庫（改了 data-raw 之後）

```bash
python3 scripts/build.py --password <通關密語>
git add data/items.enc
git commit -m "Update item bank"
git push
```

`scripts/build.py` 會先驗證 300 題完整、id 連續無缺漏、每題必要欄位齊全，有問題會擋下來不讓你誤 build 出壞檔。

### 更換通關密語

```bash
python3 scripts/rekey.py --old <舊密語> --new <新密語>
git add data/items.enc && git commit -m "Rotate passphrase" && git push
```

再到 Apps Script 的「指令碼屬性」把 `ACCESS_CODE` 改成新密語（見 gas/README.md）。已註冊的帳號不受影響，大家下次進站輸入新密語即可。**密語不要寫進 repo 的任何檔案。**

### 後端部署

見 [gas/README.md](gas/README.md)。部署完把網址填進 `js/config.js` 的 `GAS_WEB_APP_URL`。

