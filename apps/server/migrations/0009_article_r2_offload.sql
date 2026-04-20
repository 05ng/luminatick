-- Migration number: 0009 	 2024-05-24T00:00:00.000Z
PRAGMA defer_foreign_keys=TRUE;

CREATE TABLE IF NOT EXISTS new_articles (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    sender_id TEXT,
    sender_type TEXT NOT NULL,
    body TEXT,
    body_r2_key TEXT,
    snippet TEXT,
    raw_email_id TEXT,
    qa_type TEXT CHECK(qa_type IN ('question', 'answer')) DEFAULT NULL,
    is_internal BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
);

INSERT INTO new_articles (id, ticket_id, sender_id, sender_type, body, raw_email_id, qa_type, is_internal, created_at)
SELECT id, ticket_id, sender_id, sender_type, body, raw_email_id, qa_type, is_internal, created_at
FROM articles;

DROP TABLE articles;

ALTER TABLE new_articles RENAME TO articles;
