# Phase 1.3: Admin Dashboard (Core) - Technical Specification

## 1. Overview
Phase 1.3 focuses on the administrative interface for agents and admins to manage tickets. This includes a secure authentication system with Multi-Factor Authentication (MFA), a comprehensive ticket management API, and the foundation of the React-based dashboard.

## 2. Authentication Flow

### 2.1 JWT Strategy
- **JWT Payload:**
  ```json
  {
    "sub": "user_uuid",
    "email": "agent@company.com",
    "role": "admin" | "agent",
    "mfa_verified": boolean,
    "iat": number,
    "exp": number
  }
  ```
- **Tokens:** A single JWT stored in a secure `HttpOnly` cookie or as a Bearer token (depending on preference, but for SPA, `HttpOnly` is safer against XSS). For this spec, we will use a Bearer token stored in `localStorage` for simplicity in the initial phase, but transitioning to cookies is recommended for production.

### 2.2 Login & MFA Sequence
1.  **Stage 1: Credentials Check (`POST /api/auth/login`)**
    - Receives `email` and `password`.
    - Verifies against `users` table.
    - If `mfa_enabled` is `false`, returns a full JWT with `mfa_verified: true`.
    - If `mfa_enabled` is `true`, returns a short-lived (5 min) "pre-mfa" JWT with `mfa_verified: false` and a status `200` with body `{ mfa_required: true }`.

2.  **Stage 2: MFA Verification (`POST /api/auth/mfa/verify`)**
    - Requires "pre-mfa" JWT in header.
    - Receives `code` (6-digit TOTP).
    - Verifies `code` using `mfa_secret` from DB.
    - If valid, returns a new long-lived (e.g., 24h) JWT with `mfa_verified: true`.

3.  **Stage 3: MFA Setup (`POST /api/auth/mfa/setup`)**
    - For users with `mfa_enabled: false`.
    - Generates a new TOTP secret using `otpauth`.
    - Returns the `secret` and a `provisioning_uri` (e.g., `otpauth://totp/Luminatick:email?secret=...`).
    - User must submit a valid code from their app to `POST /api/auth/mfa/confirm` to finalize and set `mfa_enabled: true`.

## 3. Dashboard API (Hono)

The API will be implemented in `apps/server/src/handlers/dashboard.handler.ts` and mounted in `index.ts`.

### 3.1 Ticket Management
- `GET /api/tickets`
  - **Query Params:**
    - `filter_id`: ID of the filter to apply (optional).
    - `status`: `open`, `pending`, `resolved`, `closed` (comma-separated for multiple).
    - `priority`: `low`, `normal`, `high`, `urgent`.
    - `assigned_to`: User ID.
    - `group_id`: Group ID.
    - `ticket_no`: Sequential ticket number (e.g., `123`) for exact search.
    - `page`: Default 1.
    - `limit`: Default 50.
  - **Response:** Paginated response containing `{ data, meta }` with a list of tickets and pagination metadata.
  - **UI Note:** The Action Menu (3 dots) on each row provides quick actions like "View Ticket".

- `GET /api/tickets/:id`
  - **Response:** Complete ticket object, including:
    - `articles`: Array of articles ordered chronologically (ASC) by `created_at`.
    - `attachments`: Array of attachments per article.
    - `customer`: Customer details (if available).
    - `assignee`: Agent details.
    - `custom_fields`: JSON object containing custom attributes.

- `PATCH /api/tickets/:id`
  - **Payload:** `{ status?: string, priority?: string, assigned_to?: string, group_id?: string, custom_fields?: Record<string, any> }`
  - **Action:** Updates ticket properties. `custom_fields` updates are merged with existing data (partial update). Creates a system "article" note if necessary.

- `POST /api/tickets/:id/articles`
  - **Payload:** `{ body: string, is_internal: boolean, attachments?: Array<{ id: string, name: string, size: number, type: string }> }`
  - **Action:** Appends a new article (reply or internal note) to the ticket. Agents can upload and send attachments directly from the Admin Dashboard using secure R2 presigned URLs, achieving feature parity with the Customer Portal.

### 3.2 User & Group Management

#### 3.2.1 User Management
- `GET /api/users`: List all users with pagination and role filters.
- `GET /api/users/agents`: List all users with role `admin` or `agent` (utility for assignment).
- `GET /api/settings/agent-permissions`: Fetch granular permission configurations for agent roles across different settings modules.
- `PATCH /api/settings/agent-permissions`: Update agent permissions, allowing admins to restrict access to specific settings areas.

#### 3.2.2 Group Management API
- `GET /api/groups`
  - **RBAC:** `agent`, `admin`
  - **Description:** List all available support groups.
- `POST /api/groups`
  - **RBAC:** `admin` only
  - **Payload:** `{ name: string, description?: string }`
  - **Description:** Create a new support group.
- `DELETE /api/groups/:id`
  - **RBAC:** `admin` only
  - **Description:** Delete a group. Fails if tickets are currently assigned to the group.
