import {localizedJson} from '@/lib/language';
import {randomUUID} from 'node:crypto';
import {guard,limitedBody,withUserStore} from '@/lib/auth';
import {leadSchema} from '@core/leads';
export async function POST(request:Request){
 const denied=await guard(request);if(denied)return denied;
 try{const input=JSON.parse(new TextDecoder().decode(await limitedBody(request,65000)));const lead=leadSchema.parse(input);
 return withUserStore(async store=>{
  const id=typeof input.id==='string'?input.id:randomUUID();
  if(input.id){if(!(await store.saveLead(id,lead,true)))return localizedJson({error:'Lead not found.'},{status:404});}
  else{if((await store.leads()).some(l=>l.url===lead.url))return localizedJson({error:'This source link is already in your research queue.'},{status:409});(await store.saveLead(id,lead));}
  return localizedJson({id});
 });
 }catch{return localizedJson({error:'Check the company name, HTTPS link, and dates.'},{status:400});}
}
