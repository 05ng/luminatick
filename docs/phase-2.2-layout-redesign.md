# Dashboard Layout Redesign Plan

## 1. Overview
The goal of this redesign is to streamline the main navigation sidebar by moving administrative and configuration pages into a centralized Settings hub. This will free up space in the primary layout, ensuring focus remains on core workflows (Dashboard, Tickets, Knowledge Base). The middle and right-side content areas (such as ticket conversations and the right-hand ticket details sidebar) will remain unchanged.

## 2. Main Sidebar Updates (`Layout.tsx`)
**File:** `apps/dashboard/src/components/layout/Layout.tsx`

*   **Navigation Links:** Reduce the `navigation` array to include only the primary tools:
    *   Dashboard (`/`)
    *   Tickets (`/tickets`)
    *   Knowledge Base (`/knowledge`)
*   **Bottom Section (Profile & Settings):**
    *   **Space Optimization:** Remove the text displaying the username (`user.full_name`) and email (`user.email`) to save space.
    *   **User Avatar:** Keep the user avatar (`{user?.full_name?.[0] || 'A'}`). Convert this into a trigger for a Popover/Dropdown menu that contains the "Logout" (and optionally "MFA") actions.
    *   **Settings Shortcut:** Add a Settings icon (`<Settings />`) next to the avatar (or below it) that links directly to `/settings`.
    *   **Cleanup:** Remove the existing explicit "Logout" button from the main sidebar.

## 3. Routing Updates (`App.tsx`)
**File:** `apps/dashboard/src/App.tsx`

*   Convert the `/settings` route into a layout route that wraps all the administrative pages.
*   Move the existing administrative top-level routes to be children of `/settings`.
*   **Proposed Routing Structure:**
    ```jsx
    <Route path="settings" element={<SettingsLayout />}>
      {/* Redirect root /settings to the first sub-page */}
      <Route index element={<Navigate to="general" replace />} />
      <Route path="general" element={<SettingsPage />} />
      <Route path="users" element={<UsersPage />} />
      <Route path="groups" element={<GroupsPage />} />
      <Route path="automations" element={<AutomationPage />} />
      <Route path="ticket-fields" element={<TicketFieldsPage />} />
      <Route path="api-keys" element={<ApiKeyPage />} />
      <Route path="widget" element={<WidgetPage />} />
    </Route>
    ```

## 4. New Settings Hub Structure
**New File:** `apps/dashboard/src/components/layout/SettingsLayout.tsx`

*   **Secondary Navigation:** Create a `SettingsLayout` component that acts as a hub. It should implement a secondary navigation menu (sub-sidebar or horizontal tabs) listing all settings categories: 
    *   General Settings
    *   Users
    *   Groups
    *   Automations
    *   Ticket Fields
    *   API Keys
    *   Widget Configuration
*   **Content Area:** The right side of the `SettingsLayout` will contain an `<Outlet />` to render the selected administrative page.
*   **Page Adjustments:** The existing pages (`UsersPage.tsx`, `GroupsPage.tsx`, etc.) will render inside this new layout. Minor styling tweaks may be needed to ensure their headers align nicely within the new nested structure.

## 5. Middle/Right Content Areas
*   No structural changes are needed for the ticket list, ticket detail views, or the right-hand sidebars (custom attributes, statuses, etc.). The existing `flex-1` structure in the main `Layout.tsx` will continue to house these components perfectly, alongside the new `SettingsLayout`.