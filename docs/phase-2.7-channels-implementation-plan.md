# Channels Implementation Plan

## Overview
This document outlines the technical plan to implement a new "Channels" hub within the Settings layout of Luminatick. The Channels section will centralize the management of all incoming ticket sources, specifically: Email, Chat, and Web Form.

## 1. Database Schema Updates
We need to introduce two new tables in our Cloudflare D1 (SQLite) database to support multiple emails and global system settings.

### `support_emails` Table
Stores all authorized inbound support email addresses.
```sql
CREATE TABLE support_emails (
    id TEXT PRIMARY KEY,
    email_address TEXT UNIQUE NOT NULL,
    name TEXT, -- e.g., "General Support", "Billing"
    group_id TEXT, -- Foreign key to groups.id. Ties this outbound email to a specific group.
    is_default INTEGER DEFAULT 0, -- Boolean: 1 if default global fallback, 0 otherwise
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `settings` Table
A key-value store for global system settings, including the toggles for the Chat and Web Form channels. Sensitive integration tokens (e.g., external API keys for channels) can be stored here using Application-Layer Encryption.
```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL, -- Stored as JSON string to support various types (or encrypted text)
    description TEXT,
    is_encrypted INTEGER DEFAULT 0, -- Boolean: 1 if value is encrypted via APP_MASTER_KEY, 0 otherwise
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Initial seeded values
INSERT INTO settings (key, value, description, is_encrypted) VALUES 
('channel_chat_enabled', 'true', 'Enable the live chat widget channel', 0),
('channel_web_form_enabled', 'true', 'Enable the web form widget channel', 0);
```

### Security: Application-Layer Encryption
To support adding new external channels (e.g., Slack, custom API integrations) without modifying Cloudflare Worker environment secrets and requiring a full redeployment, Luminatick relies on an Application-Layer Encryption design powered by a global `APP_MASTER_KEY`.
- The `APP_MASTER_KEY` is a single secret configured during initial deployment.
- Whenever an Admin enters a third-party API token or webhook secret in the Channels settings UI, the server encrypts the value using `APP_MASTER_KEY` before writing it to the `settings` table.
- When the backend needs to authenticate with the third-party service, it decrypts the token at runtime.
- **Benefit:** Dynamic configuration of integration tokens securely stored in D1.

### Outbound Email Routing (Logic Update)
Outbound emails are NOT tied to the ticket's original `source_email`. Instead, they are tied to the ticket's **Group**. 
- The `outbound.service.ts` must look up the ticket's `group_id` to determine the correct "From" address for replies.
- It queries the `support_emails` table for an email bound to that `group_id`.
- If no group is assigned to the ticket, or the assigned group has no specific email bound to it, it should fall back to the global default email (`is_default = 1` in `support_emails`).

## 2. Backend API
We need to add administration endpoints to manage emails and settings, as well as update the public widget configuration endpoint to respect the new toggles.

### Internal API (Requires Admin/Agent Auth)
- **`GET /api/channels/emails`**: Retrieve a list of all configured support emails.
- **`POST /api/channels/emails`**: Add a new support email address.
- **`DELETE /api/channels/emails/:id`**: Remove a support email.
- **`PUT /api/channels/emails/:id/default`**: Set a specific email as the default outbound/inbound primary address.
- **`GET /api/settings`**: Retrieve all global settings.
- **`PUT /api/settings`**: Update one or more global settings (e.g., toggling `channel_chat_enabled` or `channel_web_form_enabled`).

### Public API (No Auth / CORS enabled)
- **`GET /api/widget/config`**: Updated to query the `settings` table and return the active channels to the client-side script.
  *Response format:*
  ```json
  {
    "chatEnabled": true,
    "formEnabled": false,
    "theme": "light"
  }
  ```

## 3. Frontend UI

### `SettingsLayout.tsx` Modification
The existing "Widget" link in the settings sidebar will be repurposed and expanded into a "Channels" group:
```tsx
// Example Sidebar Structure
- Settings
  - General
  - Channels (New Section Header)
    - Overview 
    - Email
    - Web Widget (Chat & Form)
```

### New Pages
1. **`ChannelsHubPage.tsx`**: A high-level overview page listing "Email", "Chat", and "Web Form" with their current status (Active/Inactive) and quick links to configure them.
2. **`EmailChannelPage.tsx`**: A data table displaying all entries from the `support_emails` table. Includes an "Add Email" modal and actions to set the default email or delete secondary ones.
3. **`WidgetChannelPage.tsx`**: Replaces the old Widget page. Contains:
   - Two distinct toggle switches: "Enable Chat Widget" and "Enable Web Form".
   - An "Installation" section displaying the Embed Script code blocks.

## 4. Widget Integration
The web widget (`lumina-widget.js`) will be injected into 3rd party host sites using a single `<script>` tag.

### Embed Script Code Snippet
```html
<!-- Luminatick Support Widget -->
<script 
  src="https://api.your-luminatick-domain.com/widget/lumina-widget.js" 
  data-tenant="your-tenant-id" 
  defer>
</script>
```

### Widget Runtime Logic
1. Upon loading, `lumina-widget.js` reads the script's `data-tenant` (if applicable for multi-tenant in the future, otherwise just hits the API) and calls `GET /api/widget/config`.
2. Based on the response:
   - If `chatEnabled` is `true`, it mounts the floating Action Button (FAB) for the real-time Chat interface.
   - If `formEnabled` is `true`, it exposes the `<lumina-ticket-form></lumina-ticket-form>` custom element for inline embedding or adds a "Submit Ticket" fallback inside the chat UI.
   - If both are `false`, the script silently exits without modifying the host DOM.