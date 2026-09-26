export type Locale='en'|'es';
export type LanguagePreference=Locale|'auto';
export function languagePreference(value:unknown):LanguagePreference{return value==='en'||value==='es'?value:'auto';}
export function browserLocale(header:string|null):Locale{
 const languages=(header||'').split(',').map((entry,index)=>{const [tag,...parameters]=entry.trim().toLowerCase().split(';');const q=parameters.find(p=>p.trim().startsWith('q='));const quality=q?Number(q.trim().slice(2)):1;return {tag,quality,index};}).filter(x=>Number.isFinite(x.quality)&&x.quality>0&&x.quality<=1).sort((a,b)=>b.quality-a.quality||a.index-b.index);
 // Prefer the highest-ranked supported language, falling back to English.
 for(const {tag} of languages){if(/^es(?:-|$)/.test(tag))return 'es';if(/^en(?:-|$)/.test(tag))return 'en';}return 'en';
}
export function resolveLocale(preference:LanguagePreference,header:string|null):Locale{return preference==='auto'?browserLocale(header):preference;}
export function formatNumber(value:number,locale:Locale){return new Intl.NumberFormat(locale==='es'?'es-ES':'en-GB').format(value);}
export function formatDate(value:string|null,locale:Locale,withTime=true){if(!value||!Number.isFinite(Date.parse(value)))return '';return new Intl.DateTimeFormat(locale==='es'?'es-ES':'en-GB',{timeZone:'UTC',year:'numeric',month:'short',day:'numeric',...(withTime?{hour:'2-digit' as const,minute:'2-digit' as const}:{})}).format(new Date(value))+(withTime?' UTC':'');}
export function aiLanguageInstruction(locale:Locale){return `Write summaries, explanations, reasons, concerns, and import warnings in ${locale==='es'?'neutral Spanish':'English'}. Keep original job titles, names, identifiers, CV text, personal notes, and all quoted evidence in their original language. Never translate evidence excerpts. Preserve the user's search keywords and existing profile text.`;}
