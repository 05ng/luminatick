# Design Document: Customizable Ticket Attributes

## Overview
This document outlines the design for the Customizable Ticket Attributes feature in Luminatick. This feature allows administrators to define custom fields for tickets, providing flexibility to capture business-specific information that falls outside the standard ticket properties (like status, priority, or assignee).

## Schema Design

### 1. `ticket_fields` Table
A new table will be introduced to store the configuration of the custom fields available in the system.

**Columns:**
*   `id` (String/UUID): Primary key.
*   `name` (String): The internal programmatic name/key for the field (e.g., `company_size`). Must be unique and suitable for JSON keys.
*   `label` (String): The human-readable label displayed in the UI (e.g., "Company Size").
*   `field_type` (String): The data type or input control type for the field. Supported types could include `text`, `number`, `dropdown`, `boolean`, `date`.
*   `options` (JSON): A JSON array or object defining selectable options for types like `dropdown`. Nullable/empty for basic input types.
*   `is_active` (Boolean): Flag to indicate if the field is currently active and should be displayed/used. Default is `true`.

### 2. `tickets` Table Modification
To ensure high performance and leverage Cloudflare D1's JSON capabilities, custom field values will be stored directly on the ticket record.

**Modification:**
*   Add a new column `custom_fields` of type `JSON` (or `TEXT` storing JSON string) to the existing `tickets` table.
*   This column will store a key-value mapping where the key matches the `name` from the `ticket_fields` table, and the value is the user-provided data for that ticket.
    *   *Example:* `{"company_size": "Enterprise", "account_id": 12345}`

## UI/UX Integration

### Admin Configuration
Admins will have a new section in the Settings area (e.g., "Ticket Fields") to manage (Create, Read, Update, Disable) these custom attributes.

### Ticket Creation
To keep the ticket creation process simple and streamlined for users (both agents and customers), custom attributes are specifically **omitted** from the Ticket Creation form. They are only accessible once a ticket has been created.

### Ticket Details Page
In the agent portal's Ticket Details view, the Custom Attributes must be displayed in the **right-hand sidebar**, situated immediately **below the standard properties** (Status, Priority, Assignee, etc.).

*   **Placement:** Right-hand sidebar, below standard ticket properties.
*   **Rendering:** The UI will dynamically render inputs based on the `field_type` defined in the `ticket_fields` table.
*   **Interaction:** Custom fields will support viewing and updating, seamlessly integrating with the standard ticket update API flow.