- `GET /api/groups/:id/members`
  - **RBAC:** `agent`, `admin`
  - **Description:** List all agents assigned to a specific group.
- `POST /api/groups/:id/members`
  - **RBAC:** `admin` only
  - **Payload:** `{ userId: string }`
  - **Description:** Add an agent to a group.
- `DELETE /api/groups/:id/members/:userId`
  - **RBAC:** `admin` only
  - **Description:** Remove an agent from a group.

### 3.3 Ticket Access Control Integration
The group management system integrates with ticket access control at the API level:
- **Assignment:** Tickets can be assigned to specific groups via `PATCH /api/tickets/:id`.
- **Restricted Replies:** Agents (non-admins) can only post articles (replies or internal notes) to a ticket if:
    1. The ticket has no group assigned, OR
    2. The agent is a member of the group assigned to the ticket.
- **RBAC Enforcement:** Handled via `roleGuard` and inline group membership checks in `dashboard.handler.ts`.

### 3.4 Filters Management API
- `GET /api/settings/filters`
  - **RBAC:** `agent`, `admin`
  - **Description:** List all available custom and default ticket filters.
- `POST /api/settings/filters`
  - **RBAC:** `admin` only
  - **Payload:** `{ name: string, conditions: Array<{ field, operator, value }>, match_all: boolean }`
  - **Description:** Create a new custom ticket view. Supported operators: `equals`, `not_equals`, `contains`, `in`.
- `PATCH /api/settings/filters/:id`
  - **RBAC:** `admin` only
  - **Description:** Update an existing custom filter. Default protected filters ("Open Tickets", "All Tickets") cannot be modified.
- `DELETE /api/settings/filters/:id`
  - **RBAC:** `admin` only
  - **Description:** Delete a custom filter. Default protected filters cannot be deleted.

## 4. Frontend Components & Hooks

### 4.1 Group Management Components
- **`GroupsPage.tsx`**: The main management interface.
    - Displays a table of all groups.
    - Provides a "Create Group" modal for admins.
    - Includes a "Manage Members" modal to view and edit group assignments.
- **`ManageMembersModal`**: Sub-component within `GroupsPage` for handling agent assignments.
    - Lists current members with removal options.
    - Searchable list of available agents to add.

### 4.2 Group Management Hooks
- **`useGroups()`**: Fetches all groups.
- **`useCreateGroup()`**: Mutation to create a new group.
- **`useDeleteGroup()`**: Mutation to remove a group.
- **`useGroupMembers(groupId)`**: Fetches members for a specific group.
- **`useAddMember()`**: Mutation to add a user to a group.
- **`useRemoveMember()`**: Mutation to remove a user from a group.
- **`useAgents()`**: Fetches all users with agent/admin roles for assignment.

### 4.3 Ticket Fields Management
- **`TicketFieldsPage.tsx`**: A settings page for admins to manage customizable ticket attributes.
    - Supports CRUD operations on the `ticket_fields` table.
- **Custom Attributes Sidebar (`TicketDetailPage`)**:
    - Renders dynamic form inputs for `custom_fields` based on the configured schemas.
    - Automatically omitted from the New Ticket creation form to maintain a streamlined UX.

### 4.4 Filters & Workspace Layout
- **`TicketListPage.tsx` (Filters Workspace)**: Replaces the traditional full-width ticket list. Implements a split-pane layout:
    - **Left Sub-sidebar**: Lists available custom and default filters (e.g., "Open Tickets", "All Tickets").
    - **Right Main Area**: Displays the paginated (50 tickets per page) list of tickets matching the selected filter, with Previous/Next controls.
- **`FiltersSettingsPage.tsx`**: A dedicated page within the Settings hub (`/settings/filters`) for admins to create and manage custom ticket views.
    - Features a structured condition builder similar to the Automation Engine.
    - Schema: Array of objects `{ field, operator, value }`.
    - Supports operators: `equals`, `not_equals`, `contains`, and `in`.

### 4.5 General Settings
- **`SettingsPage.tsx` (General Settings)**: The "General" tab within the Settings Hub (`/settings/general`). This page allows administrators to manage organization-wide configuration and system defaults.
    - It directly interacts with the `settings` database table to persist key-value pairs.
    - **Managed Configuration Keys:**
        - `COMPANY_NAME`: The name of the organization (e.g., used in outgoing emails).
        - `PORTAL_URL`: The base URL of the support portal.
        - `SYSTEM_TIMEZONE`: Default timezone for the system (e.g., `UTC`, `America/New_York`).
        - `TICKET_PREFIX`: The prefix used for sequential ticket numbering (e.g., `TKT` for tickets like `TKT-1001`).
        - `DEFAULT_EMAIL_SIGNATURE`: The default signature appended to agent email replies if a personal signature is not set.
    - Implements validation to ensure keys are uppercase alphanumeric with underscores, and values are limited to 5000 characters.

