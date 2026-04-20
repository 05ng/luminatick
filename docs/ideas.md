The system uses a decentralized edge architecture. Every request—whether an email, a web dashboard hit, or an AI inference—is handled at the data center closest to the user.

Email Entry: Cloudflare Email Routing ➔ Workers.

Database: Cloudflare D1 (SQL) for ticket metadata and user accounts.

Intelligence: Workers AI for embeddings (Search) and DeepSeek/Llama (Generation).

Memory: Vectorize for long-term semantic search of past solutions.

Storage: R2 for email attachments (screenshots, logs).

2. The Project Structure
This structure is optimized for Antigravity (and other agent-based IDEs) to understand the relationships between the frontend, backend, and database schemas.

/luminatick
├── /apps
│   ├── /dashboard           # React + Vite (Internal Admin Portal)
│   │   └── src/             # Ticket management, AI config, Analytics
│   ├── /widget              # React + Vite + Shadow DOM (The "Plugin")
│   │   ├── src/             
│   │   │   ├── main.tsx     # Logic to inject widget into host sites
│   │   │   ├── Chat.tsx     # AI-powered chat interface
│   │   │   └── Form.tsx     # Ticket submission form
│   │   └── vite.config.ts   # Configured for "Library Mode" (single .js file)
│   └── /server              # Cloudflare Worker (The Unified Backend)
│       ├── src/
│       │   ├── handlers/    # Auth, Ticket CRUD, AI/Vectorize Logic
│       │   └── schema.ts    # D1 Database Schema (Drizzle or Raw SQL)
├── /packages
│   ├── /database            # D1 Migrations
│   └── /shared-types        # Shared TypeScript Interfaces (Ticket, User, etc.)
├── wrangler.json            # Bindings for D1, Vectorize, R2, and AI
└── README.md

1. The Plugin Architecture (The "Widget")
To ensure the widget doesn't break the styling of the website it's installed on, it must use the Shadow DOM.

Delivery: The /widget app is built into a single lumina-widget.js file hosted on Cloudflare R2 or Pages.

Authentication: Users login via Magic Links or Cloudflare Access (Turnstile) to keep it lightweight. No complex password management for the end-user.

Integration: A user simply adds:
<script src="https://your-domain.com/lumina-widget.js" data-app-id="YOUR_ID"></script>

2. The Multi-Entry Backend (Worker)
Your Cloudflare Worker now handles three distinct traffic types:

Dashboard API: High-privilege requests for your IT team.

Widget API: Public-facing requests (rate-limited) for ticket creation and chat.

Email Trigger: Background processing for incoming support emails.

3. The "Hybrid Chat" Workflow
Since you want a chat widget, the flow changes to Real-time RAG:

User Types: "How do I reset my VPN?"

Widget Sends to Worker: The Worker immediately embeds the question.

Search: It checks Vectorize for an instant answer.

AI Response: * If Found: DeepSeek drafts an instant reply in the chat: "I found this fix... did it work?"

If Not Found: The widget automatically flips to Form Mode: "I couldn't find an instant fix. Would you like to open a ticket for our engineers?"

Strategic Design Decisions
Why React for the Widget?
By using React with a Shadow DOM wrapper, your AI agent (Antigravity) can use standard UI libraries like shadcn/ui to build a beautiful chat interface, but the build process will "encapsulate" it so it doesn't conflict with the host website's CSS.

Database (D1) Update
You will need a new table for Apps/Tenants. This allows your open-source users to support multiple departments or even different companies from one installation.


3. Detailed Component Design
A. Database Schema (D1 - SQLite)
Focus on a "Lean Schema" to keep within the 10ms CPU limit.

tickets: ID, Subject, Status, Priority, CustomerID, Category.

messages: ID, TicketID, Sender, Body (Plain text), Timestamp.

knowledge_index: ID, SourceType (Ticket/Doc), ContentSnippet, VectorID.

tenants: ID, Domain, ThemeColor, AI_Prompt_Override.


B. The RAG Workflow (The "Correct" Workflow)
To minimize costs, the system performs a "Two-Pass" check:

Semantic Search: When an email arrives, call @cf/baai/bge-large-en-v1.5 to turn the problem into a vector. Query Vectorize for the top 3 similar past fixes.

Inference: Bundle the 3 fixes with the email. Send to DeepSeek (via API) or @cf/meta/llama-3.1-8b-instruct (via Workers AI) to draft the reply.

C. Handling Attachments (R2)
Don't store images in the database. Use Cloudflare R2 (S3-compatible).

Generate a "Presigned URL" so the user can download the attachment directly from the edge, bypassing the Worker's memory limits.