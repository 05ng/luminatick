# Luminatick: Open-Source AI-First Ticketing System

[![CI](https://github.com/05ng/luminatick/actions/workflows/ci.yml/badge.svg)](https://github.com/05ng/luminatick/actions/workflows/ci.yml) [![CodeQL](https://github.com/05ng/luminatick/actions/workflows/codeql.yml/badge.svg)](https://github.com/05ng/luminatick/actions/workflows/codeql.yml)

Luminatick is a decentralized, single-tenant ticketing system built specifically for the Cloudflare ecosystem. It leverages modern edge computing and AI to provide an efficient support experience via email, web forms, and interactive chat.

## Inspiration
Luminatick is deeply inspired by Zammad and Cloudflare's serverless ecosystem. After many years of using Zammad to support customers, this project was created to bring those proven helpdesk workflows to a modern, lightning-fast edge infrastructure.

## Design Philosophy
Luminatick was architected with four core principles in mind:

1. **Zero-Cost Out of the Box:** The system is purposefully designed to run comfortably within the **Cloudflare Free Tier**. By leveraging efficient data storage patterns (like hybrid R2 offloading) and efficient API design, individuals and small teams can operate a fully-featured AI ticketing system without incurring monthly infrastructure costs.
2. **High-Performance Real-time Presence:** Uses Cloudflare Durable Objects backed by SQLite to provide seamless, low-latency WebSocket communication for agent presence and ticket updates.
3. **Frictionless Deployment:** The barrier to entry is kept to a minimum. Luminatick provides a streamlined deployment process requiring only a Cloudflare account. With built-in Wrangler commands, you can provision the entire infrastructure—database, object storage, vector search, AI models, and edge compute—in just a few minutes.
4. **Privacy First:** Built with user privacy in mind from day one. The system requests minimal personal information from customers and features built-in GDPR-compliant automation, including scheduled tasks to automatically delete inactive users and purge old ticket data.

## Core Technologies
- **Backend:** Cloudflare Workers (API), Real-time Presence (WebSockets via SQLite Durable Objects), Cloudflare Email Workers (Inbound).
- **Frontend:** React + Vite + Tailwind CSS (Admin Dashboard, Customer Portal), Shadow DOM encapsulated React (Widget).
- **Database/Storage:** Cloudflare D1 (SQLite for metadata), Cloudflare R2 (Hybrid Offloading for ticket payloads and attachments), Cloudflare Vectorize (RAG).
- **AI:** Cloudflare Workers AI (Llama 3 / DeepSeek, BGE-large embeddings).
- **Email Outbound:** Resend API / Custom SMTP.

## Architecture
The project is structured as a monorepo:
- `/apps/server`: The unified backend handling Dashboard, Widget, and Public REST APIs.
- `/apps/dashboard`: Internal portal for agents and admins to manage tickets and configuration.
- `/apps/portal`: Dedicated self-service Customer Portal with Passwordless Magic Link & OTP auth.
- `/apps/widget`: A single-file JS plugin (`lumina-widget.js`) for host site integration.
- `/packages/shared`: Shared TypeScript types and utilities.

## Key Features & Workflows
- **Omnichannel:** Support via email, web widget, and API.
- **Unified Attachments:** Agents can now upload and send attachments directly from the Admin Dashboard, achieving full feature parity with the Customer Portal's secure R2 presigned URL upload flow.
- **AI-Powered RAG:** Automatically vectorizes Knowledge Base articles and Agent-marked Q&A pairs from resolved tickets for instant chat resolution and auto-drafting.
- **Scalable Architecture (Hybrid Offloading):** Stores heavy text payloads (e.g., ticket replies) in R2 and only metadata in D1, completely circumventing D1's 10GB limit.
- **Application-Layer Encryption:** Uses `APP_MASTER_KEY` to securely encrypt and store third-party integration tokens (e.g., Resend API Key, external APIs) directly in the D1 database, avoiding redeployments for new secrets.
- **Cloudflare Usage & Costs Tracking:** Integrates with the Cloudflare GraphQL Analytics API to provide a comprehensive dashboard for tracking metrics across Workers, D1, R2, Vectorize, and AI services.
- **Presence System:** Dual-mode architecture controlled via settings (`REALTIME_TRANSPORT`): Free-Tier HTTP polling with `document.visibilityState` optimization, or Paid-Tier WebSockets via Cloudflare Durable Objects for ultra low-latency updates.
- **Security & Granular Permissions:** All agent/admin access requires MFA (TOTP). Admins can restrict agent access to specific settings modules via the Agent Permissions page. Public API access requires API Keys.
- **Automation & GDPR Compliance:** Event-based webhooks and automated scheduled retention policies for deleting old tickets, attachments, and inactive users.
- **Email Integration:** Flexible inbound options using Cloudflare Email Routing or a Forwarding/Redirection model from Shared Mailboxes (Office 365/Gmail), and outbound via third-party providers (Resend, SMTP). See [docs/email-setup.md](docs/email-setup.md) for detailed scenarios.

## Building and Running

### Local Development

1. **Environment:** 
   - Copy `apps/server/.dev.vars.example` to `apps/server/.dev.vars` and fill in the required keys, ensuring you generate an `APP_MASTER_KEY` (e.g., 32-byte hex string) for Application-Layer Encryption.
   - (Optional) Copy `.env.example` to `.env` in the root for shared environment variables.

2. **Infrastructure (Local):**
   ```bash
   # Apply migrations to your local SQLite database (managed by Wrangler)
   npm run db:migrate:local
   ```

3. **Database Seeding (Local):**
   ```bash
   # Initialize local tables and create initial Admin user
   npm run db:seed:local
   ```

4. **Start Backend:**
   ```bash
   npm run dev:server
   ```
   *Launches the Cloudflare Worker locally (Default: http://localhost:8787).*

5. **Start Dashboard:**
   ```bash
   npm run dev:dashboard
   ```
   *Launches the React admin portal (Default: http://localhost:5173). Log in using the Admin credentials from Step 3.*

6. **Build Widget (Optional):**
   ```bash
   npm run build:widget
   ```
   *Generates the `lumina-widget.js` bundle for customer-facing integration.*

### Testing

To run the automated tests locally:

```bash
# Run tests across all workspace applications
npm run test

# Run backend tests
npm run test --workspace=apps/server

# Run frontend tests
npm run test --workspace=apps/dashboard
```

### Continuous Integration (CI)

This repository uses GitHub Actions to maintain code quality and security for open-source contributors. On every push and pull request to the `main` branch, the CI pipeline automatically performs:
- **Automated Testing & Type Checking:** Validates unit tests and TypeScript types across the monorepo.
- **Build Verification:** Ensures all applications and packages build successfully.
- **Security Scanning:** GitHub CodeQL automatically analyzes the codebase to detect potential security vulnerabilities and leaked secrets.

### Production Deployment

For a detailed guide, see [docs/deployment.md](docs/deployment.md).

1. **Provision Infrastructure:**
   ```bash
   npm run setup:prod
   ```

2. **Configure Secrets:**
   ```bash
   npm run secrets:prod
   ```

3. **Deploy Applications:**
   ```bash
   npm run deploy
   ```
   *(Note: Mid-deployment, you will be prompted to enter your newly deployed backend URL so the frontends can be configured correctly.)*

4. **Seed Production Database:**
   ```bash
   npm run seed:prod
   ```

5. **Post-Deployment Configuration:**
   - Log into your newly deployed Admin Dashboard using the credentials generated in Step 4.
   - Navigate to **Settings -> Channels -> Email** (or General Settings) and configure your **Outbound Email provider** (e.g., Resend API key).
   - *Important:* The **Customer Portal** relies on Passwordless Magic Link & OTP authentication. Users will not be able to log in until outbound email is configured to send the OTPs.

> **Critical Security Note:** It is highly recommended to configure **Cloudflare Turnstile** to protect the customer portal and other public-facing forms from bots and spam tickets. This is a critical security recommendation for public-facing forms.

## Documentation
- [Architecture Overview](docs/design-and-implementation-plan.md)
- [Deployment Guide](docs/deployment.md)
- [Email Setup Guide](docs/email-setup.md)
- [API Specification](docs/phase-1.4-api-spec.md)

## Development Conventions
- **Monorepo:** Use `npm` workspaces to manage dependencies across apps and packages.
- **Type Safety:** Shared types in `/packages/shared` should be used by both frontend and backend.
- **Widget Integrity:** Use Shadow DOM in the widget to prevent CSS conflicts with host websites.

## Support
For any inquiries or assistance, please reach out to us at [help@luminatick.org](mailto:help@luminatick.org).

## License
MIT
