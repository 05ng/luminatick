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

### 2.2. Data Flow
1. **Ingestion (Knowledge Base)**:
    - User uploads document via Dashboard.
    - Document stored in R2.
    - Text extracted and chunked.
    - Chunks converted to embeddings and stored in Vectorize with metadata (`doc_id`, `chunk_index`).
2. **Ingestion (Ticket Q&A)**:
    - Agent marks an article as "Q&A" (Question or Answer).
    - Article text converted to embedding and stored in Vectorize with metadata (`ticket_id`, `article_id`, `type: 'qa'`).
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

### 3.2. Services
- `VectorService`: Wraps Vectorize API for upsert/query.
- `KnowledgeService`: Handles document parsing and lifecycle.
- `AiService`: Wraps Workers AI for embeddings and generation.

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
