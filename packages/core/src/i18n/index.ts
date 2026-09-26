import {brand} from '../brand';
import es from './es.json';
import type {Locale} from './locale';
// The canonical English messages are stable translation keys; interpolation keeps dynamic data separate.
export const dictionaries={en:Object.fromEntries(Object.keys(es).map(key=>[key,key])),es};
export function translate(locale:Locale,key:string,params:Record<string,string|number>={}){
 params={productName:brand.name,...params};
 const messages:Record<string,string>=dictionaries[locale];const text=messages[key]??key;
 return text.replace(/\{(\w+)\}/g,(match,name)=>Object.hasOwn(params,name)?String(params[name]):match);
}
export function systemMessage(locale:Locale,message:string){
 if(locale==='en')return message;
 if(Object.hasOwn(es,message))return translate(locale,message);
 // Only for application-generated diagnostics, never for CVs, job content, or user notes.
 let translated=message;
 for(const key of Object.keys(es).filter(key=>key.includes('{'))){
  const names=[...key.matchAll(/\{(\w+)\}/g)].map(m=>m[1]);
  const parts=key.split(/\{\w+\}/g).map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const pattern=new RegExp(parts.join('(.+?)'),'g');
  translated=translated.replace(pattern,(...matches)=>translate(locale,key,Object.fromEntries(names.map((name,i)=>[name,String(matches[i+1])]))));
 }

 for(const key of Object.keys(es).filter(key=>key.length>25).sort((a,b)=>b.length-a.length))translated=translated.split(key).join(translate(locale,key));
 return translated;
}
