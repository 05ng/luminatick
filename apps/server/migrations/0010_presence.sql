-- Create presence table for HTTP polling fallback
CREATE TABLE IF NOT EXISTS agent_presence (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);
