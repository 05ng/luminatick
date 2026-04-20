-- Migration number: 0003 	 2024-05-24T00:00:00.000Z

CREATE TABLE IF NOT EXISTS ticket_fields (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL,
    options TEXT,
    is_active INTEGER DEFAULT 1
);

ALTER TABLE tickets ADD COLUMN custom_fields TEXT;