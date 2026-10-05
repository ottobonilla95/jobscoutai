import {createHash} from 'node:crypto';
import type {Store} from './store';
import type {Job,Assessment} from './profile';
import {supported} from './strategy';
import {researchDossierSchema,companyMemorySchema,type ResearchDossier,type ResearchEvidence,type ResearchQuestion} from './research-memory-schema';
export const researchId=(text:string)=>createHash('sha256').update(text).digest('hex').slice(0,32);
export const companyKey=(name:string)=>researchId(name.trim().normalize('NFKC').toLowerCase());
export function evidenceRecord(input:Omit<ResearchEvidence,'id'>):ResearchEvidence{return {...input,id:researchId(JSON.stringify([input.url,input.quote,input.scope,input.topic,input.stance]))};}
export function mergeEvidence(previous:ResearchEvidence[],next:ResearchEvidence[],limit=40){
 const records=new Map(previous.map(e=>[e.id,e]));for(const e of next)records.set(e.id,e);return [...records.values()].slice(-limit);
}
export function listingDossier(job:Job,assessment:Assessment,version:number,previous?:ResearchDossier|null):ResearchDossier{
 const now=new Date().toISOString(),retrievedAt=job.descriptionCheckedAt||job.firstSeen;
 const evidence:ResearchEvidence[]=[];
 const add=(topic:string,quote:string|null,claim=topic)=>{if(quote&&supported(quote,job.description||''))evidence.push(evidenceRecord({topic,claim,quote,url:job.url,scope:'job',origin:'listing',stance:'supports',recordedAt:now,retrievedAt}));};
 add('Salary',assessment.salaryEvidence);add('Equity',assessment.equityEvidence);add('Ownership',assessment.founderPathEvidence);
 for(const c of assessment.evaluation?.components||[])add(c.label,c.evidence,c.reason);
 for(const gate of assessment.evaluation?.gates||[])add(gate.label,gate.evidence,gate.reason);
 const questions:ResearchQuestion[]=assessment.concerns.map(question=>({id:researchId(question.toLowerCase()),question,topic:'Unresolved concern',status:'open',answer:'',evidenceIds:[]}));
 for(const gate of assessment.evaluation?.gates||[])if(gate.result==='unknown'){
  const question=`What evidence establishes the requirement: ${gate.label}?`;questions.push({id:researchId(question.toLowerCase()),question,topic:gate.label,status:'open',answer:'',evidenceIds:[]});
 }
 const oldQuestions=previous?.profileVersion===version?previous.questions:[];
 return researchDossierSchema.parse({profileVersion:version,updatedAt:now,summary:assessment.summary,evidence:mergeEvidence(previous?.evidence||[],evidence),questions:[...new Map([...oldQuestions,...questions].map(q=>[q.id,oldQuestions.find(old=>old.id===q.id)||q])).values()].slice(0,12),generationIds:previous?.generationIds||[]});
}
/** Source records remain account-owned; company-name matches never establish identity or work rights. */
export class ResearchMemory{
 constructor(readonly store:Store){}
 async company(name:string){const row=await this.store.db.prepare('SELECT value FROM research_companies WHERE user_id=? AND company_key=?').get(this.store.userId,companyKey(name));return row?companyMemorySchema.parse(JSON.parse(row.value)):null;}
 async save(jobId:string,dossier:ResearchDossier,expectedVersion:number){
  const parsed=researchDossierSchema.parse(dossier);
  if(parsed.profileVersion!==expectedVersion)return false;
  return this.store.db.transaction(async db=>{
   const profile=await db.prepare('SELECT version FROM profile WHERE user_id=? FOR UPDATE').get(this.store.userId);if(Number(profile?.version)!==expectedVersion)return false;
   const job=await db.prepare('SELECT company FROM jobs WHERE user_id=? AND id=? FOR UPDATE').get(this.store.userId,jobId);if(!job)return false;
   await db.prepare('UPDATE jobs SET research=? WHERE user_id=? AND id=?').run(JSON.stringify(parsed),this.store.userId,jobId);
   const companyEvidence=parsed.evidence.filter(e=>e.scope==='company');
   if(companyEvidence.length&&String(job.company).trim()){
    const key=companyKey(job.company);const old=await db.prepare('SELECT value FROM research_companies WHERE user_id=? AND company_key=?').get(this.store.userId,key);
    const previous=old?companyMemorySchema.parse(JSON.parse(old.value)).evidence:[];
    const memory=companyMemorySchema.parse({name:job.company,identity:'name_match_only',evidence:mergeEvidence(previous,companyEvidence,80),updatedAt:parsed.updatedAt});
    await db.prepare('INSERT INTO research_companies(user_id,company_key,value) VALUES(?,?,?) ON CONFLICT(user_id,company_key) DO UPDATE SET value=excluded.value').run(this.store.userId,key,JSON.stringify(memory));
   }return true;
  });
 }
 async capture(jobId:string,assessment:Assessment,version:number){const job=await this.store.job(jobId);if(!job)return false;return this.save(jobId,listingDossier(job,assessment,version,job.research),version);}
}
