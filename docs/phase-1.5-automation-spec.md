# Phase 1.5: Automation Engine Specification

## 1. Overview
The Automation Engine is responsible for executing automated tasks in response to ticket events or on a scheduled basis. This includes sending webhooks to external systems and enforcing data retention policies.

## 2. Core Components

### 2.1 Event Dispatcher
A centralized service that allows various parts of the system (like `TicketService`) to emit events.

### 2.2 Condition Evaluator
A logic engine that takes an event payload and matches it against a set of `automation_rules`.
- Supports regex matching on `subject` and `body`.
- Supports exact matching on fields like `status`, `priority`, `source`, and `sender_type`.

### 2.3 Webhook Executor
Executes HTTP POST requests to external URLs when a rule is triggered.
- Includes a JSON payload with relevant entity data (Ticket, Article).
- Configurable headers (optional, for future expansion).

### 2.4 Retention Scheduler
Triggered by Cloudflare Workers `scheduled` handler.
- Performs cleanup of:
  - `tickets`: Older than configured days (default 365).
  - `articles`: Associated with deleted tickets.
  - `attachments`: Files in R2 associated with deleted articles.
  - `knowledge_docs`: (Optional, if implemented).

## 3. Data Schema

### 3.1 `automation_rules` Table
Already exists in `0001_initial_schema.sql`:
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary Key (UUID) |
| name | TEXT | Human-readable name |
| event_type | TEXT | `ticket.created`, `article.created`, `ticket.updated`, `scheduled.retention` |
| conditions | TEXT | JSON string of matchers |
| action_type | TEXT | `webhook`, `retention` |
| action_config | TEXT | JSON string of action parameters (URL, days_to_keep, etc.) |
| is_active | BOOLEAN| Toggle for the rule |
| created_at | DATETIME | Creation timestamp |

### 3.2 Condition Format (JSON)
```json
[
  { "field": "subject", "operator": "regex", "value": "CRITICAL:.*" },
  { "field": "source", "operator": "equals", "value": "email" }
]
```

### 3.3 Action Config Format (JSON)
For Webhooks:
```json
{
  "url": "https://hooks.slack.com/services/...",
  "method": "POST",
  "headers": { "Content-Type": "application/json" }
}
```
For Retention:
```json
{
  "days_to_keep": 90,
  "delete_attachments": true
}
```

## 4. Implementation Plan

### Step 1: Shared Types
Define `AutomationRule` and related types in `packages/shared` and `apps/server/src/types`.

### Step 2: Automation Service
Implement `AutomationService` in `apps/server/src/services/automation.service.ts` to handle rule evaluation and execution.

### Step 3: Event Dispatcher
Implement a simple `EventDispatcher` and integrate it into `TicketService`.

### Step 4: Webhook Execution
Implement `fetch` logic for outbound webhooks.

### Step 5: Retention Logic
Implement the cleanup queries and R2 object deletion.

### Step 6: Scheduled Handler
Update `apps/server/src/index.ts` to include the `scheduled` export.

### Step 7: Admin UI
Add "Automations" section to the dashboard to manage these rules.

## 5. Validation & Security

### 5.1 Webhook Security
- **Timeouts:** All outbound webhooks are limited to a 10-second timeout to prevent blocking the Worker's execution.
- **SSRF Prevention:** URLs are validated before execution. While Cloudflare Workers are isolated, it is recommended to only allow `https` protocols for webhooks.
- **Payload Sanitization:** Payloads sent via webhooks are JSON-serialized and include a timestamp for replay detection if the receiver supports it.

### 5.2 Condition Safety
- **ReDoS Protection:** Regex conditions are limited to 100 characters in length. The execution is wrapped in a try-catch block, and the target string length is capped at 1000 characters to prevent catastrophic backtracking.
- **Invalid Patterns:** Rules with invalid regex patterns are automatically skipped and logged as errors to prevent system crashes.

### 5.3 Retention Reliability
- **Batch Processing:** Data retention runs are processed in batches of 100 tickets. This prevents hitting D1's parameter limit in `IN` clauses and ensures the Worker stays within memory and execution time limits.
- **Cascading Deletion:** Deletion logic explicitly removes related records in a specific order (`attachments` -> `articles` -> `tickets`) and cleans up corresponding objects in R2 storage.
- **Error Isolation:** Failures in a single retention rule or batch do not stop the entire process; errors are logged, and the next batch or rule is processed.

### 5.4 Performance
- **Non-blocking Dispatch:** Automation triggers during ticket or article creation are executed using `ctx.waitUntil`. This allows the API to respond immediately to the user while the automation (e.g., a slow webhook) runs in the background.
- **Active Rule Caching:** Only rules marked as `is_active = 1` are fetched and evaluated, reducing database overhead.
