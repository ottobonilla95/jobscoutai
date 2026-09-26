import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
export type Row = Record<string, any>;
export interface Connection {
  query(sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount?: number | null; affectedRows?: number }>;
}
/** A transaction always uses one checked-out connection, including with Neon's pooler. */
export class Database {
  constructor(private connection: Connection, private transact: <T>(fn: (db: Database) => Promise<T>) => Promise<T>, readonly close: () => Promise<void>) {}
  prepare(sql: string) {
    let n=0; const text=sql.replace(/\?/g,()=>`$${++n}`);
    return {
      all: async (...values: unknown[]) => (await this.connection.query(text,values)).rows,
      get: async (...values: unknown[]) => (await this.connection.query(text,values)).rows[0],
      run: async (...values: unknown[]) => {const r=await this.connection.query(text,values);return {changes:r.rowCount??r.affectedRows??0};},
    };
  }
  async exec(sql: string) { await this.connection.query(sql); }
  transaction<T>(fn: (db: Database) => Promise<T>): Promise<T> { return this.transact(fn); }
}
export function createDatabase(url: string) {
  const connection=new URL(url);
  if(connection.searchParams.get('sslmode')==='require')connection.searchParams.set('sslmode','verify-full');
  const pool=new Pool({connectionString:connection.href,max:4,connectionTimeoutMillis:15000,idleTimeoutMillis:5000,allowExitOnIdle:true});
  pool.on('error',()=>console.error('An idle database connection failed. The next request will reconnect.'));
  if(process.env.VERCEL)attachDatabasePool(pool);
  return new Database(pool,async fn=>{
    const client=await pool.connect();
    const db=new Database(client,async nested=>nested(db),async()=>{});
    try {await client.query('BEGIN');const result=await fn(db);await client.query('COMMIT');return result;}
    catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  },()=>pool.end());
}
let instance: Database|undefined;
export function getDatabase(){
  if(!instance){if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required. Connect a PostgreSQL database.');instance=createDatabase(process.env.DATABASE_URL);}
  return instance;
}
