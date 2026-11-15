# 電子郵件設定指南

**English | [繁體中文](email-setup.md)**

> 本文件為英文原版的翻譯，若內容有異，以 [英文原版](../email-setup.md) 為準。

Luminatick 建構於 Cloudflare Workers 之上，這是一種無伺服器、事件驅動的架構。因此，電子郵件整合的運作方式與傳統上會在背景持續輪詢郵件伺服器的客服軟體不同。

本指南說明在 Luminatick 中設定電子郵件的三種不同方式。

---

## 情境 1：網域託管於 Cloudflare（原生路由）

如果你的網域 DNS 已由 Cloudflare 管理，且該網域沒有既有的郵件代管服務（如 Google Workspace 或 Microsoft 365），這是最直接的方式。

### 收信（Inbound）
Cloudflare 讓收信路由變得非常簡單。
1. 在 Cloudflare Dashboard 啟用 **Cloudflare Email Routing**。
2. 建立自訂地址（例如 `support@yourdomain.com`）。
3. 將動作設為 **Send to Worker**，並選擇你的 Luminatick Worker。
4. 當客戶寄信到 `support@yourdomain.com` 時，Cloudflare 會立即觸發 Worker 處理該郵件並建立工單。

### 寄件（Outbound）
**重要：** Cloudflare *不會*原生寄送外寄郵件。你無法直接要求 Cloudflare 回信給客戶。
若要寄送回覆、通知或 Magic Link OTP，你必須整合第三方交易型郵件服務。
1. 註冊 **Resend** 或 **Mailchannels** 之類的服務。
2. 在該服務的儀表板驗證你的網域。
3. 將服務的 API key 加入 Luminatick 設定。Luminatick 會使用其 API 無縫寄送外寄郵件。

---

## 情境 2：共用信箱（Office 365 / Google Workspace）

如果你的企業已使用託管於 Google Workspace（Gmail）或 Microsoft Office 365（Exchange）的專屬客服信箱，你可以保留既有基礎架構，同時使用 Luminatick。

### 收信（Inbound）
改由你的郵件服務商先接收郵件，而非 Cloudflare。你需要設定**轉寄／重導模式**：
1. 建立一個隱藏的 Cloudflare 路由地址（例如 `inbound-worker@yourdomain.com`），觸發 Luminatick Worker。
2. 在 Gmail 或 Office 365 中，設定你的客服信箱（`support@yourcompany.com`）自動將所有收到的郵件轉寄到 `inbound-worker@yourdomain.com`。
3. 客戶寄信到你的正式地址後，服務商會先執行標準的垃圾郵件過濾，再將副本推送到 Cloudflare Worker 建立工單。

### 寄件（Outbound）
外寄郵件有兩種選擇：
1. **API 服務商（建議）：** 使用 **Resend** 之類的服務。確認 `support@yourcompany.com` 已驗證為寄件者。Luminatick 會透過 Resend 寄送回覆，客戶看到的寄件者會是你的正式客服地址。
2. **服務商 API／SMTP：** 你可以設定 Luminatick 使用服務商的專屬 API 或標準 SMTP 設定，直接透過你的 Google Workspace／O365 帳號寄信。

---

### 步驟示範：Gmail 轉寄範例（情境 2）

如果你使用 Gmail（Google Workspace），請依照以下步驟實作情境 2：

#### 1. Cloudflare Email Routing 設定
1. 登入 Cloudflare Dashboard 並選擇你的網域。
2. 在左側邊欄點擊 **Email** > **Email Routing**。若尚未啟用請先啟用。
3. 在 **Routing rules** 分頁點擊 **Create rule**。
4. **Custom address：** 輸入一個隱藏地址（例如 `inbound-worker@yourdomain.com`）。
5. **Action：** 選擇 **Send to Worker**，並選擇你的 Luminatick Worker。
6. 點擊 **Save**。

#### 2. Gmail 轉寄設定
1. 登入你的客服 Gmail 帳號。
2. 點擊 **設定**（齒輪圖示）> **查看所有設定**。
3. 進入 **轉寄和 POP/IMAP** 分頁。
4. 點擊 **新增轉寄地址**。
5. 輸入第 1 步建立的 Cloudflare 自訂地址。
6. 點擊 **下一步** > **繼續** > **確定**。

#### 3. 驗證流程
1. 等待 1-2 分鐘讓郵件被處理。
2. 登入 **Luminatick Dashboard**（管理後台）。
3. 前往 **工單** 頁面。你應該會看到一封主旨為 **Gmail Forwarding Confirmation - Receive Mail from support@yourcompany.com** 的新工單。
4. 開啟該工單，在內文中找到數字**驗證碼**。
5. 回到 Gmail 設定（**轉寄和 POP/IMAP**）。
6. 在驗證欄位輸入驗證碼，點擊 **驗證**。
7. 選擇 **將收到的郵件轉寄副本至...**，確認已選取 Cloudflare 地址。
8. 捲動到最下方，點擊 **儲存變更**。

#### 4. 寄件設定（Resend）
1. 確認你的網域已在 [Resend 儀表板](https://resend.com/domains)完成驗證。
2. 在你的 Cloudflare Worker 設定 `RESEND_FROM_EMAIL` 機密：
   ```bash
   npx wrangler secret put RESEND_FROM_EMAIL
   # 輸入：Support <support@yourcompany.com>
   ```
3. **重要：** `RESEND_FROM_EMAIL` 中的電子郵件地址必須是 Resend 已驗證的寄件者，且應與你的公開客服地址一致。

---

## 情境 3：傳統 IMAP/SMTP 輪詢

**Luminatick 不支援傳統 IMAP 輪詢。**

### 為什麼不支援 IMAP
傳統客服系統（如 Zammad 或 Zendesk）以持續執行的背景程序運作於專屬伺服器上，每隔幾分鐘透過 IMAP 登入你的郵件伺服器，檢查並下載新郵件。

Luminatick 建構於 **Cloudflare Workers**。Worker 是用完即釋放的無伺服器函式：啟動、執行工作、結束。它不會在背景持續運行以輪詢外部伺服器。

### 解決方式：推播而非拉取
由於這種無伺服器架構，Luminatick 的收信必須採用**推播式**模式（如情境 1 與情境 2 所述）。必須由事件（一封進來的郵件）透過 webhook 或 Cloudflare Email Routing 觸發 Worker。

### 透過 SMTP 寄件
雖然無法以 IMAP 收信，**透過 SMTP 寄件**是完全支援的。你可以設定 Luminatick 使用郵件供應商提供的傳統 SMTP 憑證（主機、連接埠、帳號、密碼）寄送工單回覆，幾乎可以使用任何郵件服務商寄件。

---

## 摘要

| 設定方式 | 收信（接收） | 寄件（傳送） | 適用對象 |
| :--- | :--- | :--- | :--- |
| **自訂網域（Cloudflare）** | Cloudflare Email Routing -> Worker | 需第三方 API（Resend 等） | 新專案、沒有既有郵件代管的網域。 |
| **共用信箱（O365/Gmail）** | 自動轉寄到 Cloudflare Worker | Resend 或服務商 API／SMTP | 已有客服信箱的成熟企業。 |
| **傳統 IMAP** | ❌ **不支援**（需改用推播） | ✅ 透過 SMTP 設定支援 | 不適用——收信必須改用轉寄（推播）模式。 |