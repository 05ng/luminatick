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
