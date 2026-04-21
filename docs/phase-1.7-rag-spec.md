# Phase 1.7: Knowledge Base (RAG) & Ticket Q&A Vectorization

## 1. Objective
Implement a Retrieval-Augmented Generation (RAG) system to assist agents by providing AI-generated suggestions based on existing knowledge base documents and past ticket Q&A pairs.

## 2. Architecture

### 2.1. Components
- **Cloudflare Vectorize**: Stores and searches vector embeddings.
- **Cloudflare Workers AI**: 
    - Text Embeddings: `@cf/baai/bge-large-en-v1.5`
    - Text Generation: `@cf/meta/llama-3-8b-instruct`
- **Cloudflare R2**: Stores raw knowledge base documents (.pdf, .md, .docx).
- **Cloudflare D1**: Stores metadata for knowledge documents and ticket articles.

### 2.2. Data Flow (Asynchronous Vectorization)
To guarantee zero-latency responses in the UI when creating articles or marking Q&A pairs, heavy vectorization tasks are offloaded to Cloudflare Workflows.

1. **Ingestion (Knowledge Base)**:
    - Admin creates/updates an article via the Dashboard editor.
    - Article metadata is instantly saved to D1 and full markdown body to R2.
    - A `VectorizeJob` is dispatched to the background `VectorizeWorkflow` (`action: 'create' | 'update'`).
    - The Workflow steps execute asynchronously: fetches content, deletes old vectors if updating, chunks text, generates embeddings via Workers AI, inserts into Vectorize, and finally updates the D1 status to `active`.
2. **Ingestion (Ticket Q&A)**:
    - Agent marks an article as "Q&A" (Question or Answer).
    - D1 is instantly updated, and a `VectorizeJob` is dispatched (`action: 'qa_mark'`).
    - The Workflow asynchronously retrieves the article body, chunks it, generates embeddings, and stores them in Vectorize. Unmarking purges these vectors using the same Workflow.
3. **Retrieval & Generation (Auto-Draft)**:
    - New ticket or agent reply initiates a search.
    - Input text converted to embedding.
    - Vectorize search returns top K relevant chunks/articles.
    - Prompt constructed: `Context: {retrieved_text} \n Question: {input_text} \n Suggestion:`
    - Workers AI generates response.

## 3. Technical Specification

### 3.1. Vector Index Schema
- **Namespace**: `kb` for documents, `qa` for ticket pairs.
- **Metadata**:
    - `id`: Unique identifier (UUID).
    - `source_id`: `knowledge_doc_id` or `article_id`.
    - `type`: `document` or `qa`.
    - `text`: (Optional, if small) or reference to D1/R2.

### 3.2. Services & Workflows
- `VectorService`: Wraps Vectorize API for upsert/query.
- `KnowledgeService`: Handles document parsing, chunking, and lifecycle.
- `AiService`: Wraps Workers AI for embeddings and generation.
- `VectorizeWorkflow`: A Cloudflare `WorkflowEntrypoint` class that orchestrates the multi-step background process for vector generation. It ensures robust retries and step isolation using `step.do()`.
    - **`create` / `update` (Knowledge Base)**: Steps include `fetch_content`, `delete_old_vectors`, `vectorize_content`, and `update_status`.
    - **`qa_mark` (Ticket Q&A)**: Steps include `fetch_qa_content`, `vectorize_qa`, `update_qa_status`, or `unmark_qa` (for deletion).
    - If an AI model or Vectorize indexing fails mid-process, the workflow automatically retries without repeating completed steps.

### 3.3. Database Updates
- `knowledge_docs` table: Already exists, needs `status` updates (`processing`, `active`, `error`).
- `articles` table: `qa_type` (already exists) will be used to trigger vectorization.

### 3.4. API Endpoints
- `POST /api/dashboard/knowledge`: Upload document.
- `GET /api/dashboard/knowledge`: List documents.
- `DELETE /api/dashboard/knowledge/:id`: Remove document.
- `POST /api/dashboard/articles/:id/qa`: Mark/Unmark as Q&A.
- `POST /api/dashboard/tickets/:id/ai-suggest`: Trigger AI suggestion generation.

## 4. Security & Privacy
- **Access Control**: Only authenticated agents/admins can access Vectorize data.
- **Data Isolation**: Ensure suggestions are only derived from the tenant's own data (since it's single-tenant, this is naturally handled).
- **Prompt Injection**: Sanitize input text and use strict system prompts for the AI.

## 6. Validation & Security Refinement (Final Turn)

### 6.1. Backend Robustness
- **Error Handling**: `AiService` and `VectorService` now include comprehensive `try/catch` blocks. Failures in external AI models or Vectorize indexing do not crash the Worker; instead, they return graceful fallbacks or meaningful error statuses.
- **Smart Chunking**: `KnowledgeService` implements a boundary-aware chunker that respects paragraph and sentence breaks, ensuring better semantic coherence in the vector index.
- **Q&A Lifecycle**: Marking an article as Q&A triggers a multi-chunk vectorization process. Unmarking correctly purges all related vector segments from the index.

### 6.2. Security Posture
- **Prompt Engineering**: Switched to structured `messages` format for `llama-3-8b-instruct`. Added a system prompt that enforces strict adherence to context and professional tone, significantly reducing the risk of prompt injection.
- **File Audit**: `KnowledgeService` now enforces a 10MB file size limit and restricts ingestion to safe text-based formats (`.txt`, `.md`, `.csv`). Binary formats are stored but flagged as `unsupported_type` for vectorization.
- **Vector Isolation**: Vector IDs are prefixed with `doc_` or `qa_` for easier management and clear logical separation within the single-tenant index.

### 6.3. UX Improvements
- **AI Suggestion UI**: The "Use Suggestion" feature was expanded to offer "Append" and "Replace All" options, giving agents more flexibility.
- **Visual Feedback**: Added an "INDEXED" badge with a `ShieldCheck` icon to any article currently active in the RAG system, providing immediate confirmation of agent actions.
- **Progress Indicators**: Knowledge upload now features an animated spinner and "Indexing..." state to manage agent expectations during vectorization.
