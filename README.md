# 羅夏克墨漬測驗編碼練習平台

給郭、彥、慧、言四人共用的 Rorschach Comprehensive System 編碼練習網站。題庫來源是版權保護的練習題手冊，因此**題目內容一律加密**，只有知道通關密語的人能在瀏覽器端解密使用；GitHub repo 本身是公開的，但看不到任何明文題目。

## 給使用者：如何練習

1. 開啟網站，輸入通關密語，選自己的名字。
2. 「練習」分頁：可切換出題順序（依章節／隨機／只出錯題）、篩選章節或卡片。
3. 每題會顯示卡片圖、位置圖（在圖上找到題號對應的墨漬位置）、反應期與詢問期逐字稿（可切換中/英/對照）。
4. 填寫九個欄位（位置、DQ、決定因子、FQ、成對、內容、Popular、Z、特殊計分）後按「送出並對答案」，會立即逐欄位標示對錯（黃色代表 Exner 手冊中認可的合理歧見，例如 FC vs CF）。
5. 「標記討論」可以把某題存到共用清單，讀書會時一起討論。
6. 「儀表板」分頁看個人與四人整體表現、各欄位正確率、四人一致性比較。
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
```

### 重新產生題庫（改了 data-raw 之後）

```bash
python3 scripts/build.py --password 818
git add data/items.enc
git commit -m "Update item bank"
git push
```

`scripts/build.py` 會先驗證 300 題完整、id 連續無缺漏、每題必要欄位齊全，有問題會擋下來不讓你誤 build 出壞檔。

### 後端部署

見 [gas/README.md](gas/README.md)。部署完把網址填進 `js/config.js` 的 `GAS_WEB_APP_URL`。

### 通關密語

目前密語：`818`（很短，僅供四人內部使用，不是高安全性設計）。如要換密語，重新跑 `python3 scripts/build.py --password <新密語>` 並更新告知四人。
