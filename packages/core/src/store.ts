import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultProfile, profileSchema, type Profile, type Job, type JobListing, type Assessment, type Run, type Tracking, type Verification } from './profile';
import { sourceEnabled } from './source-settings';

type Row = Record<string, unknown>;
export class Store {
  readonly db: DatabaseSync;
  constructor(filename: string) {
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL, version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), next_run TEXT, requested INTEGER NOT NULL DEFAULT 0, heartbeat TEXT);
      CREATE TABLE IF NOT EXISTS locks (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, company TEXT NOT NULL, location TEXT NOT NULL, url TEXT NOT NULL,
        posted_at TEXT, description TEXT, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
        assessment TEXT, score INTEGER, evaluated_version INTEGER, status TEXT NOT NULL DEFAULT 'new', notified_at TEXT
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL,
        discovered INTEGER NOT NULL DEFAULT 0, evaluated INTEGER NOT NULL DEFAULT 0, matched INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, error TEXT
      );
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, sent_at TEXT, error TEXT
      );
      CREATE TABLE IF NOT EXISTS delivery_jobs (job_id TEXT PRIMARY KEY REFERENCES jobs(id), delivery_id TEXT NOT NULL REFERENCES deliveries(id));
      CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, value TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY CHECK(id=1), attempts INTEGER NOT NULL, window_start INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS jobs_score ON jobs(score DESC);
    `);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!this.db.prepare('PRAGMA table_info(jobs)').all().some(row => row.name === 'source_key')) {
        this.db.exec("ALTER TABLE jobs ADD COLUMN source_key TEXT NOT NULL DEFAULT 'linkedin'");
      }
      for(const [name,definition] of Object.entries({tracking: "TEXT NOT NULL DEFAULT '{}'",verification:'TEXT',duplicate_of:'TEXT',duplicate_reviewed:'INTEGER NOT NULL DEFAULT 0'})){
        if(!this.db.prepare('PRAGMA table_info(jobs)').all().some(r=>r.name===name))this.db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${definition}`);
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    this.db.prepare('INSERT OR IGNORE INTO profile VALUES(1, ?, 1)').run(JSON.stringify(defaultProfile));
    const saved=this.db.prepare('SELECT value FROM profile WHERE id=1').get()!;
    const legacy=JSON.parse(String(saved.value));
    if(!legacy.strategy)this.db.prepare('UPDATE profile SET value=?,version=version+1 WHERE id=1').run(JSON.stringify(profileSchema.parse(legacy)));
    this.db.exec('INSERT OR IGNORE INTO state(id) VALUES(1)');
  }
  profile(): { profile: Profile; version: number } {
    const row = this.db.prepare('SELECT * FROM profile WHERE id=1').get()!;
    return { profile: profileSchema.parse(JSON.parse(String(row.value))), version: Number(row.version) };
  }
  saveProfile(profile: Profile) {
    const old = this.profile();
    const matchFields = (p: Profile) => JSON.stringify([p.objective, p.cvText, p.titles, p.constraints, p.salaryExpectation, p.equityExpectation, p.remoteOnly, p.locations, p.sources, p.companyBoards, p.strategy, p.postedWithinDays, p.includeUnknownDates, p.outputLanguage]);
    const changed = matchFields(profile) !== matchFields(old.profile);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE profile SET value=?, version=version+? WHERE id=1').run(JSON.stringify(profile), changed ? 1 : 0);
      if (profile.enabled && !old.profile.enabled) {
        this.db.prepare('UPDATE state SET next_run=? WHERE id=1').run(new Date().toISOString());
      } else if (profile.intervalHours !== old.profile.intervalHours) {
        this.db.prepare('UPDATE state SET next_run=? WHERE id=1').run(new Date(Date.now() + profile.intervalHours * 3600000).toISOString());
      }
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  state() { return this.db.prepare('SELECT * FROM state WHERE id=1').get()!; }
  requestRun() {
    this.db.prepare('UPDATE state SET requested=1 WHERE id=1').run();
  }
  heartbeat(owner?: string) {
    this.db.prepare('UPDATE state SET heartbeat=? WHERE id=1').run(new Date().toISOString());
    if (owner) this.db.prepare('UPDATE locks SET expires=? WHERE owner=?').run(Date.now() + 180000, owner);
  }
  claim(force = false): string | null {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const lock = this.db.prepare('SELECT * FROM locks WHERE id=1').get();
      const state = this.state();
      const { profile } = this.profile();
      const due = profile.enabled && (!state.next_run || Date.parse(String(state.next_run)) <= Date.now());
      if ((lock && Number(lock.expires) > Date.now()) || (!force && !state.requested && !due)) {
        this.db.exec('ROLLBACK'); return null;
      }
      const id = randomUUID();
      this.db.prepare("UPDATE runs SET status='failed', finished_at=?, error='Previous worker stopped before completion.' WHERE status='running'").run(new Date().toISOString());
      this.db.prepare('INSERT OR REPLACE INTO locks VALUES(1, ?, ?)').run(id, Date.now() + 180000);
      this.db.prepare('INSERT INTO runs(id, started_at, status) VALUES(?, ?, ?)').run(id, new Date().toISOString(), 'running');
      this.db.prepare('UPDATE state SET requested=0, next_run=? WHERE id=1').run(new Date(Date.now() + profile.intervalHours * 3600000).toISOString());
      this.db.exec('COMMIT'); return id;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  finish(id: string, status: Run['status'], counts: { discovered: number; evaluated: number; matched: number; inputTokens: number; outputTokens: number }, error: string | null) {
    this.db.prepare('UPDATE runs SET finished_at=?, status=?, discovered=?, evaluated=?, matched=?, input_tokens=?, output_tokens=?, error=? WHERE id=?')
      .run(new Date().toISOString(), status, counts.discovered, counts.evaluated, counts.matched, counts.inputTokens, counts.outputTokens, error, id);
    this.db.prepare('DELETE FROM locks WHERE owner=?').run(id);
  }
  upsert(listing: JobListing) {
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO jobs(id,title,company,location,url,posted_at,first_seen,last_seen,source_key,description) VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,company=excluded.company,location=excluded.location,last_seen=excluded.last_seen`)
      .run(listing.id, listing.title, listing.company, listing.location, listing.url, listing.postedAt, now, now, listing.sourceKey || 'linkedin', listing.description || null);
    const duplicate=this.db.prepare("SELECT id FROM jobs WHERE id!=? AND (url=? OR (lower(trim(company))=lower(trim(?)) AND lower(trim(title))=lower(trim(?)) AND lower(trim(location))=lower(trim(?)))) AND duplicate_of IS NULL ORDER BY first_seen LIMIT 1").get(listing.id,listing.url,listing.company,listing.title,listing.location);
    if(duplicate)this.db.prepare('UPDATE jobs SET duplicate_of=? WHERE id=? AND duplicate_reviewed=0').run(duplicate.id,listing.id);
  }
  description(id: string, text: string) { this.db.prepare('UPDATE jobs SET description=? WHERE id=?').run(text, id); }
  assess(id: string, assessment: Assessment, version: number) {
    this.db.prepare('UPDATE jobs SET assessment=?,score=?,evaluated_version=? WHERE id=?').run(JSON.stringify(assessment), assessment.score, version, id);
  }
  track(id:string,tracking:Tracking){return this.db.prepare('UPDATE jobs SET tracking=? WHERE id=?').run(JSON.stringify(tracking),id).changes;}
  verify(id:string,verification:Verification){this.db.prepare('UPDATE jobs SET verification=? WHERE id=?').run(JSON.stringify(verification),id);}
  job(id:string){const row=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);return row?jobFromRow(row):null;}
  leads(){return this.db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all().map(r=>({id:String(r.id),...JSON.parse(String(r.value)),createdAt:String(r.created_at)}));}
  evaluatedToday(){return Number(this.db.prepare("SELECT COALESCE(SUM(evaluated),0) AS n FROM runs WHERE started_at>=?").get(new Date().toISOString().slice(0,10))!.n);}
  pending(version: number, limit: number, profile?: Profile, blocked: string[] = []): Job[] {
    const jobs = this.db.prepare("SELECT * FROM jobs WHERE status!='dismissed' AND duplicate_of IS NULL AND (evaluated_version IS NULL OR evaluated_version!=?) ORDER BY last_seen DESC LIMIT ?")
      .all(version, profile ? -1 : limit).map(jobFromRow)
      .filter(job => (!profile || sourceEnabled(profile, job.sourceKey)) && !blocked.includes(job.sourceKey || 'linkedin'));
    // Share the evaluation budget across sources so a busy portal cannot crowd out the others.
    const groups = new Map<string,Job[]>();
    for (const job of jobs) { const key=job.sourceKey || 'linkedin'; if(!groups.has(key))groups.set(key,[]); groups.get(key)!.push(job); }
    const selected:Job[]=[];
    while(selected.length<limit && groups.size) for(const [key,group] of groups){
      if(selected.length>=limit)break;
      selected.push(group.shift()!); if(!group.length)groups.delete(key);
    }
    return selected;
  }
  jobs(): Job[] { return this.db.prepare('SELECT * FROM jobs ORDER BY score DESC,first_seen DESC').all().map(jobFromRow); }
  runs(): Run[] { return this.db.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT 30').all().map(row => ({
    id: String(row.id), startedAt: String(row.started_at), finishedAt: row.finished_at as string | null,
    status: row.status as Run['status'], discovered: Number(row.discovered), evaluated: Number(row.evaluated), matched: Number(row.matched),
    inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens), error: row.error as string | null,
  })); }
  allowLogin(): boolean {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const now = Date.now();
      const row = this.db.prepare('SELECT * FROM login_attempts WHERE id=1').get();
      if (!row || Number(row.window_start) < now - 60000) {
        this.db.prepare('INSERT OR REPLACE INTO login_attempts VALUES(1,1,?)').run(now);
      } else {
        if (Number(row.attempts) >= 10) { this.db.exec('COMMIT'); return false; }
        this.db.exec('UPDATE login_attempts SET attempts=attempts+1 WHERE id=1');
      }
      this.db.exec('COMMIT'); return true;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
}
function jobFromRow(row: Row): Job {
  return { id: String(row.id), title: String(row.title), company: String(row.company), location: String(row.location), url: String(row.url),
    tracking: row.tracking?JSON.parse(String(row.tracking)):{}, verification:row.verification?JSON.parse(String(row.verification)):null,duplicateOf:row.duplicate_of as string|null,
    sourceKey: String(row.source_key || 'linkedin'),
    postedAt: row.posted_at as string | null, description: row.description as string | null, firstSeen: String(row.first_seen), lastSeen: String(row.last_seen),
    assessment: row.assessment ? JSON.parse(String(row.assessment)) : null, status: row.status as Job['status'],
    notifiedAt: row.notified_at as string | null, evaluatedVersion: row.evaluated_version as number | null };
}
