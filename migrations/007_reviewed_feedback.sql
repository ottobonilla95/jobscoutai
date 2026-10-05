ALTER TABLE jobs ADD COLUMN feedback TEXT;
CREATE TABLE opportunity_feedback (
 user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 job_id TEXT NOT NULL,
 value TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,id),
 FOREIGN KEY(user_id,job_id) REFERENCES jobs(user_id,id) ON DELETE CASCADE
);
CREATE INDEX feedback_job_history ON opportunity_feedback(user_id,job_id,created_at);
