import {brand} from './brand';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import type {LookupAddress} from 'node:dns';
import { load } from 'cheerio';
import type { Verification } from './profile';

export function publicAddress(address:string):boolean {
 if(isIP(address)===4){const [a,b]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&[0,168].includes(b)||a===100&&b>=64&&b<=127||a===198&&[18,19,51].includes(b)||a===203&&b===0);}
 // Only global IPv6 unicast; reject documentation, local, mapped and transition ranges.
 return isIP(address)===6 && /^[23]/i.test(address) && !/^(2001:|2002:)/i.test(address);
}
export function pinnedLookup(addresses:LookupAddress[]):LookupFunction{
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('This address cannot be checked.');
 return (_host,options,callback)=>options.all?callback(null,addresses):callback(null,addresses[0].address,addresses[0].family);
}
export function safeUrl(value:string){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||url.hostname.endsWith('.local')||url.hostname==='localhost')throw new Error('Only public HTTPS application pages can be checked.');return url;}
export async function publicHtml(value:string,options:{signal?:AbortSignal}={}):Promise<{html:string;url:string;status:number}>{
 let url=safeUrl(value);
 for(let hop=0;hop<4;hop++){
  options.signal?.throwIfAborted();
  const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('This address cannot be checked.');
  options.signal?.throwIfAborted();
  const lookupPinned=pinnedLookup(addresses);
  const page=await new Promise<{status:number;html:string;redirect?:string}>((resolve,reject)=>{
   const req=request(url,{headers:{'User-Agent':brand.httpAgent,Accept:'text/html'},lookup:lookupPinned},res=>{
    const status=res.statusCode||0;if(status>=300&&status<400){res.resume();resolve({status,html:'',redirect:res.headers.location});return;}
    if(res.headers['content-type']&&!res.headers['content-type'].includes('text/html')){res.resume();reject(new Error('The application page is not readable HTML.'));return;}
    let size=0;const chunks:Buffer[]=[];res.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){res.destroy();reject(new Error('Page exceeds the check limit.'));}else chunks.push(chunk);});
    res.on('end',()=>resolve({status,html:Buffer.concat(chunks).toString('utf8')}));res.on('error',reject);
   });const timeout=setTimeout(()=>req.destroy(new Error('Page check timed out.')),12000);const abort=()=>req.destroy(new Error('Page check cancelled.'));options.signal?.addEventListener('abort',abort,{once:true});req.on('close',()=>{clearTimeout(timeout);options.signal?.removeEventListener('abort',abort);});req.on('error',reject);if(options.signal?.aborted)abort();else req.end();
  });
  if(page.redirect){url=safeUrl(new URL(page.redirect,url).href);continue;}
  return {...page,url:url.href};
 }
 throw new Error('Too many redirects; check the application route manually.');
}
export function inspectPage(html:string,url:string,status:number):Pick<Verification,'status'|'applicationUrl'>{
 const $=load(html);$('script,style,nav,footer').remove();const text=$('body').text().replace(/\s+/g,' ');
 if(status===404||status===410||/no longer accepting applications|this (job|position|vacancy) (is|has been) (closed|filled)|job (not found|is no longer available)/i.test(text))return {status:'closed' as const,applicationUrl:null};
 if(status!==200||/captcha|verify you are human|security check|sign in to continue/i.test(text))return {status:'unknown' as const,applicationUrl:null};
 const form=$('form').filter((_,e)=>/resume|curriculum|type=["']file["']/i.test($(e).html()||'')).first();
 if(form.length)return {status:'open' as const,applicationUrl:url};
 let applicationUrl:string|null=null;
 $('a[href]').each((_,a)=>{if(applicationUrl||!/^(apply|apply now|apply for this (job|role)|submit application|easy apply)$/i.test($(a).text().trim()))return;try{applicationUrl=safeUrl(new URL($(a).attr('href')!,url).href).href;}catch{}});
 return {status:'unknown' as const,applicationUrl};
}
export async function verifyListing(url:string,read=publicHtml):Promise<Verification>{
 const checkedAt=new Date().toISOString();
 try{
  const first=await read(url);const found=inspectPage(first.html,first.url,first.status);
  if(found.status==='closed')return {...found,checkedAt,note:'The listing reports that it is closed or unavailable.'};
  if(found.status==='open')return {...found,checkedAt,note:'A reachable application form was found. No application was submitted.'};
  if(found.applicationUrl&&found.applicationUrl!==first.url){const final=await read(found.applicationUrl);const result=inspectPage(final.html,final.url,final.status);return {status:result.status,applicationUrl:final.url,checkedAt,note:result.status==='open'?'The linked application form is reachable. No application was submitted.':'The linked page needs a manual application-route check.'};}
  return {status:'unknown',applicationUrl:found.applicationUrl,checkedAt,note:'A working application form could not be confirmed. Check manually; login or JavaScript may be required.'};
 }catch{return {status:'unknown',applicationUrl:null,checkedAt,note:'The page could not be safely reached or verified. Check the original listing manually.'};}
}
