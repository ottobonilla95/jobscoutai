import { z } from 'zod';
import {discoverySchema} from './discovery';

const id = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
export const criterionSchema = z.object({ id, label:z.string().min(2).max(100), rubric:z.string().min(10).max(1500), weight:z.number().min(1).max(100) });
export const groupSchema = z.object({ id, label:z.string().min(2).max(100), weight:z.number().min(1).max(100), criteria:z.array(criterionSchema).min(1).max(8) });
export const strategySchema = z.object({
  discovery:discoverySchema.nullable().default(null),
  citizenships:z.array(z.string().trim().min(2).max(80)).max(6).default([]),
  relocation:z.string().max(1000).default(''),
  workAccess:z.array(z.object({ country:z.string().regex(/^[A-Z]{2}$/,'Use a two-letter country code, such as US or MX.'), access:z.enum(['authorized','sponsorship']), unknownSponsorship:z.enum(['allow','research','exclude']) })).max(40).default([]),
  requirements:z.array(z.object({ id, label:z.string().min(2).max(120), instruction:z.string().min(10).max(4000), unknown:z.enum(['research','exclude','allow']) })).max(10).default([]),
  groups:z.array(groupSchema).min(1).max(4),
  caps:z.array(z.object({ criterionId:id, atOrBelow:z.number().min(1).max(5), maximum:z.number().min(0).max(100) })).max(8).default([]),
}).superRefine((s,ctx)=>{
  const keys=[...s.groups.map(g=>g.id),...s.groups.flatMap(g=>g.criteria.map(c=>c.id)),...s.requirements.map(r=>r.id)];
  if(new Set(keys).size!==keys.length)ctx.addIssue({code:'custom',message:'Each group, criterion and requirement needs a unique ID.'});
  if(new Set(s.workAccess.map(r=>r.country)).size!==s.workAccess.length)ctx.addIssue({code:'custom',message:'Use one work-access rule per country.'});
  for(const cap of s.caps)if(!s.groups.some(g=>g.criteria.some(c=>c.id===cap.criterionId)))ctx.addIssue({code:'custom',message:'A score cap refers to an unknown criterion.'});
});
export type Strategy=z.infer<typeof strategySchema>;
export const defaultStrategy:Strategy={discovery:null,citizenships:[],relocation:'',workAccess:[],requirements:[],caps:[],groups:[{id:'fit',label:'Overall fit',weight:100,criteria:[
  {id:'skills',label:'Skills',weight:40,rubric:'1: serious mismatch; 3: partial overlap or important unknowns; 5: strong match backed by the CV and job requirements.'},
  {id:'responsibilities',label:'Responsibilities',weight:25,rubric:'1: conflicts with the stated career goal; 3: some relevant responsibilities; 5: clear evidence of responsibilities that strongly advance the goal.'},
  {id:'conditions',label:'Working conditions',weight:20,rubric:'1: stated conditions conflict with preferences; 3: partial match or missing salary/location evidence; 5: stated compensation and working conditions meet preferences.'},
  {id:'interest',label:'Industry and product interest',weight:15,rubric:'1: conflicts with candidate interests; 3: neutral or unknown; 5: strongly matches explicitly stated interests with concrete product evidence.'},
]}]};
export const researchSchema=z.object({
  components:z.array(z.object({id:z.string(),score:z.number().min(1).max(5).nullable(),reason:z.string().max(500),evidence:z.string().max(600).nullable()})).max(32),
  requirements:z.array(z.object({id:z.string(),result:z.enum(['pass','fail','unknown']),evidence:z.string().max(600).nullable(),reason:z.string().max(500)})).max(10),
  countries:z.array(z.object({country:z.string(),locationEvidence:z.string().max(600).nullable(),sponsorship:z.enum(['offered','refused','unknown']),sponsorshipEvidence:z.string().max(600).nullable()})).max(40),
});
export type Research=z.infer<typeof researchSchema>;
export type Decision='apply'|'apply_verify'|'research'|'exclude';
const normalized=(text:string)=>text.toLowerCase().replace(/\s+/g,' ').trim();
/** Accept an exact excerpt with optional presentation quotes, never a paraphrase. */
export function verifiedExcerpt(quote:string|null,source:string):string|null{
 if(!quote)return null;
 const value=quote.trim(),candidates=[value];
 for(const [open,close] of [['"','"'],["'","'"],['“','”'],['‘','’']]){
  if(value.startsWith(open)&&value.endsWith(close)&&value.length>2)candidates.push(value.slice(1,-1).trim());
 }
 return candidates.find(candidate=>candidate.length>0&&normalized(source).includes(normalized(candidate)))??null;
}
export function supported(quote:string|null,source:string){const excerpt=verifiedExcerpt(quote,source);return Boolean(excerpt&&excerpt.length>=8);}
export function evaluateStrategy(strategy:Strategy,raw:Research,description:string,location:string){
 const evidenceSource=`${location}\n${description}`;
 const components=strategy.groups.flatMap(g=>g.criteria).map(c=>{
  const items=raw.components.filter(r=>r.id===c.id);const r=items.length===1?items[0]:undefined;
  const valid=r && supported(r.evidence,description);
  return {id:c.id,label:c.label,score:valid?r.score:null,reason:r?.reason||'No assessment returned.',evidence:valid?r!.evidence:null};
 });
 // Fit uses supported criteria only. Evidence coverage is reported separately;
 // missing compensation or ownership is never scored as a proven mismatch.
 const weights=strategy.groups.flatMap(g=>g.criteria.map(c=>({id:c.id,weight:g.weight*c.weight/g.criteria.reduce((sum,item)=>sum+item.weight,0)})));
 const known=components.filter(c=>c.score!==null);
 const knownWeight=weights.filter(w=>known.some(c=>c.id===w.id)).reduce((sum,w)=>sum+w.weight,0);
 const evidenceCoverage=Math.round(knownWeight/weights.reduce((sum,w)=>sum+w.weight,0)*100);
 const groups=strategy.groups.map(g=>{
  const scored=g.criteria.filter(c=>known.some(r=>r.id===c.id));
  const weight=scored.reduce((sum,c)=>sum+c.weight,0);
  return {id:g.id,label:g.label,score:weight?Math.round(scored.reduce((sum,c)=>sum+known.find(r=>r.id===c.id)!.score!*c.weight,0)/weight*10)/10:0};
 });
 let score=knownWeight?Math.round(known.reduce((sum,c)=>sum+c.score!*weights.find(w=>w.id===c.id)!.weight,0)/knownWeight*20):0;
 for(const cap of strategy.caps){const component=components.find(c=>c.id===cap.criterionId);if(component?.score!=null&&component.score<=cap.atOrBelow)score=Math.min(score,cap.maximum);}
 const gates=strategy.requirements.map(rule=>{
  const entries=raw.requirements.filter(r=>r.id===rule.id);const r=entries.length===1?entries[0]:undefined;
  const valid=r&&supported(r.evidence,['user_search_scope','user_work_access'].includes(rule.id)?evidenceSource:description);const result=valid?r!.result:'unknown';
  return {id:rule.id,label:rule.label,result,evidence:valid?r!.evidence:null,reason:r?.reason||'Evidence not established.',action:result==='fail'?'exclude':result==='unknown'?rule.unknown:'allow'};
 });
 const access=raw.countries.filter(c=>/^[A-Z]{2}$/.test(c.country)&&supported(c.locationEvidence,evidenceSource)).map(c=>{
  const rule=strategy.workAccess.find(r=>r.country===c.country);
  const sponsorship=supported(c.sponsorshipEvidence,evidenceSource)?c.sponsorship:'unknown';
  const action=!rule?'research':rule.access==='authorized'?'allow':sponsorship==='refused'?'exclude':sponsorship==='offered'?'allow':rule.unknownSponsorship;
  return {country:c.country,sponsorship,evidence:supported(c.sponsorshipEvidence,evidenceSource)?c.sponsorshipEvidence:null,action};
 });
 // Alternative locations are alternatives, but missing or ambiguous access never becomes a positive eligibility claim.
 const accessAction=!strategy.workAccess.length?'allow':access.some(a=>a.action==='allow')?'allow':!access.length||access.some(a=>a.action==='research')?'research':'exclude';
 const failed=gates.some(g=>g.action==='exclude')||accessAction==='exclude';
 const research=evidenceCoverage<60||gates.some(g=>g.action==='research')||accessAction==='research';
 const uncertain=components.some(c=>c.score===null)||gates.some(g=>g.result==='unknown')||access.some(a=>a.sponsorship==='unknown'&&strategy.workAccess.find(r=>r.country===a.country)?.access!=='authorized');
 const decision:Decision=failed?'exclude':research?'research':uncertain?'apply_verify':'apply';
 return {score,overall:score/20,evidenceCoverage,groups,components,gates,access,decision};
}
