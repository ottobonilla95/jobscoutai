import {countryCodes,countryName,normalize} from '@core/locations';

const codes=new Set(countryCodes);
const names=new Map<string,string>();
for(const code of countryCodes){
  for(const locale of ['en','es'] as const)names.set(normalize(countryName(code,locale)),code);
}
for(const [name,code] of Object.entries({uk:'GB',usa:'US','u.s.':'US','u.s.a.':'US','u.k.':'GB','great britain':'GB',england:'GB',scotland:'GB',wales:'GB','northern ireland':'GB','united states of america':'US'}))names.set(name,code);

/** Use explicit countries only; a city name alone cannot reliably identify one. */
export function jobLocationCountries(location:string):string[]{
  const result=new Set<string>();
  for(const part of location.split(/\s*(?:\/|;|\||·)\s*/)){
    const fields=part.split(/,|[()]|\s+-\s+/).map(value=>value.trim()).filter(value=>value&&!/^(remote|hybrid|on[ -]?site)$/i.test(value));
    for(const [index,field] of fields.entries()){
      // Only the final field can be an ISO code: CA and NC can also be US states.
      const code=names.get(normalize(field))||(index===fields.length-1&&codes.has(field.toUpperCase())?field.toUpperCase():undefined);
      if(code)result.add(code);
    }
  }
  return [...result];
}

export function countryFlag(code:string):string{
  return String.fromCodePoint(...[...code].map(letter=>0x1f1e6+letter.charCodeAt(0)-65));
}
