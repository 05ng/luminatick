# Phase 3.1: Customer Portal Specification

## 1. Overview
The Customer Portal is a dedicated, self-service web interface for end-users (customers) of the Luminatick system. While the existing Web Widget (`apps/widget`) provides lightweight, embedded support, the Customer Portal will offer a complete view where customers can log in, view their entire ticket history, track ongoing issues, and securely reply to agents. 

This document outlines the architecture, authentication strategy, API design, and database modifications required to implement this phase natively within the Cloudflare ecosystem.

---

## 2. Frontend Architecture: `apps/portal`

### Decision
The Customer Portal will be built as a **new standalone Vite + React app** located at `apps/portal`, separate from the existing dashboard and widget.

### Reasoning
1. **Separation of Concerns:** `apps/dashboard` is heavily optimized for internal agent workflows, administrative settings, and enforces strict security policies (like mandatory MFA). Mixing customer logic and routing into the agent dashboard increases the risk of privilege escalation bugs.
2. **Payload Size:** Customers do not need the heavy dependencies required by the agent dashboard (e.g., complex chart libraries, admin data tables, automation builders).
3. **Deployment:** A dedicated `apps/portal` can be easily deployed to its own Cloudflare Pages project (e.g., mapped to `support.yourdomain.com`), allowing independent scaling, caching, and custom branding.
4. **Tech Stack:** React + Vite + Tailwind CSS + React Router, sharing UI components and types from `packages/shared`.

---

## 3. Customer Authentication Strategy

### Decision: Passwordless (Email OTP / Magic Links)
Given that customers interact with support systems infrequently, forcing them to create and remember passwords creates friction. Since Luminatick already handles outbound emails via Resend (Phase 1.2), we will implement a **Passwordless Magic Link and 6-digit OTP** strategy.

### Auth Flow
1. **Request:** Customer enters their email address on the Portal login page.
2. **Generate:** The backend checks if a user exists with `role: 'customer'`. If not, a "shadow user" is seamlessly provisioned.
3. **Token:** The backend generates a secure, short-lived 6-digit OTP and a corresponding Magic Link token, hashes them, and stores them in D1.
4. **Delivery:** The backend sends the OTP/Link via the Resend API.
5. **Verification:** The customer clicks the link or enters the OTP.
6. **Session:** Upon successful verification, the backend issues a `customer-session` JWT stored in an **HTTP-only, Secure, SameSite=Lax cookie**.

---

## 4. Database Schema Updates (Cloudflare D1)

We need to store the ephemeral authentication tokens securely. Since Luminatick relies on D1 (SQLite), we will add a new table for customer authentication and slightly augment the `users` table.

### Migration: `0008_customer_portal_auth.sql`

```sql
-- Store short-lived OTPs and Magic Link hashes
CREATE TABLE customer_auth_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,      -- SHA-256 hash of the magic link token or OTP
    token_type TEXT NOT NULL,      -- 'otp' or 'magic_link'
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_auth_user ON customer_auth_tokens(user_id);
CREATE INDEX idx_customer_auth_expires ON customer_auth_tokens(expires_at);

-- Add last_login tracking to existing users table if not already present
ALTER TABLE users ADD COLUMN last_login_at DATETIME;
```

---

## 5. Backend API Routes (`apps/server`)

We will introduce a new namespaced router for the portal: `/api/v1/customer/*`. This ensures clear middleware boundaries.

### Public Endpoints (Unauthenticated)
*   **`GET /api/v1/customer/config`**
    *   *Action:* Returns public configuration settings such as `{ TICKET_PREFIX: string }`. This allows the portal to display the correct custom ticket prefix (e.g., `TKT-123` instead of `#123`) before the user is authenticated.

### Authentication Endpoints
All these endpoints will be under a mild rate limiter to prevent email bombing.

*   **`POST /api/v1/customer/auth/request`**
    *   *Payload:* `{ email: string }`
    *   *Action:* Creates shadow user if needed, generates OTP/Magic Link, dispatches email via Resend.
*   **`POST /api/v1/customer/auth/verify`**
    *   *Payload:* `{ email: string, token: string }`
    *   *Action:* Verifies OTP/Token. On success, sets HTTP-only `lumina_customer_token` cookie.
*   **`POST /api/v1/customer/auth/logout`**
    *   *Action:* Clears the HTTP-only cookie.
*   **`GET /api/v1/customer/auth/me`**
    *   *Action:* Returns current logged-in customer profile (id, name, email, avatar).

### Ticket Management Endpoints
Protected by `CustomerAuthMiddleware` which validates the JWT from the cookie and ensures the user has `role: 'customer'`.

*   **`GET /api/v1/customer/tickets`**
    *   *Query Params:* `?status=open|closed&page=1&limit=20`
    *   *Action:* Lists tickets where `customer_id` matches the authenticated user.
*   **`POST /api/v1/customer/tickets`**
    *   *Payload:* `{ subject: string, message: string, custom_fields?: Record<string, any>, attachments?: string[] }`
    *   *Action:* Creates a new ticket. Triggers necessary webhooks/automations.
*   **`GET /api/v1/customer/tickets/:id`**
    *   *Action:* Retrieves full ticket details, custom attributes, and the chronological timeline of messages (only public notes and customer replies; internal agent notes are stripped).
*   **`POST /api/v1/customer/tickets/:id/messages`**
    *   *Payload:* `{ body: string, attachments?: string[] }`
    *   *Action:* Adds a customer reply to an existing ticket. State changes to `open` if it was `resolved`/`waiting_on_customer`.
*   **`POST /api/v1/customer/attachments/presigned-url`**
    *   *Payload:* `{ filename: string, contentType: string, size: number }`
    *   *Action:* Generates a short-lived Cloudflare R2 presigned URL for the frontend to upload attachments directly to the edge without proxying through the Worker.

---

## 6. Security & Cloudflare Edge Alignment

1. **Zero-Trust Access:** Customers strictly access the `/api/v1/customer/*` namespace. Agent routes (`/api/v1/admin/*` or `/api/v1/agent/*`) will strictly reject customer JWTs.
2. **Data Privacy (Internal Notes):** The backend D1 query layer for the customer ticket view will explicitly exclude `TicketMessage` records marked as `is_internal: true`.
3. **R2 Direct Uploads:** By using presigned URLs for ticket attachments, we leverage Cloudflare R2's edge network to handle heavy file uploads natively, preventing Worker memory exhaustion or execution time limits.
4. **Polling (Real-time Feel):** The portal uses the same `document.visibilityState` optimized HTTP polling as the Agent Dashboard to fetch instant message delivery without exhausting free-tier Worker limits.

## 7. Next Steps / Implementation Plan
1. Scaffold `apps/portal` using Vite + React + Tailwind.
2. Add the `0008_customer_portal_auth.sql` migration.
3. Implement `/api/v1/customer/auth/*` routes and Resend email templates for Magic Links.
4. Implement Customer JWT Middleware.
5. Build the Portal UI (Login screen, Ticket List, Ticket Detail/Reply view).
6. Connect the Portal UI to the API.