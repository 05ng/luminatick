# Phase 1.4：外部工單 API 與 API Key 管理

**English | [繁體中文](phase-1.4-api-spec.md)**

> 本文件為英文原版的翻譯，若內容有異，以 [英文原版](../phase-1.4-api-spec.md) 為準。

## 總覽
本階段引入公開 REST API（`/api/v1/`），允許第三方系統與 Luminatick 互動。存取透過 API Key 控制，由管理員在後台管理。

## API Key 管理
API Key 用於機器對機器的身分驗證。

### Key 格式
`lt_<prefix>.<secret>`
- `lt_`：Luminatick 的固定前綴。
- `<prefix>`：8 字元隨機字串，用於在資料庫中識別 key，而無需查詢完整 secret。
- `<secret>`：32 字元的安全隨機字串。

### 儲存
- `prefix`：以明文儲存，供識別使用。
- `key_hash`：完整 API Key（`lt_<prefix>.<secret>`）的 SHA-256 雜湊值。
- `name`：key 的易讀名稱（例如「CRM Integration」）。
- `is_active`：布林值，用於啟用／停用 key。

### 安全性
- Key 只會在建立時顯示一次。
- 撤銷立即生效。
- 依每把 API Key 施行速率限制。

## 公開 REST API（`/api/v1/`）
基底網址：`https://<your-worker-subdomain>.workers.dev/api/v1`

### 驗證
所有請求必須包含 `X-API-Key` 標頭。
```
X-API-Key: lt_abcd1234.somesupersecretstring
```

### 端點

#### 1. 列出工單
- **網址**：`GET /tickets`
- **查詢參數**：
  - `page`（選填）：目前頁碼（預設：1）。
  - `filter_id`（選填）：要套用的篩選器 ID，用於特定視圖。
  - `limit`（選填）：每頁筆數（預設：50）。
- **回應**：`200 OK`，附分頁結構：
  ```json
  {
    "data": [
      {
        "id": "t-123",
        "subject": "System Alert: High CPU",
        "status": "open",
        "priority": "high",
        "created_at": "2024-05-24T12:00:00Z"
      }
    ],
    "meta": {
      "total": 150,
      "page": 1,
      "limit": 50,
      "total_pages": 3
    }
  }
  ```

#### 2. 建立工單
- **網址**：`POST /tickets`
- **速率限制**：每分鐘 10 次請求。
- **行為**：若 `customer_email` 在系統中不存在，會自動建立「影子使用者」並指派 `customer` 角色。所有時間戳（如 `created_at`）皆明確以 UTC ISO 字串（`new Date().toISOString()`）設定，確保時間排序正確並避免 SQLite 時區偏移。
- **請求內容**：
  ```json
  {
    "subject": "System Alert: High CPU",
    "customer_email": "monitor@example.com",
    "body": "The CPU usage is above 90% for 5 minutes.",
    "priority": "high",
    "group": "DevOps"
  }
  ```
- **回應**：`201 Created`，附工單詳細資料。

#### 3. 取得單一工單
- **網址**：`GET /tickets/:id`
- **回應**：`200 OK`，附工單及其文章。

#### 4. 在工單新增文章
- **網址**：`POST /tickets/:id/articles`
- **請求內容**：
  ```json
  {
    "body": "Additional context about the issue...",
    "is_internal": false
  }
  ```
- **回應**：`201 Created`。

#### 5. 更新／關閉工單
- **網址**：`PATCH /tickets/:id`
- **請求內容**：
  ```json
  {
    "status": "closed",
    "priority": "normal",
    "custom_fields": {
      "environment": "production"
    }
  }
  ```
- **行為**：以提供的 JSON 物件與既有自訂欄位資料合併，安全處理 `custom_fields` 的部分更新。
- **回應**：`200 OK`。

#### 6. 公開設定（免驗證）
- **網址**：`GET /customer/config`
- **驗證**：無需驗證。
- **行為**：回傳非敏感的平台設定（如 `TICKET_PREFIX`），讓客戶入口網站等公開應用程式無需 API Key 或使用者 session 即可正確渲染。
- **回應**：`200 OK`
  ```json
  {
    "TICKET_PREFIX": "TKT-"
  }
  ```

## 內部後台 API 更新（`/api/`）

雖然 Phase 1.4 聚焦於公開 `v1` API，內部後台 API 也已更新以支援新功能。

### 1. 篩選器設定 CRUD
- **網址**：`/api/settings/filters`
- **驗證**：需要後台 JWT 與 MFA 驗證。
- **端點**：
  - `GET /api/settings/filters`：取得所有自訂與預設工單篩選器。
  - `POST /api/settings/filters`：建立新的自訂篩選器。需要 `{ name, conditions, match_all }`。`conditions` 陣列採結構化 schema：`{ field, operator, value }`，運算子包含 `equals`、`not_equals`、`contains`、`in`。
  - `PATCH /api/settings/filters/:id`：更新既有自訂篩選器。預設保護篩選器不可修改。
  - `DELETE /api/settings/filters/:id`：刪除自訂篩選器。預設保護篩選器不可刪除。

