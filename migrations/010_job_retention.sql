-- A discarded listing leaves identity hashes, never its description or assessment.
CREATE TABLE job_dedup (
 user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 job_id TEXT NOT NULL,
 profile_version INTEGER NOT NULL,
 url_hash TEXT NOT NULL,
 identity_hash TEXT,
 reason TEXT NOT NULL,
 retry_after TEXT,
 expires_at TEXT NOT NULL,
 PRIMARY KEY(user_id,job_id)
);
CREATE INDEX job_dedup_url ON job_dedup(user_id,profile_version,url_hash);
CREATE INDEX job_dedup_identity ON job_dedup(user_id,profile_version,identity_hash);
