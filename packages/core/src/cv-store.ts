import {randomUUID} from 'node:crypto';
import {type Database, type Row} from './database';
import {cvDraftSchema, cvToText, type CvDraft, type SavedCv} from './cv';
import {Store} from './store';

export class CvError extends Error {
  constructor(message:string,readonly status=400) {super(message);}
}
function fromRow(row:Row):SavedCv {
  return {...cvDraftSchema.parse(JSON.parse(row.value)),id:String(row.id),revision:Number(row.revision),updatedAt:String(row.updated_at)};
}
export class CvStore {
  constructor(readonly db:Database,readonly userId:string){}
  async list():Promise<SavedCv[]> {
    return (await this.db.prepare('SELECT * FROM cvs WHERE user_id=? ORDER BY updated_at DESC, id').all(this.userId)).map(fromRow);
  }
  async get(id:string):Promise<SavedCv> {
    const row=await this.db.prepare('SELECT * FROM cvs WHERE user_id=? AND id=?').get(this.userId,id);
    if(!row)throw new CvError('CV not found.',404);
    return fromRow(row);
  }
  async create(value:CvDraft):Promise<SavedCv> {
    const cv=cvDraftSchema.parse(value);
    return this.db.transaction(async db=>{
      await db.prepare('SELECT id FROM accounts WHERE id=? FOR UPDATE').get(this.userId);
      const {count}=await db.prepare('SELECT count(*) AS count FROM cvs WHERE user_id=?').get(this.userId);
      if(Number(count)>=20)throw new CvError('You can save up to 20 CVs. Delete one to create another.');
      const id=randomUUID(),updatedAt=new Date().toISOString();
      await db.prepare('INSERT INTO cvs(user_id,id,value,updated_at) VALUES(?,?,?,?)').run(this.userId,id,JSON.stringify(cv),updatedAt);
      return {...cv,id,revision:1,updatedAt};
    });
  }
  async update(id:string,revision:number,value:CvDraft):Promise<SavedCv> {
    const cv=cvDraftSchema.parse(value),updatedAt=new Date().toISOString();
    const result=await this.db.prepare('UPDATE cvs SET value=?,revision=revision+1,updated_at=? WHERE user_id=? AND id=? AND revision=?').run(JSON.stringify(cv),updatedAt,this.userId,id,revision);
    if(!result.changes){await this.get(id);throw new CvError('This CV changed in another tab. Reload it before saving.',409);}
    return {...cv,id,revision:revision+1,updatedAt};
  }
  async remove(id:string,revision:number) {
    const result=await this.db.prepare('DELETE FROM cvs WHERE user_id=? AND id=? AND revision=?').run(this.userId,id,revision);
    if(!result.changes){await this.get(id);throw new CvError('This CV changed in another tab. Reload it before saving.',409);}
  }
  async useForMatching(id:string,revision:number) {
    await this.db.transaction(async db=>{
      const store=new Store(db,this.userId),{profile}=await store.profile(true);
      const cv=await new CvStore(db,this.userId).get(id);
      if(cv.revision!==revision)throw new CvError('This CV changed in another tab. Reload it before saving.',409);
      const text=cvToText(cv);
      if(text.length<100)throw new CvError('Add at least 100 characters of CV content before using it for matching.');
      if(text.length>30000)throw new CvError('Shorten this CV to 30,000 characters before using it for matching.');
      await store.saveProfile({...profile,cvText:text,cvFileName:`${cv.title}.pdf`});
    });
  }
}