### 2. 分頁工單列表
- **網址**：`GET /api/tickets`
- **更新**：現在支援 `page`、`limit` 與 `filter_id` 參數，以支援雙欄式篩選器工作區。回傳標準分頁結構：`{ data: Ticket[], meta: { total, page, limit, total_pages } }`。

### 3. 驗證更新
- **新端點**：`POST /api/auth/mfa/disable`
  - **驗證**：需要後台 JWT 與目前的 MFA 驗證。
  - **說明**：允許已驗證的使用者安全地為自己的帳號停用多因素驗證。此動作會將 `mfa_enabled` 設為 `false`，並從資料庫移除 `mfa_secret`。
- **使用者資料更新**：驗證端點（如登入、取得個人資料）回傳的 User 物件現已明確包含 `mfa_enabled` 布林屬性，讓前端能在安全設定頁面正確反映使用者目前的安全狀態。

## 嵌入元件 API 與 AI 強化

`v1` 命名空間除了作為外部工單 API，也服務對外的網頁嵌入元件。知識庫與 AI 聊天功能已針對 Cloudflare 免費方案特別最佳化（零成本免費方案最佳化）。

### 1. 多輪 AI 聊天
- **網址**：`POST /widget/chat`
- **速率限制**：每 IP 每分鐘 5 次請求。
- **說明**：此端點已升級支援多輪對話記憶。客戶端不再傳遞單一訊息，而是傳遞先前訊息的陣列，支援具備上下文的追問與多步驟疑難排解。此記憶完全由客戶端（嵌入元件）管理，避免任何儲存聊天紀錄的 D1 寫入操作。
- **請求內容**：
  ```json
  {
    "messages": [
      { "role": "user", "content": "How do I reset my password?" },
      { "role": "assistant", "content": "You can reset it in the settings panel." },
      { "role": "user", "content": "Where is the settings panel?" }
    ],
    "category_id": "cat-123"
  }
  ```

### 2. Vectorize 中介資料過濾（零 D1 讀取）
為防止 AI 幻覺並最佳化成本，`/widget/chat` 端點運用 Cloudflare Vectorize 的中介資料過濾能力。
- 當請求帶有 `category_id` 時，後端會將其作為中介資料過濾條件，直接注入 Vectorize 相似度搜尋。
- **成本節省**：此舉在向量資料庫層級過濾 RAG 結果。應用程式不需從 D1 撈取多餘區塊再於記憶體中過濾，完全消除範圍界定所需的不必要 D1 讀取操作。

## 實作細節

### 後端
- `ApiKeyService`：產生、雜湊與驗證 key 的邏輯。
- `apiAuthMiddleware`：以 `X-API-Key` 標頭驗證請求。
- `v1Handlers`：新端點的 REST 處理器。

### 前端
- `ApiKeyManager`：管理後台中列出、建立與撤銷 key 的元件。
- 與 `apiClient` 整合。

## 資料庫 Schema（既有）
```sql
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME
);
```

## 驗證與安全摘要

### 安全審查發現
已針對 Phase 1.4 的實作進行完整的安全審計，聚焦於 API Key 管理與公開 REST API。

1.  **API Key 安全**：
    *   **產生與熵值**：Key 使用 `lt_` 前綴，加上以 `crypto.getRandomValues()` 產生的 8 字元隨機前綴與 32 字元 secret。
    *   **雜湊**：完整 key 以 `SHA-256` 雜湊後儲存，即使資料庫外洩也不會暴露有效 key。
2.  **BOLA（物件層級授權破損）檢查**：
    *   作為單租戶系統，任何有效的 API Key 都被授權存取該組織的完整工單池。但對工單 ID 格式與存在性仍執行嚴格驗證。
3.  **SQL 注入檢查**：
    *   `PATCH /tickets/:id` 處理器中的動態 SQL 透過嚴格的欄位白名單（僅允許 `status` 與 `priority`）與 D1 參數綁定加以保護。
4.  **資料外洩檢查**：
    *   `GET /tickets/:id` 正確過濾內部文章（`is_internal = 0`），防止僅限客服的敏感備註經由公開 API 暴露。
5.  **速率限制**：
    *   記憶體內速率限制器對工單建立施行 `10 req/min`，防止自動化灌單。

### 自動化測試
Phase 1.4 已執行 **18 個特定測試案例**的完整測試，達到 **100% 通過率**。

1.  **`ApiKeyService`（單元測試）**：
    *   驗證 key 產生格式與組成分離。
    *   驗證雜湊與查詢邏輯。
    *   確保撤銷正確將 `is_active` 設為 `0`。
2.  **`v1` REST API（整合測試）**：
    *   **驗證**：確認缺少、格式錯誤或無效 key 時回傳 `401 Unauthorized`。
    *   **工單生命週期**：驗證端對端流程：`POST /tickets` -> `GET /tickets/:id` -> `POST /articles` -> `PATCH /tickets/:id`。
    *   **速率限制**：驗證超出限制時回傳 `429 Too Many Requests`。
    *   **資料隔離**：驗證 GET 回應不包含內部文章。
    *   **欄位驗證**：驗證缺少或無效 schema 欄位時回傳 `400 Bad Request`。
3.  **後台 API（整合測試）**：
    *   驗證只有已驗證且通過 MFA 的客服人員能建立或撤銷 API key。
