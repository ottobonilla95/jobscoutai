ALTER TABLE jobs ADD COLUMN research_request_id TEXT;
ALTER TABLE runs ADD COLUMN research_stats TEXT;
CREATE TABLE research_tasks (
 user_id TEXT NOT NULL,
 job_id TEXT NOT NULL,
 profile_version INTEGER NOT NULL,
 value TEXT NOT NULL,
 PRIMARY KEY(user_id,job_id,profile_version),
 FOREIGN KEY(user_id,job_id) REFERENCES jobs(user_id,id) ON DELETE CASCADE
);
