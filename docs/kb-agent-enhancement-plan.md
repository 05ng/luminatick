# Phase 3.3: Enhanced Knowledge Base & AI Agent Architecture Plan

## 1. Executive Summary
This document provides a critical review of the Luminatick MVP Knowledge Base (KB) architecture and outlines a strategic roadmap to evolve it into a robust, "tireless agent" system using the Cloudflare ecosystem.

## 2. Current Architecture & Limitations
The current MVP provides a foundational RAG (Retrieval-Augmented Generation) pipeline using Cloudflare D1, Vectorize, and Workers AI (BGE-large and Llama-3). However, several limitations restrict its effectiveness:

1. **Basic Chunking Strategy:** `KnowledgeService` utilizes a naive regex-based text splitter for paragraphs and sentences. The `overlap` parameter is declared but not implemented. It lacks structural awareness (e.g., Markdown headers, lists) and semantic boundary recognition.
2. **Deficient Retrieval (No Hybrid Search):** Search relies entirely on pure dense vector similarity (`VectorService.search`). It fails on exact keyword matches (e.g., specific error codes or product SKUs) and does not utilize Cloudflare Vectorize's metadata filtering (e.g., filtering by `category_id`).
3. **Single-Turn Context & Basic Prompting:** Both the Agent Dashboard (`getAiSuggestion`) and the Web Widget (`/api/v1/widget/chat`) only send the *single latest message* to the LLM. It completely lacks conversational memory, making multi-step troubleshooting impossible.
4. **Lack of Agentic Tool Calling:** The AI functions strictly as a document summarizer. It cannot execute external functions (e.g., checking a user's ticket status or fetching real-time billing data).
5. **No Feedback Loop:** There is no mechanism for users or support agents to rate AI responses (thumbs up/down) to adjust weights, correct hallucinations, or dynamically update the vector index.

## 3. Enhancement Roadmap

### 3.1 Advanced Chunking & Ingestion
- **Semantic & Structural Chunking:** Upgrade from naive character counts to AST-based parsing for Markdown/HTML. Ensure headers and child content remain coupled. Implement the missing sliding-window overlap logic to preserve context across boundaries.
- **Metadata Enrichment:** Standardize `VectorMetadata` to include `category_id`, `tags`, `author_role`, and `last_updated`. 
- **Asynchronous Document Pipelines:** Use Cloudflare Queues to offload processing of heavy documents (PDFs/DOCX) or OCR tasks, updating D1/Vectorize asynchronously rather than blocking the HTTP request.

### 3.2 Enhanced Retrieval (Free-Tier Optimized)
- **Pure Dense Retrieval:** Rely 100% on Cloudflare Vectorize for retrieval. Cloudflare's free tier for Vectorize is extremely generous (5 million vectors, 30 million queried vectors per month).
- **Why No FTS5?** Implementing SQLite FTS5 (Full-Text Search) requires duplicating text into virtual tables, which triples database write operations (insertion + virtual table synchronization triggers). For a "zero-cost" application aiming to stay under D1's 100k rows written/day limit, FTS5 is too expensive and risky.
- **Metadata Filtering:** Dynamically pass context into Vectorize queries. For example, if a user is browsing the "Billing" category on the widget, inject `{ category_id: "billing-123" }` into the vector search filter to narrow the search space and reduce hallucinations, consuming zero D1 read operations.

### 3.3 Advanced AI Agent (Multi-turn & Tool Use)
- **Multi-turn Memory Management:** Update the `/chat` REST API to accept an array of `messages` rather than a single string. Pass the full context window to Llama-3-8B-instruct using alternating `user` and `assistant` roles.
- **Agentic Tool Calling (Function Calling):** Leverage function calling capabilities (available in advanced Workers AI models or via intelligent prompting). Expose tools like:
  - `query_knowledge_base(query, filters)`
  - `lookup_ticket_status(ticket_id, email)`
  - `escalate_to_human(reason)`
  The AI will determine whether to search the KB, query a DB, or hand off to an agent based on user intent.
- **Confidence Scoring & Auto-Escalation:** Prompt the model to assess its own confidence. If confidence is low or the requested context is absent, gracefully fallback to the `escalate_to_human` tool.

### 3.4 Continuous Feedback Loop
- **Widget & Dashboard Feedback UI:** Implement thumbs up/down buttons on AI chat responses.
- **Feedback Telemetry API:** Create `POST /api/v1/ai/feedback` to log ratings into a new D1 table `ai_interactions`.
- **Auto-Correction Engine:** If an AI answer gets flagged negatively, automatically flag the underlying source chunks for human review in the dashboard. Highly rated Q&A pairs from resolved tickets should be automatically ingested as high-priority vectors.

## 4. Phased Implementation Plan

- **Phase A (Immediate - High ROI):** Fix chunking overlap logic in `KnowledgeService`. Update widget chat and Agent AI suggestions to pass the last 5-10 messages for multi-turn context.
- **Phase B (Mid-term):** Implement robust Vectorize metadata filtering. Expose `category_id` and tags in the retrieval queries to drastically reduce hallucinations without touching D1 read limits.
- **Phase C (Long-term):** Migrate from standard prompt engineering to an Agentic workflow with Tool Calling. Implement the feedback telemetry loop and analytics dashboard.

## 5. Final Zero-Cost Free-Tier Optimized Implementation

The Knowledge Base and AI Agent have been fully upgraded to a "Zero-Cost Free-Tier Optimized" architecture, maximizing the generous limits of Cloudflare's free tiers while avoiding expensive D1 operations.

### Multi-turn Conversational Memory
The Web Widget (`/api/v1/widget/chat`) now supports multi-turn conversational memory. Instead of sending only the single latest message, the widget retains the history of the conversation and passes an array of previous `messages` (context window) to the Llama-3-8B-instruct model. This enables the AI to answer follow-up questions and perform multi-step troubleshooting without requiring backend database storage for chat history, saving entirely on D1 Write operations.

### Vectorize Metadata Filtering for Category Scoping
Retrieval has been optimized by leveraging Cloudflare Vectorize's native metadata filtering. When a user interacts with the widget within a specific context (e.g., browsing a particular category), the frontend passes the `category_id` to the chat API. The backend injects this as a metadata filter (`{ category_id: "..." }`) directly into the Vectorize similarity search.
- **Zero D1 Reads:** This pre-filtering narrows down the relevant vector chunks purely at the Vectorize layer. The system no longer needs to fetch excess chunks from D1 and filter them in memory, saving significant D1 Read operations.
- **Reduced Hallucinations:** By strictly scoping the RAG context to the user's current category, the LLM is less likely to hallucinate or provide answers from unrelated product areas.

### Recent Architectural Refinements & Security Measures

To ensure scalability, security, and correctness in our RAG pipeline, several critical fixes and optimizations were introduced:

1. **Unified Vector Search:** The previous approach of sequentially querying the database for `answer` and `sop` tiers was replaced with a **unified vector search** that queries both tiers simultaneously. 
2. **Threshold & Top-K Adjustments:** To prevent high-scoring, generic Answers from starving out highly specific SOPs, the similarity threshold and the `topK` retrieval limit have been recalibrated and increased, ensuring valid internal procedures always enter the context window for agents.
3. **R2 Body Hydration:** Aligning with the "Option 3" database offloading migration, the AI context retrieval now seamlessly fetches article bodies directly from R2. Vector metadata retrieved from D1 provides the keys, and the system hydrates the context payload by reading the large document bodies from R2, effectively avoiding D1 storage limits.
4. **Security Hardening (Prompt Injection & DoS):** System prompts were heavily reinforced with strict boundary markers to prevent prompt injection from user-submitted text. Additionally, explicit memory and CPU limits were added by capping the maximum concatenated token length, mitigating DoS risks stemming from excessively large context payloads.