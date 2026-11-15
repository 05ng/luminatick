# 部署指南

**English | [繁體中文](deployment.md)**

> 本文件為英文原版的翻譯，若內容有異，以 [英文原版](../deployment.md) 為準。

本文件說明如何將 Luminatick 部署到你自己的 Cloudflare 環境。

## 架構：選項 3（混合式卸載）

Luminatick 採用**混合式卸載架構（選項 3）**，完全繞過 Cloudflare D1 的 10GB 儲存上限，確保大規模擴充能力。

系統不將大量工單內容（如完整 HTML 或 Markdown 文章內容）直接存進資料庫，而是：
1. 將必要的**中介資料與短文字片段**存放在 D1 的 `articles` 資料表。
2. 將**完整訊息內容**（與任何附件）以物件形式卸載到 Cloudflare R2。
3. 在 API 取回資料時，同時合併中介資料與 R2 內容。

為了支援此架構，必須佈建一個 R2 儲存桶（例如 `luminatick-attachments`），並以 `ATTACHMENTS_BUCKET` 綁定到你在 `apps/server/wrangler.json` 中的後端 Worker。下方的設定腳本會自動完成此佈建。

## 前置需求
- 一個 Cloudflare 帳號。
- 已安裝 Node.js（v18+）與 `npm`。
- 已在本機登入 Wrangler：`npx wrangler login`

## 部署步驟

### 1. 佈建基礎架構
執行以下指令來建立你的 D1 資料庫、R2 儲存桶與 Vectorize 索引。此腳本會自動以新的資料庫 ID 更新 `apps/server/wrangler.json`，並佈建選項 3 所需的 `luminatick-attachments` R2 儲存桶。

```bash
npm run setup:prod
```

### 2. 設定機密
執行以下指令，以互動方式輸入並安全上傳你的正式環境機密（`JWT_SECRET`、`APP_MASTER_KEY` 等）到 Cloudflare。

```bash
npm run secrets:prod
```

**重要：** 你必須產生一把足夠強的 `APP_MASTER_KEY`（例如 32-byte 十六進位字串）並設為機密。此金鑰是應用層加密設計的核心，讓 Luminatick 能將第三方整合權杖（如 **Resend API Key**）加密後直接存放於 D1 資料庫。這樣一來，新增整合（如電子郵件頻道、聊天頻道、CRM 同步）時，無需每次更新 Cloudflare Worker 機密並重新部署。你將在管理後台的 **Settings -> Channels -> Email** 設定 Resend 憑證。

### 3. 部署應用程式
執行以下指令來建置並部署你的後端 Worker、管理後台（Pages）、客戶入口網站（Pages）與嵌入元件（R2）。

```bash
npm run deploy
```

*注意：在此過程中，後端伺服器部署完成後，腳本會暫停並要求你輸入新部署的後端網址（例如 `https://luminatick-server.<subdomain>.workers.dev`）。它會使用此網址在前端應用程式建置前，自動設定好環境變數。*

### 4. 為正式環境資料庫建立種子資料
一切部署完成後，以初始管理員帳號初始化你的正式環境資料庫。預設會建立電子郵件為 `admin@luminatick.local` 的管理員，並附帶一組隨機密碼（會輸出到你的主控台）。

```bash
npm run seed:prod
```

### 5. 部署後設定
在你的客戶能完整使用系統之前，必須先設定外寄郵件。
1. 使用第 4 步產生的帳號登入管理後台。
2. 前往 **Settings -> Channels -> Email**（或依 UI 情況前往一般設定）。
3. 設定你的外寄郵件憑證（例如 Resend API key）。

**關鍵：** **客戶入口網站**（`apps/portal`）使用無密碼 Magic Link 與 OTP 驗證。在你設定好可正常運作的外寄郵件服務來寄送登入碼之前，客戶*將無法*登入入口網站。

## 電子郵件設定

部署完成後，你必須設定電子郵件路由才能接收支援工單。

- **[Gmail 轉寄模式](email-setup.md)：** 使用 Gmail 與 Cloudflare Email Routing 設定收信與寄件的建議方式。

## 維運

- **套用遷移：** 若你在本機新增資料表，使用 `npm run deploy:server` 將其套用到正式環境。
- **更新嵌入元件：** 若你修改了嵌入元件程式碼，使用 `npm run deploy:widget` 將其更新到 R2。
- **R2 公開存取：** 第一次執行 `setup:prod` 後，請確認 `luminatick-widget` R2 儲存桶已在 Cloudflare Dashboard 設定為公開存取，以便提供 `lumina-widget.js` 檔案。