CREATE TABLE IF NOT EXISTS support_emails (
    id TEXT PRIMARY KEY,
    email_address TEXT UNIQUE NOT NULL,
    name TEXT,
    group_id TEXT REFERENCES groups(id),
    is_default INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings (key, value, description) VALUES 
('channel_chat_enabled', 'true', 'Enable the live chat widget channel'),
('channel_web_form_enabled', 'true', 'Enable the web form widget channel')
ON CONFLICT(key) DO NOTHING;

-- Note: We assume tickets.source_email is either added here or handled elsewhere.
-- Uncommenting it since it was in the original file.
ALTER TABLE tickets ADD COLUMN source_email TEXT;
