import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import type {JobListing} from './profile';
import {publicHtml,safeUrl} from './verification';
import {plainText} from './source-html';
import {SourceError} from './source-error';

/** Web search proposes URLs, never job facts. Only a retrieved JobPosting is imported. */
export function parsePublicJob(html:string,url:string,now=Date.now()):JobListing{
  const $=load(html);const records:Record<string,unknown>[]=[];
  function collect(value:unknown){
    if(Array.isArray(value)){value.slice(0,100).forEach(collect);return;}
    if(!value||typeof value!=='object')return;
    const record=value as Record<string,unknown>;
    if(record['@type']==='JobPosting'||Array.isArray(record['@type'])&&record['@type'].includes('JobPosting'))records.push(record);
    if(record['@graph'])collect(record['@graph']);
  }
  $('script[type="application/ld+json"]').each((_,element)=>{try{collect(JSON.parse($(element).text()));}catch{/* Not usable structured evidence. */}});
  // A search/directory page listing many vacancies is not an individual listing.
  if(records.length!==1)throw new SourceError('Web discovery could not read a single public job posting. This URL was not imported.',false,{retryable:false});
  const record=records[0];
  const title=typeof record.title==='string'?plainText(record.title):'';
  const organization=record.hiringOrganization as {name?:unknown}|undefined;
  const company=typeof organization?.name==='string'?plainText(organization.name):'';
  const description=typeof record.description==='string'?plainText(record.description):'';
  if(!title||!company||description.length<100)throw new SourceError('Web discovery returned insufficient job evidence. This URL was not imported.',false,{retryable:false});
  if(typeof record.validThrough==='string'&&Date.parse(record.validThrough)<now)throw new SourceError('Web discovery found an expired job posting. It was not imported.',false,{retryable:false});
  const locations:string[]=[];
  for(const location of [record.jobLocation,record.applicantLocationRequirements].flat()){
    if(!location||typeof location!=='object')continue;
    const item=location as {name?:unknown;address?:{addressLocality?:unknown;addressRegion?:unknown;addressCountry?:unknown}};
    const values=item.address?[item.address.addressLocality,item.address.addressRegion,item.address.addressCountry]:[item.name];
    locations.push(values.map(value=>typeof value==='string'?value:value&&typeof value==='object'&&'name' in value&&typeof value.name==='string'?value.name:'').filter(Boolean).join(', '));
  }
  if(record.jobLocationType==='TELECOMMUTE')locations.push('Remote');
  const canonical=safeUrl(url);canonical.hash='';
  return {id:`web:${createHash('sha256').update(canonical.href).digest('hex').slice(0,32)}`,sourceKey:'web',url:canonical.href,title:title.slice(0,240),company:company.slice(0,240),location:locations.filter(Boolean).join(' · ').slice(0,1000),postedAt:typeof record.datePosted==='string'&&!Number.isNaN(Date.parse(record.datePosted))?record.datePosted:null,description:[description,...['baseSalary','jobBenefits','employmentType','jobLocationType','applicantLocationRequirements'].filter(key=>record[key]!=null).map(key=>`Structured posting ${key}: ${JSON.stringify(record[key])}`)].join('\n').slice(0,24000)};
}
export async function loadPublicJob(url:string,deadline?:number){
  const page=await publicHtml(url,{signal:AbortSignal.timeout(Math.max(1,Math.min(20000,(deadline??Date.now()+20000)-Date.now())))});
  if(page.status!==200)throw new SourceError(`Web discovery could not read this public job page (HTTP ${page.status}). It was not imported.`);
  return parsePublicJob(page.html,page.url);
}
