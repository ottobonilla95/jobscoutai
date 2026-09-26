import {localizedJson} from '@/lib/language';
import {randomUUID} from 'node:crypto';
import {guard,limitedBody,withUserStore} from '@/lib/auth';
import {leadSchema} from '@core/leads';
export async function POST(request:Request){
 const denied=await guard(request);if(denied)return denied;
 try{const input=JSON.parse(new TextDecoder().decode(await limitedBody(request,65000)));const lead=leadSchema.parse(input);
 return withUserStore(store=>{
  const id=typeof input.id==='string'?input.id:randomUUID();
  if(input.id){if(!store.db.prepare('UPDATE leads SET value=? WHERE id=?').run(JSON.stringify(lead),id).changes)return localizedJson({error:'Lead not found.'},{status:404});}
  else{if(store.leads().some(l=>l.url===lead.url))return localizedJson({error:'This source link is already in your research queue.'},{status:409});store.db.prepare('INSERT INTO leads VALUES(?,?,?)').run(id,JSON.stringify(lead),new Date().toISOString());}
  return localizedJson({id});
 });
 }catch{return localizedJson({error:'Check the company name, HTTPS link, and dates.'},{status:400});}
}
