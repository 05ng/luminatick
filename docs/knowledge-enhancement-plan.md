# Phase 3.3: Knowledge Base Enhancement Plan

This document outlines the architecture and implementation steps required to enhance the Knowledge Base page with category management, a markdown editor, and document lifecycle management.

## 1. Database Schema Changes

We need to introduce a hierarchical category structure and update the existing documents table to support categorization and direct content editing.

**Migration Script (`0006_knowledge_categories.sql`):**
```sql
-- Create Knowledge Categories Table
CREATE TABLE IF NOT EXISTS knowledge_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(parent_id) REFERENCES knowledge_categories(id) ON DELETE SET NULL
);

-- Add category reference to existing docs
ALTER TABLE knowledge_docs ADD COLUMN category_id TEXT REFERENCES knowledge_categories(id);
```

## 2. Backend API & Service Updates

### `src/services/knowledge.service.ts`
- **Category Methods:**
  - `createCategory(name: string, parentId?: string)`: Generates UUID, inserts into D1.
  - `getCategories()`: Retrieves all categories to build the tree.
  - `deleteCategory(id: string)`: Deletes category (and decides handling of orphaned docs - e.g., set to NULL).
- **Document Methods:**
  - `createArticle(title: string, content: string, categoryId: string)`: 
    - Saves the markdown string to R2 as a `.md` file.
    - Inserts a record into `knowledge_docs`.
    - Vectorizes the markdown content for AI search.
  - `updateArticle(id: string, title: string, content: string, categoryId: string)`:
    - Overwrites the file in R2.
    - Updates D1 `title` and `category_id`.
    - Deletes old vector chunks and re-vectors the new content.
  - `getArticleContent(id: string)`:
    - Looks up `file_path` in D1.
    - Fetches the object from R2 and returns its text.

### `src/handlers/knowledge.handler.ts`
- `GET /knowledge/categories`: Returns flat or nested list of categories.
- `POST /knowledge/categories`: Creates a new category.
- `POST /knowledge/articles`: Creates a new Markdown article (JSON payload instead of FormData).
- `PUT /knowledge/articles/:id`: Updates an existing article.
- `GET /knowledge/articles/:id/content`: Returns the Markdown text of the article.

## 3. Frontend Component Breakdown

### Dependencies
- Install a markdown editor, e.g., `@uiw/react-md-editor` or `react-simplemde-editor`, to support robust markdown authoring.

### `apps/dashboard/src/pages/KnowledgePage.tsx`
Redesign the current layout into a split-pane view (Sidebar + Main Content).

**1. Left Sidebar (Categories Tree)**
- A recursive component (`CategoryTree`) to display categories and sub-categories.
- Includes a "Add Category" button (or inline `+` icon on hover) to create roots or children.
- Selecting a category filters the right-hand article list.

**2. Right Content Area (Article List)**
- Displays a table/grid of `knowledge_docs` filtered by the selected category.
- "New Article" button at the top right.
- Clicking an article row opens the editor for viewing/editing.

### `apps/dashboard/src/pages/KnowledgeEditorPage.tsx` (New Route)
- Create a dedicated route (e.g., `/knowledge/new` or `/knowledge/edit/:id`).
- **Fields:**
  - **Title:** Text input.
  - **Category:** Dropdown or tree-select.
  - **Editor:** Full-featured Markdown editor for the body.
- **Actions:**
  - **Save:** Submits to `POST /articles` or `PUT /articles/:id`. Shows loading state during R2 upload and vectorization.
  - **Cancel:** Navigates back to the Knowledge List.

## 4. Implementation Steps

1. **Database Setup:** 
   - Create and run the D1 migration for `knowledge_categories`.
2. **Backend Development:**
   - Update `KnowledgeService` with category management, raw text R2 handling, and vectorization updates.
   - Expose these methods via `knowledge.handler.ts`.
3. **Frontend Routing:**
   - Add `KnowledgeEditorPage` to `App.tsx` routes.
4. **Frontend UI:**
   - Implement the Category Sidebar and integrate it into `KnowledgePage.tsx`.
   - Build the `KnowledgeEditorPage` with form state and API integration.
5. **Testing:**
   - Verify that markdown is successfully saved to R2.
   - Verify that vectorization completes and AI Auto-Suggest still functions with manually created articles.

## Post-Implementation Fixes
- **API Mismatches:** Fixed API route mismatches between the frontend and backend for fetching and updating articles.
- **AI Embeddings:** Fixed the Cloudflare AI embeddings array shape mismatch (handling 1D vs 2D arrays).
- **Vectorize Validation:** Fixed metadata validation by removing the reserved 'id' field from the Vectorize metadata payload.
- **Local Development:** Added `remote: true` to the ai and vectorize bindings in `wrangler.json` to allow local development to work with remote resources.
- **UI Improvements:** Replaced the browser native `window.confirm()` with a custom HTML dialog in the Knowledge Base frontend for deleting articles and categories.
