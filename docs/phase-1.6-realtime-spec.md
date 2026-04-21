# Phase 1.6: Real-time Notifications & Presence (WebSocket Architecture)

## Overview
Luminatick requires a robust system to keep agents informed of new tickets, updates, and the presence of other agents. The real-time architecture implements a **Unified WebSocket System** backed by **Cloudflare Durable Objects with Hibernatable WebSocket Attachments**.

This architecture provides an instant, bidirectional communication channel between the client and server, ensuring ultra-low latency updates and efficient presence tracking, while maximizing free-tier optimizations.

## Architecture

### 1. WebSockets & Durable Objects
- **Responsibility**: Establish a persistent connection for instant state updates and presence tracking.
- **Mechanism**: Clients connect to a Cloudflare Durable Object (`NotificationDO`) via WebSockets through the `/api/realtime` endpoint.
- **Benefits**: Ultra low-latency updates. Ideal for busy teams needing instantaneous collision detection on tickets and real-time chat.
- **Storage Strategy**: Rather than using SQLite or KV, the Durable Object utilizes **WebSocket Attachments** (`ws.serializeAttachment()`). This allows in-memory session state to be tied directly to the WebSocket connection, surviving DO hibernation and resulting in **zero DB reads/writes** for presence state.

### 2. Agent Presence Tracking (WebSocket Attachments)
- **Responsibility**: Manage active sessions and locations of agents within the system without incurring storage costs.
- **Storage**: Hibernatable WebSocket attachments (in-memory state tied to the socket).
- **Attachment Schema Overview**:
    - `userId`: References the authenticated user.
    - `name`: Display name of the agent.
    - `location`: Where the agent is currently working (e.g., "ticket:123", "list:unassigned"). Truncated to prevent memory bloat.
- **Cleanup**: Stale presence records are automatically removed when a WebSocket connection is closed (`webSocketClose`). There is no need for active ping/pong timeouts since Cloudflare manages the TCP connection lifecycle and wakes the DO only on events.

### 3. Presence Updates & Notifications
- **Endpoint**: `/api/realtime` handles the initial WebSocket upgrade.
- **Authentication**: JWT tokens are verified securely *before* the request is forwarded to the Durable Object. The verified User ID and Name are injected securely into the request headers (`X-User-ID`, `X-User-Name`) to prevent spoofing.
- When an agent opens a ticket or navigates the dashboard, the frontend sends a `presence.update` message via the WebSocket.
- The Durable Object immediately deserializes the attachment, updates the `location`, reserializes it, and broadcasts the updated presence state to all other connected clients via a `presence.update` payload.
- Server-side events (e.g., "New reply from customer") are sent to the Durable Object's `/broadcast` endpoint, which then relays the payload to all connected WebSocket clients.

## Implementation Details

### Backend (Cloudflare Workers & DO)
1. **Durable Object (`NotificationDO`)**: 
   - Uses `ws.serializeAttachment()` and `ws.deserializeAttachment()` to manage session state.
   - Handles WebSocket lifecycle via the Hibernation API: `webSocketMessage` for presence updates, `webSocketClose` for automatic offline broadcasting and cleanup.
   - Free-Tier Optimized: Because it leverages hibernation and attachments, it eliminates expensive DB operations and constant DO wake-ups from pings.
2. **Security**: 
   - The `/api/realtime` route uses the `AuthService` to verify JWTs. If verification fails, the connection is rejected.
   - Trusted headers (`X-User-ID`, `X-User-Name`) are constructed on the server after verification to prevent client-side spoofing.
   - Input limits are enforced on `location` strings to prevent malicious memory bloat attacks.

### Frontend (React Dashboard)
1. **WebSocket Transport**: The `useRealtime` hook manages the WebSocket connection lifecycle.
2. **Ping/Pong**: Deprecated. The architecture relies on Cloudflare's inherent WebSocket lifecycle management, eliminating the need for application-level keep-alive intervals.
3. **UI Updates**:
    - `TicketDetailPage` displays "Live Viewers" by consuming real-time `presence.sync` and `presence.update` messages.
    - Real-time toast notifications alert agents of new messages or system events without requiring manual refreshes.
    - Reconnection logic automatically handles intermittent network drops with exponential backoff.

## Note on Previous Architecture
*Luminatick previously supported a dual-mode architecture with HTTP polling, and later a SQLite-backed Durable Object. Both have been superseded. The unified Durable Object WebSocket Attachment architecture is now the sole transport mechanism, offering superior performance, zero-storage presence tracking, and a simplified codebase.*
