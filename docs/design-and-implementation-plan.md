# Luminatick: Open-Source AI Ticketing System - Phase 1 Plan

## 1. Objective
Build an open-source, single-tenant, AI-first ticketing system designed for easy deployment on Cloudflare's ecosystem. The system will handle support requests primarily via email, with optional web-based plugins and a public REST API for 3rd party integrations.

## 2. Architecture & Components

*   **Backend / API:** Cloudflare Workers (Handles Dashboard API, Widget API, and Public REST API).
*   **Real-time Layer:** Unified Architecture (Free-Tier Optimized WebSockets via Durable Objects with Hibernation and zero-cost Attachment storage).
*   **Database:** Cloudflare D1 (SQLite) for structured metadata (Users, Tickets, Config, Automation Rules, API Keys). *Note: To overcome D1's 10GB storage limit, heavy payloads like article bodies are offloaded to R2 (Hybrid Offloading).*
*   **Storage:** Cloudflare R2 for file attachments, the company logo, raw documents awaiting vectorization, and offloaded article bodies.
*   **Vector Database:** Cloudflare Vectorize for semantic search of past tickets and knowledge base articles.
*   **AI Inference:** Cloudflare Workers AI for embeddings (BGE-large) and generation (DeepSeek/Llama 3).
*   **Email (Inbound - Primary):** Forwarding/Redirection model via Office 365/Gmail to a Cloudflare Email Worker.
*   **Email (Outbound):** Resend API for sending replies from verified addresses.
*   **Admin Dashboard:** React + Vite (Internal Portal).
*   **Automation Engine:** Internal logic triggered by events (New Ticket, Reply) or Schedule (Cron) to execute Webhooks or Data Retention.

## 3. Core Workflows (By Priority)

### A. Priority 1: Email Ticketing (The "First Class" Channel)
1.  **Ticket & Article Creation:** First email creates a Ticket + Article. Subsequent emails create Articles.
2.  **Sequential Ticket Numbering:** Each ticket is assigned a sequential, human-readable ID (e.g., `#000001`). This is managed via a dedicated `ticket_sequence` table in D1 to ensure atomicity.
3.  **Shadow User Creation:** If the customer's email address does not exist in the system, a "shadow user" is automatically created and assigned the `customer` role to track their requests.
4.  **Email Reply Splitting:** Extracts only the latest reply, stripping historical threads.

### B. External Ticket API (Public REST)
For 3rd party system integrations, a set of secure REST endpoints are exposed:
1.  **Authentication:** Bearer Token authentication via API Keys managed in the Admin Portal.
2.  **Endpoints:**
    *   `POST /api/v1/tickets`: Create a new ticket (with initial article).
    *   `POST /api/v1/tickets/:id/articles`: Add a new article/reply to an existing ticket.
    *   `PATCH /api/v1/tickets/:id`: Update ticket status (e.g., Close Ticket) or priority.
    *   `GET /api/v1/tickets/:id`: Retrieve ticket details and article history.
3.  **Use Cases:** Integrating with internal CRM, ERP, or custom proprietary software.

### C. Automation & Webhook Triggers
Admins can define rules to trigger external actions based on ticket events:
1.  **Event Listeners:** Triggers can be set for events like `ticket.created` or `article.created`.
2.  **Condition Matching:** Support for matching fields like `subject` (e.g., "Starts with ABC") or `customer_email`.
3.  **Webhook Execution:** If conditions match, the Worker performs an outbound `fetch` to an external API endpoint.

### D. Data Privacy & Scheduled Retention (GDPR)
Automated cleanup is handled by a scheduled Cloudflare Worker (Cron Trigger):
1.  **Ticket Deletion Scheduler:** Deletes Ticket ➔ Articles ➔ R2 Attachments ➔ Orphaned Users.
2.  **User Deletion Scheduler:** Deletes User ➔ All associated Tickets/Articles/Attachments.

### E. Real-Time Presence & Collaboration
Luminatick exclusively uses a highly optimized WebSocket architecture to deliver real-time collision detection and agent presence:
*   **WebSocket Attachments:** Real-time presence is handled via Hibernatable WebSockets in a Durable Object (`NotificationDO`). By using `ws.serializeAttachment()` for session state, we achieve zero DB reads/writes and eliminate the need for keep-alive pings.
*   **Free-Tier Optimization:** This architecture protects the Cloudflare daily free tier limits by sleeping the DO between events and storing state completely in-memory attached to the sockets, while still maintaining ultra-low latency.

