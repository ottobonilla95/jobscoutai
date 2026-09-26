import { backup, DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getAccounts } from '../packages/core/src/accounts';
import { dataDirectory } from '../packages/core/src/config';
const accounts=getAccounts();
const dir=join(dataDirectory(),'backups',new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(dir,{recursive:true,mode:0o700});
await backup(accounts.db,join(dir,'accounts.sqlite'));
const snapshot=new DatabaseSync(join(dir,'accounts.sqlite'),{readOnly:true});
const users=snapshot.prepare('SELECT id FROM accounts').all().map(row=>({id:String(row.id)}));snapshot.close();
for(const user of users){const target=join(dir,'users',user.id);mkdirSync(target,{recursive:true,mode:0o700});const store=accounts.store(user.id);try{await backup(store.db,join(target,'jobs.sqlite'));}finally{store.db.close();}}
const legacy=join(dataDirectory(),'jobs.sqlite');if(existsSync(legacy)){const db=new DatabaseSync(legacy);try{await backup(db,join(dir,'legacy-jobs.sqlite'));}finally{db.close();}}
console.log(`Backup saved to ${dir}`);
