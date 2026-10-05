ALTER TABLE jobs ADD COLUMN IF NOT EXISTS research TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description_checked_at TEXT;
CREATE TABLE IF NOT EXISTS research_companies (
 user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 company_key TEXT NOT NULL, value TEXT NOT NULL,
 PRIMARY KEY(user_id,company_key)
);