### F. Group-Based Accessibility & AI Vectorization (Workflows)
*   **Access:** Tickets are public until assigned to a Group.
*   **Asynchronous Processing:** To prevent UI latency during knowledge base article creation or when agents mark Q&A pairs, Luminatick utilizes Cloudflare Workflows.
*   **Zero-Latency Saves:** Content is instantly saved to D1/R2, and a background Workflow is triggered to handle the computationally heavy tasks of text chunking and AI embedding generation (BGE-large) for the Vectorize database.

### G. Customizable Ticket Attributes
Admins can define custom fields for tickets using a schema builder. Ticket data for these custom attributes is stored flexibly as JSON in a `custom_fields` column on the tickets table. This allows for dynamic data collection without needing to alter the core database schema for every new field. **UI/UX Note:** To simplify ticket creation, custom attributes are omitted from the initial creation form. They are displayed and editable exclusively in the right-hand sidebar of the Ticket Detail page.

### H. Hybrid Storage Offloading (D1 to R2)
Cloudflare D1 currently has a 10GB storage limit per database. To ensure Luminatick can scale to handle massive volumes of tickets without hitting this constraint, the system employs a "Hybrid Offloading" architecture (Option 3) for heavy text payloads:
1.  **Metadata in D1:** The `articles` table stores essential metadata, a plain text `snippet` (for quick previews), and an R2 reference (`body_r2_key`), rather than the full message body.
2.  **Payloads in R2:** The complete HTML or Markdown content of every ticket article/reply is saved as an individual object in Cloudflare R2, which provides cost-effective, virtually unlimited storage.
3.  **Seamless Retrieval:** When a user views a ticket thread, the backend queries D1 for the list of articles and concurrently fetches the full bodies from R2, merging them before sending the payload to the frontend. This approach keeps the D1 database lean, extremely fast, and well within limits.

## 4. D1 Database Schema (Proposed)

### Configuration Keys (`config` table)
The `config` table stores organization-wide settings and system defaults managed via the General Settings dashboard. Known keys include:
- `COMPANY_NAME`: The name of the organization (e.g., used in outgoing emails).
- `PORTAL_URL`: The base URL of the support portal.
- `SYSTEM_TIMEZONE`: Default timezone for the system (e.g., `UTC`, `America/New_York`).
- `TICKET_PREFIX`: The prefix used for sequential ticket numbering (e.g., `TKT` for `TKT-1001`).
- `DEFAULT_EMAIL_SIGNATURE`: The default signature appended to agent email replies if a personal signature is not set.

