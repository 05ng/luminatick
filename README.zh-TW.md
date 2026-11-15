# Luminatick：開源 AI 優先工單系統

[![CI](https://github.com/05ng/luminatick/actions/workflows/ci.yml/badge.svg)](https://github.com/05ng/luminatick/actions/workflows/ci.yml) [![CodeQL](https://github.com/05ng/luminatick/actions/workflows/codeql.yml/badge.svg)](https://github.com/05ng/luminatick/actions/workflows/codeql.yml)

**English | [繁體中文](README.zh-TW.md)**

Luminatick 是一套專為 Cloudflare 生態系打造的去中心化、單租戶工單系統。它運用現代邊緣運算與 AI，透過電子郵件、網頁表單與互動式聊天提供高效率的客服體驗。

## 靈感來源
Luminatick 深受 Zammad 與 Cloudflare 無伺服器生態系的啟發。在使用 Zammad 支援客戶多年之後，我們打造了這個專案，希望將那些經過驗證的客服工作流程帶到現代、極速的邊緣基礎架構上。

## 設計理念
Luminatick 的架構基於四項核心原則：

1. **開箱即零成本：** 系統刻意設計成可舒適運作於 **Cloudflare 免費方案**。透過高效率的資料儲存模式（如混合式 R2 卸載）與高效率的 API 設計，個人與小型團隊可以在不產生每月基礎架構費用的情況下，營運一套功能完整的 AI 工單系統。
2. **高效能即時在線狀態：** 使用以 SQLite 為基礎的 Cloudflare Durable Objects，為客服人員在線狀態與工單更新提供順暢、低延遲的 WebSocket 通訊。
3. **零摩擦部署：** 將進入門檻降到最低。Luminatick 提供精簡的部署流程，只需要一個 Cloudflare 帳號。透過內建的 Wrangler 指令，你可以在幾分鐘內佈建整套基礎架構——資料庫、物件儲存、向量搜尋、AI 模型與邊緣運算。
4. **隱私優先：** 從第一天起就以使用者隱私為本打造。系統只向客戶索取最少的個人資訊，並內建符合 GDPR 的自動化機制，包括定期自動刪除未活躍使用者與清除過期工單資料的排程任務。

## 核心技術
- **後端：** Cloudflare Workers（API）、即時在線狀態（透過 SQLite Durable Objects 的 WebSockets）、Cloudflare Email Workers（收信）。
- **前端：** React + Vite + Tailwind CSS（管理後台、客戶入口網站）、Shadow DOM 封裝的 React（嵌入元件）。
- **資料庫／儲存：** Cloudflare D1（SQLite 儲存中介資料）、Cloudflare R2（混合式卸載，存放工單內容與附件）、Cloudflare Vectorize（RAG）。
- **AI 與背景處理：** Cloudflare Workers AI（Llama 3／DeepSeek、BGE-large 嵌入模型）、Cloudflare Workflows（非同步向量化）。
- **外寄郵件：** Resend API／自訂 SMTP。

## 架構
本專案採 monorepo 結構：
- `/apps/server`：統一後端，處理管理後台、嵌入元件與公開 REST API。
- `/apps/dashboard`：供客服人員與管理員管理工作單與設定的內部後台。
- `/apps/portal`：獨立的客戶自助入口網站，具備無密碼 Magic Link 與 OTP 驗證。
- `/apps/widget`：用於嵌入外部網站的單檔 JS 外掛（`lumina-widget.js`）。
- `/packages/shared`：前後端共用的 TypeScript 型別與工具。

## 核心功能與工作流程
- **全通路支援：** 透過電子郵件、網頁嵌入元件與 API 提供支援。
- **統一附件處理：** 客服人員可直接從管理後台上傳與寄送附件，與客戶入口網站安全的 R2 預簽網址上傳流程達到完整功能對等。
- **AI 驅動的 RAG 與非同步處理：** 自動為知識庫文章與客服標記的問答配對進行向量化。採用 Cloudflare Workflows 在背景進行文字分段與 AI 嵌入產生，確保 UI 儲存零延遲。
- **可擴充架構（混合式卸載）：** 將大量文字內容（如工單回覆）存放於 R2，中介資料僅存於 D1，完全繞過 D1 的 10GB 容量上限。
- **應用層加密：** 使用 `APP_MASTER_KEY` 將第三方整合權杖（如 Resend API Key、外部 API）加密後直接存於 D1 資料庫，新增機密時無需重新部署。
- **Cloudflare 用量與費用追蹤：** 整合 Cloudflare GraphQL Analytics API，提供完整儀表板追蹤 Workers、D1、R2、Vectorize 與 AI 服務的各項指標。
- **在線狀態系統：** 由設定（`REALTIME_TRANSPORT`）控制的雙模式架構：免費方案採用搭配 `document.visibilityState` 最佳化的 HTTP 輪詢，付費方案採用 Cloudflare Durable Objects 的 WebSocket，實現超低延遲更新。
- **安全與細緻權限：** 所有客服／管理員存取皆需 MFA（TOTP）。管理員可透過客服權限頁面限制客服人員存取特定設定模組。公開 API 存取需使用 API Key。
- **自動化與 GDPR 合規：** 事件驅動的 Webhook，以及自動排程的資料保留政策，可刪除過期工單、附件與未活躍使用者。
- **電子郵件整合：** 收信方式彈性，可使用 Cloudflare Email Routing，或從共用信箱（Office 365／Gmail）轉寄／重導；寄件則透過第三方服務（Resend、SMTP）。詳細情境請見 [docs/zh-TW/email-setup.md](docs/zh-TW/email-setup.md)。

## 建置與執行

### 本地開發

1. **環境設定：**
   - 複製 `apps/server/.dev.vars.example` 為 `apps/server/.dev.vars` 並填入必要的金鑰，務必產生一把 `APP_MASTER_KEY`（例如 32-byte 十六進位字串）供應用層加密使用。
   - （選填）在專案根目錄複製 `.env.example` 為 `.env` 作為共用環境變數。

2. **基礎架構（本地）：**
   ```bash
   # 將資料庫遷移套用到本地 SQLite 資料庫（由 Wrangler 管理）
   npm run db:migrate:local
   ```

3. **資料庫種子資料（本地）：**
   ```bash
   # 初始化本地資料表並建立初始管理員帳號
   npm run db:seed:local
   ```

4. **啟動後端：**
   ```bash
   npm run dev:server
   ```
   *在本機啟動 Cloudflare Worker（預設：http://localhost:8787）。*

5. **啟動管理後台：**
   ```bash
   npm run dev:dashboard
   ```
   *啟動 React 管理後台（預設：http://localhost:5173）。使用第 3 步產生的管理員帳號登入。*

6. **建置嵌入元件（選填）：**
   ```bash
   npm run build:widget
   ```
   *產生供客戶端網站整合的 `lumina-widget.js` 打包檔。*

### 測試

在本機執行自動化測試：

```bash
# 對所有 workspace 應用程式執行測試
npm run test

# 執行後端測試
npm run test --workspace=apps/server

# 執行前端測試
npm run test --workspace=apps/dashboard
```

### 持續整合（CI）

本儲存庫使用 GitHub Actions 為開源貢獻者維護程式碼品質與安全。每次對 `main` 分支的 push 與 pull request，CI 管線會自動執行：
- **自動化測試與型別檢查：** 驗證 monorepo 中的單元測試與 TypeScript 型別。
- **建置驗證：** 確保所有應用程式與套件都能成功建置。
- **安全掃描：** GitHub CodeQL 自動分析程式碼，偵測潛在安全漏洞與外洩的機密。

### 正式環境部署

詳細指南請見 [docs/zh-TW/deployment.md](docs/zh-TW/deployment.md)。

1. **佈建基礎架構：**
   ```bash
   npm run setup:prod
   ```

2. **設定機密：**
   ```bash
   npm run secrets:prod
   ```

3. **部署應用程式：**
   ```bash
   npm run deploy
   ```
   *注意：部署過程中，系統會提示你輸入新部署的後端網址，以便正確設定前端。*

4. **為正式環境資料庫建立種子資料：**
   ```bash
   npm run seed:prod
   ```

5. **部署後設定：**
   - 使用第 4 步產生的帳號登入新的管理後台。
   - 前往 **Settings -> Channels -> Email**（或一般設定），設定你的**外寄郵件服務**（例如 Resend API key）。
   - *重要：* **客戶入口網站**依賴無密碼 Magic Link 與 OTP 驗證。在外寄郵件設定完成、能寄送 OTP 之前，使用者將無法登入。

> **重要安全提醒：** 強烈建議設定 **Cloudflare Turnstile**，以保護客戶入口網站與其他公開表單免受機器人與垃圾工單侵擾。這是對公開表單至關重要的安全建議。

## 文件
- [架構總覽](docs/design-and-implementation-plan.md)
- [部署指南](docs/zh-TW/deployment.md)
- [電子郵件設定指南](docs/zh-TW/email-setup.md)
- [知識庫設定指南](docs/zh-TW/knowledge-base-setup.md)
- [API 規格](docs/phase-1.4-api-spec.md)

## 開發慣例
- **Monorepo：** 使用 `npm` workspaces 管理各應用程式之間的相依性。
- **型別安全：** 前後端皆應使用 `/packages/shared` 中的共用型別。
- **嵌入元件完整性：** 在嵌入元件中使用 Shadow DOM，避免 CSS 與宿主網站衝突。

## 支援
如有任何詢問或需要協助，請來信 [help@luminatick.org](mailto:help@luminatick.org)。

## 授權條款
MIT