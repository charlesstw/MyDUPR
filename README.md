# DUPR 批次查詢

登入自己的 DUPR 帳號，一次貼上多位球員的姓名或 DUPR ID，批次查出雙打 / 單打分數，並可匯出 CSV。
需求規格見 [docs/PRD.md](docs/PRD.md)、[docs/FRD.md](docs/FRD.md)。

## 功能

- **用自己的 DUPR 帳號登入**：密碼只在登入當下轉送給 DUPR 換取 access token，伺服器不保存密碼；token 存在 httpOnly cookie（前端 JS 讀不到），可隨時登出。
- **批次輸入**：一行一位，可混合輸入姓名、DUPR ID（例如 `0YVNWN`）或數字 player id；也可上傳 CSV（取第一欄）。自動去除空行與重複。
- **進度顯示**：每 5 筆送一次，顯示「查詢中 X / N」。
- **同名候選**：姓名對到多位球員時顯示「請選擇」，展開後依地區 / 分數 / DUPR ID 挑選。
- **錯誤標示**：查無此人、查詢失敗逐筆標示，不影響其他筆；DUPR 回 429 會自動退避重試。
- **CSV 匯出**：含 BOM，Excel 直接開啟不亂碼。
- **快取**：同一查詢 24 小時內不重打 DUPR（伺服器記憶體）。

## 本機執行

```bash
npm install
npm run dev        # http://localhost:3000
```

可選環境變數（見 `.env.example`）：

| 變數 | 預設 | 說明 |
|---|---|---|
| `DUPR_API_BASE` | `https://api.dupr.gg` | DUPR API 位址 |
| `BATCH_LIMIT` | `50` | 單次查詢上限 |

## 部署到 Firebase App Hosting

專案已附 `apphosting.yaml`。需要 Firebase 專案啟用 Blaze（用量計費）方案；閒置時會縮到 0 台，小量使用通常落在免費額度內。

1. 到 [Firebase Console](https://console.firebase.google.com/) 建立專案，升級為 Blaze 方案。
2. 左側選單 **Build → App Hosting → Get started**。
3. 連結 GitHub，選 repo `charlesstw/MyDUPR`，根目錄填 `/`，live branch 選要部署的分支（例如 `main`）。
4. 建立後會自動 build 並給一個 `https://<backend>--<project>.<region>.hosted.app` 網址；之後 push 到該分支就會自動重新部署。

## 開發

```bash
npm test           # 查詢邏輯單元測試
npm run typecheck
npm run build
```

## 注意

- 使用的是 DUPR 網頁版背後的非官方 API，端點可能變動；若 DUPR 改版導致查詢失敗，請調整 `src/lib/dupr.ts`。
- 部署到公開網路時請務必走 HTTPS（cookie 在 production 會加上 `Secure`），並留意 DUPR 服務條款對自動化查詢的限制。
