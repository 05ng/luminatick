-- Luminatick Seed Data
PRAGMA foreign_keys = ON;
INSERT OR IGNORE INTO config (key, value) VALUES ('COMPANY_NAME', 'Luminatick Support');
INSERT OR IGNORE INTO config (key, value) VALUES ('PORTAL_URL', 'https://support.example.com');
INSERT OR IGNORE INTO config (key, value) VALUES ('SYSTEM_TIMEZONE', 'UTC');
INSERT OR IGNORE INTO config (key, value) VALUES ('TICKET_PREFIX', 'SUP-');
INSERT OR IGNORE INTO config (key, value) VALUES ('DEFAULT_EMAIL_SIGNATURE', '---\nLuminatick Support Team');
INSERT OR IGNORE INTO config (key, value) VALUES ('ALLOW_PUBLIC_SIGNUP', 'false');
INSERT OR IGNORE INTO config (key, value) VALUES ('DEFAULT_TICKET_STATUS', 'open');
INSERT OR IGNORE INTO groups (id, name, description) VALUES ('00000000-0000-0000-0000-000000000002', 'General Support', 'The default group for all incoming tickets.');
INSERT OR IGNORE INTO users (id, email, full_name, password_hash, role, mfa_enabled) VALUES ('00000000-0000-0000-0000-000000000001', 'admin@luminatick.local', 'System Admin', '0gNYgMXf5HBo0Prm3dP9cw==:100000:iapOOT2d1XH7SDnSKFWRNhLkZ7SOlqF33U9/qPPFqZI=', 'admin', FALSE);
INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');