```sql
-- Core Configurations
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Ticket Number Sequence
CREATE TABLE IF NOT EXISTS ticket_sequence (
    id INTEGER PRIMARY KEY AUTOINCREMENT
);

-- API Keys for 3rd Party Access
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL, -- First few characters for identification
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME
);

-- ... (automation_rules, groups, users, user_groups remain unchanged) ...

-- Ticket Fields (Custom Schema Builder)
CREATE TABLE IF NOT EXISTS ticket_fields (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL, -- e.g., 'text', 'dropdown', 'checkbox'
    options JSON, -- For select options
    is_required BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge Categories
CREATE TABLE IF NOT EXISTS knowledge_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(parent_id) REFERENCES knowledge_categories(id) ON DELETE SET NULL
);

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    ticket_no INTEGER, -- Sequential ticket number
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'normal',
    customer_id TEXT,
    customer_email TEXT NOT NULL,
    assigned_to TEXT,
    group_id TEXT,
    source TEXT NOT NULL,
    custom_fields JSON, -- Flexible JSON storage for custom ticket attributes
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id),
    FOREIGN KEY (group_id) REFERENCES groups(id)
);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_no ON tickets(ticket_no);

-- Articles (Hybrid Offloading to R2)
CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    sender_id TEXT,
    sender_type TEXT NOT NULL,
    body TEXT, -- Legacy, but may contain fallback or migrated data
    body_r2_key TEXT, -- Key for the full HTML/Markdown body stored in R2
    snippet TEXT, -- Plain text preview of the body stored in D1
    raw_email_id TEXT,
    qa_type TEXT CHECK(qa_type IN ('question', 'answer')) DEFAULT NULL,
    is_internal BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
);

-- Attachments
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    content_type TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_id) REFERENCES articles(id)
);

-- Knowledge Base
CREATE TABLE IF NOT EXISTS knowledge_docs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    category_id TEXT REFERENCES knowledge_categories(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 5. Implementation Phasing (Revised)
*   **Phase 1.1:** Core infra & D1 Schema (Completed).
*   **Phase 1.2:** Email Inbound Worker (Reply Splitting) & Outbound (Resend) (Completed).
*   **Phase 1.3:** Admin Dashboard (MFA, Ticket list, Group filters) (Completed).
*   **Phase 1.4:** External Ticket API (v1 Public REST) & API Key Management (Completed).
*   **Phase 1.5:** Automation Engine (Event-based Webhooks & Scheduled Retention) (Completed).
*   **Phase 1.6:** Real-time Notifications & Presence (WebSocket Attachments via Durable Objects) (Completed).
*   **Phase 1.7:** Knowledge Base (RAG) & Ticket Q&A Vectorization (Completed).
*   **Phase 1.8:** Web Widget Plugins (Ticket Form & AI Chat) (Completed).
*   **Phase 2.1:** Deployment Automation (Automated setup, secrets management, and unified deployment - Completed).
*   **Phase 2.2:** Dashboard Layout Redesign (See `phase-2.2-layout-redesign.md`)
*   **Phase 2.3:** General Settings (See `phase-2.3-general-settings-plan.md`)
*   **Phase 2.4:** MFA Setup Page (See `phase-2.4-mfa-setup-plan.md`)
*   **Phase 2.5:** Customizable Ticket Attributes (See `phase-2.5-custom-attributes-design.md`)
*   **Phase 2.6:** Ticket Filters Workspace (See `phase-2.6-filters-implementation-plan.md`)
*   **Phase 2.7:** Channels Hub (See `phase-2.7-channels-implementation-plan.md`)
*   **Phase 3.1:** Customer Portal (Completed - See `phase-3.1-customer-portal-spec.md`)
*   **Phase 3.2:** Turnstile Spam Protection (incorporating [turnstile-implementation-plan.md](turnstile-implementation-plan.md) and [turnstile-ticket-creation-plan.md](turnstile-ticket-creation-plan.md))
*   **Phase 3.3:** Advanced Knowledge Base & AI Agent Enhancements (incorporating [knowledge-enhancement-plan.md](knowledge-enhancement-plan.md) and [kb-agent-enhancement-plan.md](kb-agent-enhancement-plan.md))

## 6. Dashboard Implementation

The Admin Dashboard is built with React, Vite, and Tailwind CSS, providing a high-performance internal portal for agents and admins.

### A. Structure & Layout
- **Global Layout:** A persistent main sidebar for core navigation (Dashboard, Filters, Knowledge Base). The user profile at the bottom left is an icon-only representation to save space.
- **Filters (Workspace Layout):** The main workspace uses a split-pane layout: a left sub-sidebar lists available custom and default filters, and the right main area displays the paginated list of tickets matching the selected filter.
- **Settings Hub (`SettingsLayout`):** All administrative pages (Users, Groups, Ticket Fields, Filters, API Keys, Widget, Automation, Settings) are nested within a dedicated settings hub, accessible from the main sidebar. Admins can create custom ticket views in the "Filters" settings using a structured condition builder (schema: `{ field, operator, value }` with operators like `equals`, `not_equals`, `contains`, `in`).
- **Responsive Design:** Mobile-friendly layout with a collapsible sidebar and optimized data tables.
- **Scroll Management:** Fixed layout with independent scrolling for the sidebar(s) and main content area to improve usability in long ticket lists.

### B. Internal Dashboard API
While the Public REST API is for 3rd party integrations, the Dashboard uses an internal `/api/` set of endpoints protected by JWT and MFA:
- **`GET /api/tickets`**: Retrieves a paginated list of tickets.
  - *Pagination:* Accepts `page`, `limit`, and `filter_id` parameters. Returns `{ data: Ticket[], meta: { total, page, limit, total_pages } }`.
  - *Filtering:* Applied via the provided `filter_id` which resolves the structured conditions.
  - *Search:* Supports searching by sequential Ticket ID (e.g., searching for "123" or "#000123").
- **`GET /api/settings/filters`**: CRUD endpoints for managing custom ticket filters and retrieving the default protected ones ("Open Tickets", "All Tickets").
- **`GET /api/users`**: Retrieves a paginated list of users, filterable by role.
- **`GET /api/groups`**: Lists all available groups for ticket assignment.

## 7. Security & Access Control

### A. Authentication & MFA
- **JWT:** All dashboard requests require a valid JWT in the `Authorization` header.
- **MFA (TOTP):** Mandatory for all admin/agent accounts. The `mfaGuard` middleware ensures that the session has been verified via TOTP before allowing access to sensitive data.

### B. Role-Based Access Control (RBAC) & Granular Permissions
Luminatick implements a granular RBAC system using the `roleGuard` middleware:
- **`roleGuard(allowedRoles: string[])`**: A high-order middleware that checks the `role` field in the decoded JWT payload.
- **Roles:**
  - `admin`: Full access to all settings, users, and tickets.
  - `agent`: Access to ticket management and KB, restricted to assigned groups.
  - `customer`: Limited to widget-based interactions (no dashboard access).

**Granular Agent Settings Permissions:**
In addition to role-based access, administrators can restrict agent access to specific settings modules (e.g., general, users, groups, ticket_fields, etc.) via a dedicated `/settings/agent-permissions` page. This ensures agents only see and modify the settings sections they are explicitly authorized for, improving security and decluttering their dashboard interface.

### C. Group Management & Ticket Access Control
The system organizes agents and secures ticket access via a robust group management feature:

1.  **Group Organization**: Admins can create support groups (e.g., "Technical Support", "Billing") and assign agents to one or more groups.
2.  **Ticket Assignment**: Every ticket can be assigned to a specific group. If unassigned, it is actionable by all agents.
3.  **Access Control Enforcement**:
    - **Visibility**: (Future) Agents only see tickets in their assigned groups.
    - **Actionability**: Agents can only post replies or internal notes to tickets assigned to groups they belong to.
    - **Admin Overrides**: Admins have "super-agent" privileges, allowing them to view and manage tickets across all groups regardless of membership.
4.  **Database Integration**: The `user_groups` table maintains the many-to-many relationship between users and groups, while the `tickets.group_id` column enforces the association.
5.  **API Endpoints**: A dedicated set of `/api/groups` endpoints provides full CRUD for admins and list views for agents.

### D. Application-Layer Encryption via Master Key
To support expanding third-party integrations (e.g., Slack tokens, external CRM API keys) without modifying environment variables and redeploying the Cloudflare Worker, Luminatick employs an Application-Layer Encryption design.
- **`APP_MASTER_KEY` Requirement:** A single strong master key is provided as an environment variable/secret during deployment.
- **Secure D1 Storage:** Sensitive integration tokens are encrypted in memory using the `APP_MASTER_KEY` before being stored in the D1 database.
- **Dynamic Integrations:** This allows admins to add, rotate, or remove third-party integration credentials dynamically via the Dashboard UI without triggering a new infrastructure deployment.

## 8. Recent Updates & Fixes
*   **Knowledge Base Enhancements:** Added hierarchical category management and an integrated Markdown editor. Agents can now create and organize articles directly within the dashboard. The backend handles markdown saving to R2 and automatic vectorization.
*   **Timestamp Standardization:** Fixed an 8-hour timezone shift bug by standardizing all ticket and article creations to use explicit UTC ISO strings (`new Date().toISOString()`) instead of relying on SQLite's `CURRENT_TIMESTAMP`.
*   **UI & Workflow Improvements:**
    *   Ticket replies and internal notes are correctly sorted chronologically (ASC).
    *   The action menu (3 dots) on the Tickets list page has been implemented, providing a dropdown with a "View Ticket" link.
    *   When an agent creates a ticket on behalf of a customer, the initial message is now correctly attributed to the customer (`sender_type: 'customer'`, `qa_type: 'question'`) rather than the agent.
