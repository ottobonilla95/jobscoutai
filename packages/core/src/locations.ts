import {z} from 'zod';
import type {Locale} from './i18n/locale';

// ISO 3166-1 countries and territories. Names come from the runtime's CLDR data.
export const countryCodes = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const countries = new Set(countryCodes);
export const searchLocationSchema = z.object({
  kind:z.enum(['country','city']), countryCode:z.string().refine(code=>countries.has(code),'Choose a recognized country.'),
  city:z.string().trim().max(80).default(''), region:z.string().trim().max(80).default(''),
}).refine(place=>place.kind==='country' ? !place.city && !place.region : Boolean(place.city),'Choose a country or a named city.');
export type SearchLocation = z.infer<typeof searchLocationSchema>;
// Discovery checks at most eight titles per location; keep saved searches bounded.
export const maxSearchLocations=10;
export const maxLocationTextLength=maxSearchLocations*241;
export function countryName(code:string,locale:Locale='en') {return new Intl.DisplayNames([locale],{type:'region'}).of(code)||code;}
export function locationQuery(place:SearchLocation) {
  return place.kind==='country'?countryName(place.countryCode):[place.city,place.region,countryName(place.countryCode)].filter(Boolean).join(', ');
}
export function locationLabel(place:SearchLocation,locale:Locale) {
  return place.kind==='country'?countryName(place.countryCode,locale):[place.city,place.region,countryName(place.countryCode,locale)].filter(Boolean).join(', ');
}
export function locationKey(place:SearchLocation) {return [place.kind,place.countryCode,normalize(place.city),normalize(place.region)].join(':');}
export function addLocation(selected:SearchLocation[],place:SearchLocation) {
  if(selected.some(p=>locationKey(p)===locationKey(place)))return selected;
  // Choosing a city narrows an existing whole-country search. Choosing a country
  // broadens its cities. Keep both operations possible even at the selection cap.
  const next=selected.filter(p=>p.countryCode!==place.countryCode || (place.kind==='city'&&p.kind==='city'));
  return next.length>=maxSearchLocations?selected:[...next,place];
}
export function normalize(value:string){return value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();}
export function countrySuggestions(query:string,locale:Locale):SearchLocation[] {
  const term=normalize(query);if(!term)return [];
  return countryCodes.filter(code=>[code,countryName(code,locale),countryName(code,'en')].some(name=>normalize(name).includes(term)))
    .sort((a,b)=>countryName(a,locale).localeCompare(countryName(b,locale),locale)).slice(0,6)
    .map(countryCode=>({kind:'country',countryCode,city:'',region:''}));
}
const photonSchema=z.object({features:z.array(z.object({properties:z.object({
  name:z.string().max(80),countrycode:z.string(),state:z.string().max(80).optional(),type:z.string().optional(),
  osm_key:z.string().optional(),osm_value:z.string().optional(),
})})).max(30)});
export function parseCitySuggestions(raw:unknown,countryCode?:string):SearchLocation[] {
  const result:SearchLocation[]=[];
  for(const {properties:p} of photonSchema.parse(raw).features){
    if(p.type!=='city' && !(p.osm_key==='place' && ['city','town','village'].includes(p.osm_value||'')))continue;
    const place=searchLocationSchema.safeParse({kind:'city',countryCode:p.countrycode.toUpperCase(),city:p.name,region:p.state&&(normalize(p.state)===normalize(p.name)||normalize(p.state).startsWith(normalize(p.name)+','))?'':p.state||''});
    if(place.success&&(!countryCode||place.data.countryCode===countryCode)&&!result.some(other=>locationKey(other)===locationKey(place.data)))result.push(place.data);
  }
  return result.slice(0,6);
}
