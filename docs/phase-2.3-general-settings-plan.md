# General Settings, Permissions & Usage Implementation Plan

## Overview
This plan outlines the steps to implement the "General" settings section, "Usage & Costs" tracking page, and "Granular Agent Settings Permissions" within the Luminatick dashboard. It involves defining core configuration keys, creating API hooks for data fetching, building dedicated form components for the frontend, restricting agent access to specific settings modules, and integrating Cloudflare's GraphQL Analytics API for cost tracking.

## 1. General Settings Form
The core settings to manage in this section:
- `COMPANY_NAME` (e.g., "Luminatick Support")
- `PORTAL_URL` (e.g., "https://support.example.com")
- `SYSTEM_TIMEZONE` (e.g., "UTC", "America/New_York")
- `TICKET_PREFIX` (e.g., "SUP-")
- `DEFAULT_EMAIL_SIGNATURE` (Markdown or plain text signature appended to agent replies)

### API Hooks (`apps/dashboard/src/hooks/useSettings.ts`)
- **`useSettings` (Query):** Fetches a `Record<string, string>` containing all settings from `GET /api/settings`. Cache key: `['settings']`.
- **`useUpdateSettings` (Mutation):** Submits a `Record<string, string>` (Subset of keys to update) to `PUT /api/settings`. Invalidates `['settings']` on success.

### Frontend Implementation (`apps/dashboard/src/pages/SettingsPage.tsx`)
- Build a `GeneralSettingsForm` component leveraging `react-hook-form`.
- Ensure values like Ticket Prefix and System Timezone are easily editable. The Dashboard uses the `useSettings()` hook to fetch and dynamically display the active `TICKET_PREFIX` (e.g., `TKT-123` instead of `#123`) across the entire UI.
- The Dashboard ensures only Admin users can access and modify these settings.
- Implement Application-Layer Encryption using `APP_MASTER_KEY` for securely storing integration tokens (like Slack API tokens) in the D1 database without redeployments.

## 2. Usage & Costs Tracking
A new feature to visualize the usage of Cloudflare services (Workers, D1, R2, Vectorize, AI) directly in the dashboard.

### Backend Integration
- Implement an API endpoint (e.g., `GET /api/settings/usage`) to fetch analytics data.
- Integrate with Cloudflare's GraphQL Analytics API (`https://api.cloudflare.com/client/v4/graphql`).
- Use `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` environment variables for authentication.
- Construct a GraphQL query to fetch usage metrics across relevant Cloudflare products (Workers Requests, D1 Queries, R2 Operations, AI Invocations, Vectorize Queries) for a specified date range.

### Frontend Implementation
- Create a new "Usage & Costs" tab or dedicated page in the Settings section (`UsagePage.tsx`).
- Develop a `useUsageStats` hook in `useSettings.ts` to fetch data from the new endpoint.
- Display the retrieved metrics using charts or progress bars against estimated free-tier limits or quotas.
- Provide clear breakdowns of requests/operations per service.

## 3. Granular Agent Settings Permissions
A feature to allow administrators to selectively grant or restrict access for agents to various settings modules.

### Backend Integration
- Implement endpoints for fetching and updating agent permissions (e.g., `GET /api/settings/agent-permissions`, `PATCH /api/settings/agent-permissions`).
- Ensure all API endpoints for restricted modules (like `users`, `groups`, `ticket_fields`) check these permissions before allowing an agent to perform operations.
- Store permissions data securely in the D1 database, linked to agent user accounts.

### Frontend Implementation
- Create a new settings page (`AgentPermissionsPage.tsx`) located at `/settings/agent-permissions`.
- Design an interface (such as a matrix of checkboxes or toggle switches) to easily configure which settings modules each agent can access.
- Implement conditional rendering in the `SettingsLayout` to only show navigation links for the modules the current user is authorized to see, decluttering the interface for restricted agents.

## Status: Completed
- [x] Implemented General Settings Form and API hooks.
- [x] Implemented Application-Layer Encryption (`APP_MASTER_KEY`).
- [x] Completed "Usage & Costs" tracking page utilizing the Cloudflare GraphQL Analytics API.
- [x] Implemented Granular Agent Settings Permissions, including `/settings/agent-permissions` page and access control.