### 4.6 Security Profile
- **`SecurityProfilePage.tsx`**: A user-specific settings page accessible via the user avatar dropdown menu.
    - Allows individual users (both agents and admins) to manage their own security settings.
    - Displays the current Multi-Factor Authentication (MFA) status.
    - Provides the workflow to set up MFA or the action to disable it if currently enabled.

### 4.7 Agent Permissions Settings
- **`AgentPermissionsPage.tsx`**: A dedicated configuration page located at `/settings/agent-permissions`.
    - Allows administrators to implement "Granular Agent Settings Permissions".
    - Enables restricting agent access to specific settings modules (e.g., general, users, groups, ticket_fields, etc.).
    - Ensures agents only see and modify the settings sections they are explicitly authorized for, improving security and decluttering their dashboard interface.

## 4. MFA Implementation Details

### 4.1 Library: `otpauth`
Use the `otpauth` package which is compatible with Cloudflare Workers (Web Crypto API).

### 4.2 Secret Generation
```typescript
import * as OTPAuth from "otpauth";

// Generate a random secret
const secret = new OTPAuth.Secret({ size: 20 });

// Create a new TOTP object
let totp = new OTPAuth.TOTP({
  issuer: "Luminatick",
  label: userEmail,
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  secret: secret,
});

// Get provisioning URI for QR code
const uri = totp.toString();
```

### 4.3 QR Code
The backend returns the `uri`. The frontend uses `qrcode.react` to render it:
```tsx
import { QRCodeSVG } from 'qrcode.react';
// ...
<QRCodeSVG value={mfaUri} size={256} />
```

## 5. Frontend Architecture (`apps/dashboard`)

### 5.1 Tech Stack
- **Framework:** React 18 + Vite.
- **Styling:** Tailwind CSS + Headless UI or Shadcn/UI (Radix UI).
- **Data Fetching:** React Query (TanStack Query).
- **State Management:** Zustand (for simple auth and UI state).
- **Icons:** Lucide React.

### 5.2 Directory Structure
```text
apps/dashboard/src/
├── api/             # API client (Axios/Fetch wrappers)
├── components/      # Reusable UI components (Button, Input, Modal)
│   ├── layout/      # Layout components (Layout, SettingsLayout)
│   └── ticket/      # Ticket-specific components (ArticleThread, StatusBadge)
├── hooks/           # Custom hooks (useAuth, useTickets)
├── pages/           # Page components (Login, TicketListPage, TicketDetailPage, FiltersSettingsPage)
├── store/           # Zustand stores (authStore)
├── types/           # TS Interfaces (mirrored or shared from @luminatick/shared)
└── App.tsx          # Main router setup
```

### 5.3 Authentication Context
A `useAuth` hook and provider will manage:
- Current user profile.
- JWT storage and injection into API requests.
- Redirects to `/login` if unauthorized.

### 5.4 Navigation Hierarchy
- **Main Sidebar:** Contains core operational routes (Dashboard, Filters, Knowledge Base). The "Filters" route acts as a split-view workspace to browse tickets by custom criteria. The user profile at the bottom left is represented as an icon-only button (avatar) that opens a dropdown menu containing links to the Security Profile and Logout.
- **Settings Hub (`SettingsLayout`):** A nested layout housing all administrative pages. This centralizes management for Users, Groups, Ticket Fields, Filters (`FiltersSettingsPage.tsx`), API Keys, Widget, Automation, General Settings, and Agent Permissions (`/settings/agent-permissions`), keeping the main operational view uncluttered. Access to these sub-pages is controlled by the agent permissions feature.

## 6. Security & Middleware

### 6.1 `authMiddleware`
Verifies the JWT using `hono/jwt`.
```typescript
import { jwt } from 'hono/jwt';
const auth = jwt({ secret: env.JWT_SECRET });
```

### 6.2 `mfaMiddleware`
Ensures that if MFA is enabled for the user, they have completed the MFA challenge.
```typescript
const mfaGuard = async (c, next) => {
  const payload = c.get('jwtPayload');
  if (!payload.mfa_verified) {
    return c.json({ error: 'MFA_REQUIRED' }, 403);
  }
  await next();
};
```

### 6.3 `roleGuard` (Optional for Phase 1.3)
Restricts certain actions (like deleting users) to `role: 'admin'`.

## 7. Tasks & Milestones
1.  **Server:** Implement `AuthHandler` with login/mfa logic.
2.  **Server:** Implement `DashboardHandler` for ticket list/detail/update.
3.  **Shared:** Move `Ticket`, `Article`, `User` types to `@luminatick/shared`.
4.  **Dashboard:** Initialize Vite project and setup basic routing.
5.  **Dashboard:** Implement Login and MFA setup/verify pages.
6.  **Dashboard:** Implement Ticket list view with filters.
7.  **Dashboard:** Implement Ticket detail view with article threading and secure file attachments.
