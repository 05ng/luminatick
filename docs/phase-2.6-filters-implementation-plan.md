# Filters Feature - Design & Implementation Plan

## Overview
This document outlines the design and implementation plan for adding a "Filters" feature to Luminatick. This feature allows administrators to define custom ticket views (filters) based on specific criteria, replaces the standard "Tickets" view with a dedicated "Filters" workspace, and introduces pagination for ticket lists.

## 1. Database Schema
We will create a new table `ticket_filters` in the Cloudflare D1 database.

### Table: `ticket_filters`
```sql
CREATE TABLE ticket_filters (
    id TEXT PRIMARY KEY, -- e.g., 'filter_...' (ksuid)
    name TEXT NOT NULL, -- e.g., 'My Open Tickets', 'High Priority'
    conditions TEXT NOT NULL, -- JSON string defining the filter criteria (e.g., {"status": "open", "assignee_id": "user_1"})
    is_system BOOLEAN DEFAULT 0, -- 1 for built-in filters (cannot be deleted)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Default Filters (Seed Data)
The system will be seeded with two default `is_system=1` filters:
1. **Open Tickets**: `{"status": ["open", "pending"]}` (or similar, depending on existing statuses)
2. **All Tickets**: `{}` (Empty conditions)

## 2. Backend API Updates

### 2.1 Filters CRUD API
Create new endpoints in `apps/server/src/handlers/settings.handler.ts` (or a dedicated `filters.handler.ts`):
- `GET /api/settings/filters` - List all filters.
- `POST /api/settings/filters` - Create a new filter (admins only).
- `GET /api/settings/filters/:id` - Get a specific filter.
- `PUT /api/settings/filters/:id` - Update a filter (admins only, restrict updating system filters).
- `DELETE /api/settings/filters/:id` - Delete a filter (admins only, restrict deleting system filters).

### 2.2 Tickets API Updates (`GET /api/tickets`)
Update `apps/server/src/handlers/dashboard.handler.ts` (or relevant ticket handler) to support dynamic filters and pagination.

**Query Parameters:**
- `filter_id` (string): ID of the filter to apply (optional, but typically provided).
- `page` (number): Current page number (default: 1).
- `limit` (number): Items per page (fixed at 50, or default to 50).

**Implementation Details:**
- If `filter_id` is provided, fetch the `conditions` JSON from `ticket_filters`.
- Parse the JSON and dynamically build the D1 SQL query `WHERE` clauses.
- Implement `LIMIT 50` and `OFFSET ((page - 1) * 50)` based on the `page` parameter.
- Return a paginated response:
  ```json
  {
    "data": [ /* tickets array */ ],
    "meta": {
      "total": 150,
      "page": 1,
      "limit": 50,
      "total_pages": 3
    }
  }
  ```

## 3. Frontend UI Redesign

### 3.1 Main Navigation Update
In `apps/dashboard/src/components/layout/Layout.tsx`, change the main left sidebar navigation item:
- **Change:** "Tickets" label to "Filters".
- **Route:** Update the link to point to the new filters workspace route (e.g., `/filters` or repurposed `/tickets`).

### 3.2 Main Workspace Layout (Ticket List Page)
Redesign the main area when clicking "Filters". It will be a split layout:
- **Left Sub-Sidebar (Filters List):**
  - Fetches and displays all available filters from `GET /api/settings/filters`.
  - Highlights the currently active filter.
  - Clicking a filter updates the right pane and resets pagination to page 1.
- **Right Main Area (Ticket List):**
  - Displays the tickets matching the selected filter.
  - Implements a pagination control at the bottom (Next/Previous, Page Numbers) supporting 50 items per page.
  - Fetches data using the updated `GET /api/tickets?filter_id=<id>&page=<n>&limit=50`.

### 3.3 Settings - Filters Page (`FiltersSettingsPage.tsx`)
Create a new settings page for administrators under `apps/dashboard/src/components/layout/SettingsLayout.tsx`.
- **Route:** `/settings/filters`
- **UI:** 
  - A list/table of all custom and system filters.
  - "Create Filter" button opening a modal/form.
  - Form fields: Name, Conditions Builder (UI to add/remove conditions based on ticket properties like Status, Priority, etc.).
  - Edit/Delete actions (disabled/hidden for system filters where `is_system=true`).

## 4. Execution Steps
1. **DB Migration:** Create `0005_ticket_filters.sql` migration file. Add seed data logic for "Open Tickets" and "All Tickets" to `apps/server/src/scripts/seed.ts` (or equivalent).
2. **Backend - Types:** Define `TicketFilter` and `PaginatedResponse` interfaces in `packages/shared/index.ts`.
3. **Backend - API:** Implement the Filters CRUD endpoints and update the Tickets `GET` endpoint for dynamic querying and pagination logic.
4. **Frontend - Hooks:** Create a `useFilters.ts` hook. Update the existing `useTickets.ts` hook to handle pagination and the `filter_id` parameter.
5. **Frontend - Settings UI:** Build the `FiltersSettingsPage.tsx` and integrate it into the Settings layout.
6. **Frontend - Main UI:** Refactor the main sidebar link and implement the split-view layout for the ticket list with pagination controls.
