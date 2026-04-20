# Phase 1.2: Email Inbound & Outbound Specification

> **Implementation Status:** ✅ **Complete**
> All features described in this specification have been implemented and tested as of Phase 1.2.
> Key files: `apps/server/src/index.ts`, `apps/server/src/services/email/`, `apps/server/src/handlers/email.handler.ts`.

## 1. Overview
This phase handles the lifecycle of email-based support tickets: receiving incoming emails (via Cloudflare Email Workers), parsing them to extract the core message, and sending replies (via Resend).

## 2. File Structure
The backend logic for emails will be housed within `apps/server/src/services/email/` and `apps/server/src/handlers/`.

```
apps/server/src/
├── index.ts                 # Worker entry point (Fetch & Email event listeners)
├── bindings.ts              # TypeScript definitions for Env/Bindings (D1, R2, KV)
├── handlers/
│   ├── email.handler.ts     # Main logic for incoming Email Worker events
│   └── rest.handler.ts      # API routes (using Hono or similar)
├── services/
│   ├── email/
│   │   ├── inbound.service.ts  # Parsing, stripping history, and D1/R2 persistence
│   │   ├── outbound.service.ts # Resend API wrapper
│   │   └── reply-parser.ts     # Logic for 'Reply Splitting'
│   ├── ticket.service.ts       # Database operations for tickets and articles
│   └── storage.service.ts      # Wrapper for Cloudflare R2 operations
├── types/
│   ├── email.ts             # Email-specific interfaces
│   └── ticket.ts            # Ticket and Article domain types
└── utils/
    └── email.utils.ts       # Helpers for Subject/Header processing
```

## 3. Interfaces & Types

### 3.1. `OutboundEmailService`
Responsible for communicating with Resend to send agent replies and notifications.

```typescript
export interface SendEmailOptions {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>; // For In-Reply-To and References
  attachments?: {
    filename: string;
    content: Uint8Array;
    contentType: string;
  }[];
}

export interface IEmailService {
  send(options: SendEmailOptions): Promise<{ id: string }>;
  /**
   * High-level method to send a reply for a specific ticket.
   * Automatically handles threading headers (In-Reply-To, References).
   */
  sendTicketReply(ticket: Ticket, article: Article, attachments: Attachment[]): Promise<void>;
}
```

### 3.2. `InboundEmailHandler`
The entry point from the Cloudflare `email` event.

```typescript
export interface IInboundEmailHandler {
  /**
   * Processes the raw ForwardableEmailMessage from Cloudflare.
   */
  handle(message: ForwardableEmailMessage, env: Env): Promise<void>;
}
```

## 4. Reply Splitting Logic
When an inbound email is received, it often contains the entire thread history. To avoid cluttering the database, we must isolate the *new* content.

**Strategy for `ReplyParser.stripHistory(text, html)`:**
1.  **Known Delimiter:** Look for a pre-defined marker like `##- Please type your reply above this line -##`.
2.  **Common Patterns:** Use regex to identify common "On DATE, NAME wrote:" patterns (e.g., `/^On\s.+\sat\s.+\s.+wrote:$/m`).
3.  **Quoted Blocks:** Identify lines starting with `>` and strip them if they appear consecutively after the main body.
4.  **Gmail/Outlook Markers:** Look for `From:`, `Sent:`, `To:`, `Subject:` blocks which usually indicate a forwarded thread.
5.  **Clean-up:** Remove trailing whitespace and repeated newlines.

## 5. Dependencies
- **`postal-mime`**: Essential for parsing the `raw` stream of an email in a Cloudflare Worker environment.
- **`hono`**: For the REST API (Dashboard/Widget).
- **`zod`**: For validation of inbound data and environment variables.

## 6. Workflow Integration

### 6.1. Inbound Processing Flow
1.  **Receive:** Cloudflare Email Worker triggers `email(message, env, ctx)`.
2.  **Parse:** Use `postal-mime` to parse `message.raw`.
3.  **Identify:**
    - Extract `Message-ID`, `References`, and `Subject`.
    - Check if `Subject` contains a ticket ID via dynamic regex (e.g., `[TKT-123]`, where the prefix is matched against the `config` table's `TICKET_PREFIX`).
    - Query `articles` for `raw_email_id` matching `In-Reply-To`.
4.  **Process Body:** Run `ReplyParser.stripHistory()` on the plain text or HTML.
5.  **Attachments:**
    - For each attachment in the email, upload the buffer to Cloudflare R2.
    - Path format: `attachments/{ticket_id}/{article_id}/{filename}`.
6.  **Persistence:**
    - If a ticket exists: Create a new `article` linked to the ticket.
    - If no ticket exists: 
        - Check if the sender's email exists in the `users` table.
        - If not, create a "shadow user" with the `customer` role.
        - Create a new `ticket` (Source: 'email') linked to the user, and then the first `article`.
7.  **Knowledge Base (Phase 2 Preview):** Save `raw_email_id` to allow future context retrieval for RAG.

### 6.2. Outbound Flow
1.  **Action:** Agent submits a reply via the Dashboard (REST API).
2.  **Logic:** `TicketService` creates the `article` in D1.
3.  **Send:** `EmailService.sendTicketReply()` is called.
4.  **Configuration Check:** `EmailService` fetches the Resend API credentials (`RESEND_API_KEY` and `RESEND_FROM_EMAIL`) from the Dashboard settings (Settings -> Channels -> Email). These values are stored securely using `APP_MASTER_KEY` Application-Layer Encryption.
5.  **Headers:**
    - `Subject`: Ensures the dynamic `[{TICKET_PREFIX}{ticket_sequence}]` (e.g., `[TKT-123]`) is included by querying the `config` table.
    - `In-Reply-To`: Sets this to the `raw_email_id` of the *last* customer email in the thread.
    - `References`: Appends the `raw_email_id` to the existing reference chain.
6.  **Resend:** The request is sent to the Resend API using the dynamically retrieved and decrypted key.
