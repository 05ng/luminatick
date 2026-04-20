-- Migration: 0008_customer_portal_auth
-- Description: Add customer portal auth tokens and last_login_at to users

CREATE TABLE IF NOT EXISTS customer_auth_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('magic_link', 'otp')),
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_auth_tokens_user_id ON customer_auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_auth_tokens_token_hash ON customer_auth_tokens(token_hash);

ALTER TABLE users ADD COLUMN last_login_at DATETIME;
