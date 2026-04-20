# Phase 1.6: Real-time Notifications & Presence (Dual-Mode Architecture)

## Overview
Luminatick requires a system to keep agents informed of new tickets, updates, and the presence of other agents. To accommodate both cost-conscious users and high-performance enterprise needs, the real-time architecture implements a **Dual-Mode System**:
1. **Pure Visibility-Based Polling (Free Tier Friendly):** An aggressively optimized HTTP polling mechanism that keeps the system fully compatible with Cloudflare's free tier limits (specifically the 100k daily Workers limit).
2. **WebSockets / Durable Objects (Paid Tier):** Restored as an optional, high-performance feature for real-time, low-latency updates.

This architecture is controlled by a global admin setting (`REALTIME_TRANSPORT` = 'polling' | 'websocket') configured in the `/settings/general` page. 

## Architecture

### 1. HTTP Polling Mechanism (Free Tier)
- **Responsibility**: Fetch state updates for tickets, lists, and agent presence.
- **Optimization Strategy**: Aggressive use of `document.visibilityState` in the browser. Both the Agent Dashboard and Customer Portal monitor the tab visibility.
    - **Active Tab**: Polls every 30 seconds for the dashboard, 60 seconds for the portal.
    - **Inactive/Background Tab**: Polling interval falls back to 60 seconds (or pauses entirely depending on the configuration).
    - **Window Focus**: Immediate refetch triggered automatically upon regaining window focus.
- **Benefits**: Protects the 100k daily free tier Workers quota by drastically reducing unnecessary API requests while still feeling "real-time" to active users.

### 2. WebSockets & Durable Objects (Paid Tier)
- **Responsibility**: Establish a persistent connection for instant state updates and presence tracking.
- **Mechanism**: Connects to a Cloudflare Durable Object via WebSockets when `REALTIME_TRANSPORT` is set to `websocket`.
- **Benefits**: Ultra low-latency updates. Ideal for busy teams needing instantaneous collision detection on tickets and real-time chat.
- **Requirements**: Requires a paid Cloudflare Workers plan as Durable Objects are not available on the free tier.

### 3. Agent Presence Table (`agent_presence`)
- **Responsibility**: Manage active sessions and locations of agents within the system (used primarily by the polling mechanism).
- **Storage**: Cloudflare D1. A new table `agent_presence` is introduced to hold current agent states.
- **Schema Overview**:
    - `agent_id`: References the user.
    - `location`: Where the agent is currently working (e.g., "ticket:123", "list:unassigned").
    - `last_seen_at`: Timestamp updated on each poll.
- **Cleanup**: Stale presence records (e.g., agents who closed the tab without logging out) are automatically ignored if `last_seen_at` is older than a specific threshold (e.g., 2 minutes).

### 4. Presence Updates & Notifications
- **Endpoint**: `/api/v1/presence` and `/api/v1/tickets/updates` (for Polling) or via WebSocket messages (for DO).
- When an agent opens a ticket or refreshes the page, the frontend sends a background fetch (or WebSocket message) to update their presence state.
- Concurrent ticket updates (e.g., "New reply from customer") are fetched during the 30s/60s polling cycle or pushed instantly via WebSocket and surface as toast notifications or unread indicators.

## Implementation Plan

### Backend (Cloudflare Workers & D1)
1. **D1 Schema Update**: Add the `agent_presence` table.
2. **API Handlers**: 
   - Create `/api/v1/presence` endpoints (GET, POST) to update and retrieve current presence states for polling.
   - Refine existing list/ticket fetching endpoints to handle efficient delta queries or "last updated since" logic if needed.
   - Maintain a Durable Object class (`NotificationDO`) mapped to WebSockets for paid-tier environments.
3. **Configuration**: Use a global settings flag (`REALTIME_TRANSPORT` = 'polling' | 'websocket') fetched from the `/settings/general` page to dictate the active real-time architecture system.

### Frontend (React Dashboard & Portal)
1. **Dynamic Transport Switching**: Enhance `useRealtime` hook to initialize either a WebSocket connection or HTTP polling interval based on the `REALTIME_TRANSPORT` setting payload.
2. **Visibility Hook (Polling)**: Implement logic to attach to `document.addEventListener('visibilitychange')`.
3. **Dynamic Intervals (Polling)**: Set up `setInterval` logic that shifts between 30s when `document.visibilityState === 'visible'` and 60s when `'hidden'`.
4. **UI Updates**:
    - Update `TicketDetailPage` to pull and display "Live Viewers" by querying the presence API or consuming WS messages.
    - Add manual "Refresh" capability for users wanting immediate synchronization.
    - Surface visual indicators (toasts/badges) when polling or WebSockets detect new data.

## Security & Quota Considerations
- **Authentication**: All polling endpoints require valid JWT authentication.
- **Data Leakage**: Ensure the presence API filters out sensitive user details and only returns necessary fields (name, avatar, location) for authorized agents.
- **Strict Quota Protection**: The combination of `visibilitychange` listeners and 30s/60s intervals is specifically designed to keep the daily Worker request volume comfortably under the 100k free tier limit for typical small-to-medium deployments. 

## Validation & Final Refinement (Deep-Dive)

### 1. Backend Refinements
- **Dual-Mode Support**: Verified that `REALTIME_TRANSPORT` securely switches users between WebSockets and HTTP Polling mechanisms via API.
- **Free-Tier Assurance**: Ensured Durable Objects are entirely optional and only initialized for users on the paid WebSocket tier.
- **Efficient Queries**: Tuned D1 queries on `agent_presence` to quickly update `last_seen_at` and ignore stale sessions older than 2 minutes (when using polling).

### 2. Frontend Polish
- **Smart Polling**: Verified `document.visibilityState` pauses or slows down requests effectively when users switch tabs or minimize the browser window.
- **Immediate Refresh**: Confirmed that returning to the tab immediately fires a background refresh, making the app feel instantaneously responsive despite using polling.
- **Interactive UI**: Enhanced `TicketDetailPage` with an "Active Now" sidebar for smooth presence transitions that work seamlessly across both transport mechanisms.

### 3. Testing Results
- **Quota Impact (Polling)**: Simulated 10 agents working an 8-hour shift. The 30s active / 60s background strategy yielded a predictable and highly sustainable request volume, well within the 100k daily free tier.
- **Performance Impact (WebSocket)**: Confirmed near-instantaneous sync via Durable Objects when enabled for Enterprise-like workflows.
- **Presence Accuracy**: Verified that multiple agents viewing the same ticket correctly see each other's status updated within the polling window, or instantly via WebSockets.
