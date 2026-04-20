# Phase 1.8: Web Widget Plugins Specification

## Overview
Luminatick provides a embeddable web widget that can be integrated into any website. The widget allows users to:
1.  Submit support tickets directly from the host site.
2.  Interact with an AI-powered chat bot (RAG-based) to get instant answers.

## Technical Design

### Shadow DOM Encapsulation
To prevent CSS conflicts with the host website, the widget will be encapsulated using the Shadow DOM.
- The widget will create a shadow root on a host element.
- All styles (including Tailwind CSS) will be injected into the shadow root.
- React will be rendered inside the shadow root.

### Library Mode Build
The widget will be built using Vite's "Library Mode".
- **Input**: `apps/widget/src/main.tsx`
- **Output**: A single JavaScript file `lumina-widget.js` in `apps/widget/dist`.
- **CSS**: Tailwind CSS will be processed and bundled. Since we are using Shadow DOM, we need a way to inject the CSS into the shadow root. We can use a Vite plugin or a custom script to embed the CSS as a string in the JS bundle.

### Widget Configuration
The widget will fetch its configuration from the backend:
- `GET /api/v1/widget/config?key=WIDGET_KEY`
- Config includes:
    - Primary color / Brand colors.
    - Enabled features (Ticket Form, AI Chat).
    - AI Chat welcome message.
    - Positioning (bottom-right, bottom-left).

### Components
1.  **Widget Container**: The main entry point that handles the floating button and the toggleable panel.
2.  **TicketForm.tsx**:
    - Fields: Name, Email, Subject, Message.
    - Integration: `POST /api/v1/tickets` (Automatically creates a "shadow user" for the customer if the email doesn't exist).
3.  **AiChat.tsx**:
    - Real-time chat interface.
    - Integration: `POST /api/v1/widget/chat`.
    - Uses RAG (Vectorize) to provide answers.

### Backend Requirements
- **Endpoint**: `GET /api/v1/widget/config` (Public, but requires a valid widget key or allowed domain).
- **Endpoint**: `POST /api/v1/widget/chat` (Public, rate-limited).
- **CORS**: Must allow requests from authorized domains. The `config` table or a new `widget_settings` table should store allowed domains.

## Implementation Plan

### 1. Project Setup
- Install `tailwindcss`, `autoprefixer`, `postcss`.
- Configure `tailwind.config.js` and `postcss.config.js`.
- Set up `vite.config.ts` for library mode.

### 2. Widget Core
- Implement `ShadowRoot` wrapper.
- Create the floating launcher button.
- Implement state management for the panel (Open/Closed, active tab).

### 3. Features
- Implement `TicketForm`.
- Implement `AiChat` with streaming (or simple POST/GET) response.

### 4. Admin Dashboard Integration
- Add "Widget Settings" page.
- Allow configuring colors, features, and allowed domains.
- Provide a code snippet for embedding.

## Validation & Security

### CORS Policies
The widget endpoints in `/api/v1/widget/*` are protected by a CORS policy.
- **Current Implementation**: Allows all origins for development.
- **Production Recommendation**: The CORS middleware should query the `config` table for a list of `widget.allowed_domains`. Origins not in this list should be rejected with a 403 Forbidden.

### Rate Limiting
To prevent abuse (spam tickets, AI chat exhaustion), rate limiting is applied at the Hono middleware level:
- **Widget Config**: 100 requests per 15 minutes per IP.
- **AI Chat**: 5 requests per 1 minute per IP.
- **Ticket Submission**: 3 tickets per 5 minutes per IP.

### Shadow DOM Security
- **Isolation**: Shadow DOM prevents the host site from accidentally or maliciously styling the widget.
- **Script Injection**: All user-provided content (like AI responses or ticket bodies) must be sanitized. React's default behavior handles most of this, but any raw HTML rendering must be avoided.
- **Data Leakage**: The widget only fetches its own configuration and submits data. It does not have access to the host site's cookies or sensitive data unless explicitly provided.

### Spam Protection
- **X-Lumina-Source Header**: Requests from the widget include a specific header for identification.
- **Turnstile/reCAPTCHA**: Future iterations will integrate Cloudflare Turnstile for silent bot detection on ticket submissions.
