# Luminatick Implementation Tasks

## Phase 1.1: Core Infrastructure & D1 Schema
- [x] Initialize monorepo structure with placeholder `package.json` files (`/apps/server`, `/apps/dashboard`, `/apps/widget`, `/packages/shared`).
- [x] Configure `wrangler.json` with bindings for D1, R2, Vectorize, and AI.
- [x] Create initial D1 migration SQL (`0001_initial_schema.sql`) for all tables:
    - `config`
    - `api_keys`
    - `automation_rules`
    - `groups`
    - `users`
    - `user_groups`
    - `tickets`
    - `articles`
    - `attachments`
    - `knowledge_docs`
- [x] Implement Sequential Ticket Numbering (#000001 format) via `ticket_sequence` table.
- [x] Implement `npm run seed` script:
    - Create default configuration entries.
    - Generate an initial Admin user.
    - Output Admin credentials to the console.
- [x] Create `.env.example` with placeholders for required secrets. (Note: Resend API Key has been moved to the Dashboard Settings).

## Phase 1.2: Email Inbound & Outbound
- [x] Implement Cloudflare Email Worker handler in `apps/server/src/index.ts`:
    - Parse incoming email using `postal-mime`.
    - **Reply Splitting Logic:** Extract latest reply and strip historical threads in `apps/server/src/services/email/reply-parser.ts`.
    - Identify existing ticket by subject (parsing `[#ID]`) or threading headers (`In-Reply-To`/`References`).
    - Store raw email parts and attachments in R2 via `StorageService`.
- [x] Implement Outbound Email service using Resend API in `apps/server/src/services/email/outbound.service.ts`:
    - Proper threading logic using `In-Reply-To` and `References` headers.
    - Support for multiple recipients and attachments.
    - Secure Resend credentials (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`) configuration via the Dashboard UI (Settings -> Channels -> Email).
- [x] Create a shared `EmailService` utility (Inbound/Outbound) for seamless ticket management.
- [x] Comprehensive test suite available in `apps/server/src/services/email/__tests__/`.

## Phase 1.3: Admin Dashboard (Core)
- [x] Initialize React + Vite + Tailwind CSS dashboard.
- [x] Implement JWT-based authentication on the Worker backend.
- [x] **MFA Implementation:**
    - [x] Generate TOTP secrets for users.
    - [x] QR Code generation for Google Authenticator setup on first login.
    - [x] Middleware to enforce MFA check on protected routes.
- [x] Create basic Dashboard UI:
    - [x] **Dashboard Stats:** Implement counters and redirection for key metrics.
    - [x] Ticket list view with status/priority/group filters.
    - [x] Ticket detail view showing the threaded "Articles".
    - [x] **New Ticket Form:** Add UI for creating new tickets directly from the dashboard.
    - [x] **Ticket Reply Logic:** Support for agent responses, internal notes, and secure file uploads/attachments (achieving feature parity with the Customer Portal).
- [x] **Users/Settings Pages:** UI for managing agents, groups, and system configuration.
- [x] **Group Management:**
    - [x] Implement CRUD API for groups (`/api/groups`).
    - [x] Implement Group membership API (`/api/groups/:id/members`).
    - [x] Implement Group Management UI (Create groups, assign agents).
    - [x] Integrate group-based RBAC for ticket replies.


## Phase 1.4: External Ticket API & API Key Management (100% Complete)
- [x] Implement API Key generation logic (Secret hashing with prefix).
- [x] Create Admin UI for managing API Keys (Create, Revoke, View Prefix).
- [x] Develop Public REST API endpoints (`/api/v1/...`):
    - [x] `POST /tickets` (Include rate limiting).
    - [x] `POST /tickets/:id/articles`.
    - [x] `PATCH /tickets/:id` (Close/Update).
    - [x] `GET /tickets/:id`.
- [x] Implement API Key authentication middleware for public endpoints.

## Phase 1.5: Automation Engine (100% Complete)
- [x] Implement Event Dispatcher in the backend to trigger rules on `ticket.created`, etc.
- [x] Develop Condition Evaluator (Regex matching on subject/body).
- [x] Implement Webhook Executor (Outbound `fetch` with JSON payload).
- [x] **Scheduled Retention Scheduler:**
    - [x] Implement `scheduled` handler (Cron Trigger).
    - [x] Logic for cascading deletion of Tickets ➔ Articles ➔ R2 ➔ Orphaned Users.
    - [x] Create Admin UI for managing automation rules (Create, Edit, Delete, Toggle).


## Phase 1.6: Real-time Notifications & Presence (Dual-Mode) (100% Complete)
- [x] Create `agent_presence` table in D1.
- [x] Implement `/api/v1/presence` endpoint in the Worker with JWT authentication.
- [x] **Dual-Mode Logic:**
    - [x] Implement HTTP Polling with optimized interval shifting (30s active / 60s background).
    - [x] Rely on `document.visibilityState` to aggressively protect free tier quotas.
    - [x] Restore and optionally enable WebSockets / Durable Objects for high-performance paid tier.
    - [x] Control via global admin setting (`REALTIME_TRANSPORT` = 'polling' | 'websocket').
- [x] **Frontend Integration:**
    - [x] Develop dynamic transport hook for switching between polling and WebSockets.
    - [x] Implement global notification toast system in `Layout`.
    - [x] Add active viewers sidebar and real-time presence indicators to `TicketDetailPage`.

## Phase 1.7: Knowledge Base (RAG) & Ticket Q&A (100% Complete)
- [x] Implement Q&A marking UI in the Ticket Detail view.
- [x] Create Vectorize ingestion logic:
    - [x] Bundle Q&A pairs with chunking support.
    - [x] Generate embeddings using Workers AI (`@cf/baai/bge-large-en-v1.5`).
    - [x] Store in Vectorize index with metadata.
- [x] Implement Knowledge Base upload (R2) and background parsing for `.md`, `.txt`, `.csv`.
- [x] Integrate Vectorize search into the Email/Ticket creation flow for AI auto-drafts.
- [x] **Validation & Security Refinement:**
    - [x] Robust error handling for AI/Vectorize APIs.
    - [x] Enhanced prompt engineering with system instructions.
    - [x] Frontend "Append/Replace" UI for AI suggestions.
    - [x] "Vectorized" badges for indexed articles.

## Phase 1.8: Web Widget Plugins (100% Complete)
- [x] Develop React-based widget with Shadow DOM encapsulation.
- [x] Implement "Library Mode" build to produce a single `lumina-widget.js`.
- [x] Create toggleable components:
    - `TicketForm.tsx`
    - `AiChat.tsx`
- [x] Implement Admin UI for Widget Setup (Copy-paste snippet generator).
- [x] Create backend public endpoints for widget config and chat.
- [x] Implemented RAG-based AI chat in the widget.

## Phase 2.1: Deployment Automation (100% Complete)
- [x] Create automated infrastructure provisioning script (`scripts/setup.js`).
- [x] Create secure production secrets management script (`scripts/secrets.js`).
- [x] Implement unified deployment orchestration in root `package.json`.
- [x] Create comprehensive `docs/deployment.md` guide.
- [x] **New:** Create detailed `docs/email-setup.md` for Gmail Forwarding and Cloudflare Routing.

## Phase 2.2: Dashboard Layout Redesign
- [ ] Implement Dashboard Layout Redesign (see `docs/phase-2.2-layout-redesign.md`)

## Phase 2.3: General Settings, Permissions & Usage (100% Complete)
- [x] Implement General Settings Form (`COMPANY_NAME`, `PORTAL_URL`, `SYSTEM_TIMEZONE`, etc.).
- [x] Integrate Application-Layer Encryption (`APP_MASTER_KEY`) for secure storage of external tokens.
- [x] Create a dedicated "Usage & Costs" page in the dashboard.
- [x] Integrate Cloudflare GraphQL Analytics API for fetching usage metrics across Workers, D1, R2, AI, and Vectorize.
- [x] Implement Granular Agent Settings Permissions, introducing `/settings/agent-permissions` page for admins to restrict agent access to specific settings modules (e.g., general, users, groups, ticket_fields, etc.).

## Phase 2.4: MFA Setup Page
- [ ] Implement MFA Setup Page (see `docs/phase-2.4-mfa-setup-plan.md`)

## Phase 2.5: Customizable Ticket Attributes
- [ ] Implement Customizable Ticket Attributes (see `docs/phase-2.5-custom-attributes-design.md`)

## Phase 2.6: Ticket Filters Workspace
- [ ] Implement Ticket Filters Workspace (see `docs/phase-2.6-filters-implementation-plan.md`)

## Phase 2.7: Channels Hub
- [x] Implement Channels Hub (Email Channel UI completed, including secure Resend API Key and From Email configuration). (see `docs/phase-2.7-channels-implementation-plan.md`)

## Phase 3.1: Customer Portal (100% Complete)
- [x] Implement Passwordless Magic Link & OTP authentication.
- [x] Create Vite + React frontend in `apps/portal` for customer self-service.
- [x] Implement new R2 presigned URL upload flow for secure file attachments.

## Phase 3.2: Turnstile Spam Protection
- [ ] Implement Turnstile Spam Protection (see `docs/turnstile-implementation-plan.md` and `docs/turnstile-ticket-creation-plan.md`)

## Phase 3.3: Advanced Knowledge Base & AI Agent Enhancements
- [ ] Implement Advanced Knowledge Base & AI Agent Enhancements (see `docs/knowledge-enhancement-plan.md` and `docs/kb-agent-enhancement-plan.md`)

## Recent Enhancements & Fixes
- [x] **AI Suggestion & RAG Fixes:**
    - [x] Unified vector search across Answer and SOP tiers (replaced sequential querying).
    - [x] Adjusted tier similarity thresholds and increased top-K limits to prevent valid SOPs from being pushed out by generic answers.
    - [x] Handled R2 body hydration for AI context retrieval, adapting to the recent Option 3 R2 offloading migration for article bodies.
    - [x] Implemented strict security mitigations, including system prompt reinforcement against prompt injection and explicit memory/CPU limits to prevent DoS via massive token contexts.
- [x] **Knowledge Base Enhancements:**
    - [x] Added hierarchical category management (CRUD for `knowledge_categories`).
    - [x] Implemented a split-pane UI for the Knowledge Base page (Category Tree + Article List).
    - [x] Created a full-featured Markdown editor (`KnowledgeEditorPage`) for authoring and editing articles directly in the dashboard.
    - [x] Updated backend services to handle direct markdown saving to R2 and automatic vectorization.
    - [x] Fixed API route mismatches between frontend and backend for fetching and updating articles.
    - [x] Fixed the Cloudflare AI embeddings array shape mismatch (handling 1D vs 2D arrays).
    - [x] Fixed Vectorize metadata validation by removing the reserved 'id' field from the metadata payload.
    - [x] Added `remote: true` to the ai and vectorize bindings in `wrangler.json` to allow local development to work with remote resources.
    - [x] Replaced the browser native `window.confirm()` with a custom HTML dialog in the Knowledge Base frontend for deleting articles and categories.
- [x] **Filters Feature (Workspace & Settings):** 
    - [x] Implemented split-pane workspace layout (left sidebar for filters, right area for tickets).
    - [x] Renamed main sidebar link from "Tickets" to "Filters".
    - [x] Added `FiltersSettingsPage.tsx` with a structured condition builder (`{ field, operator, value }`).
    - [x] Added default protected filters ("Open Tickets", "All Tickets").
    - [x] Updated backend API (`GET /api/tickets`) with dynamic pagination (`{ data, meta }`) and `filter_id` support.
    - [x] Added CRUD endpoints at `/api/settings/filters`.
- [x] **Customizable Ticket Attributes:** Added `ticket_fields` schema, `custom_fields` JSON column, Settings UI, and Detail Page sidebar UI.
- [x] **Agent Attachments:** Implemented secure R2 presigned URL uploads from the Admin Dashboard, allowing agents to attach files to ticket replies and achieving feature parity with the Customer Portal.
- [x] **Shadow User Creation:** Automatically create 'customer' users for new unknown email addresses during ticket creation.
- [x] **Hybrid Storage Offloading:** Implemented "Option 3" architecture, offloading heavy ticket article bodies to R2 while keeping metadata in D1 to completely bypass the 10GB D1 storage limit.
- [x] **Timestamp Standardization:** Enforced UTC ISO strings (`new Date().toISOString()`) across ticket/article creation to fix timezone shifts.
- [x] **UI/Workflow:** Fixed chronological sorting (ASC) for ticket replies/notes.
- [x] **UI/Workflow:** Activated the Action Menu (3 dots) on the Tickets list page.
- [x] **UI/Workflow:** Corrected sender attribution when an agent creates a ticket on behalf of a customer.
