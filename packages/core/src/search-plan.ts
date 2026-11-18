import {z} from 'zod';
import {countryCodes,countryName,locationQuery,searchLocationSchema} from './locations';

// Search regions are geography, never a statement about work authorization.
export const europeCountries=['AL','AD','AM','AT','AZ','BY','BE','BA','BG','HR','CY','CZ','DK','EE','FI','FR','GE','DE','GR','HU','IS','IE','IT','XK','LV','LI','LT','LU','MT','MD','MC','ME','NL','MK','NO','PL','PT','RO','RU','SM','RS','SK','SI','ES','SE','CH','TR','UA','GB','VA'].filter(code=>countryCodes.includes(code));
const countryCode=z.string().refine(code=>countryCodes.includes(code),'Choose a recognized country.');
export const searchTrackSchema=z.object({
  area:z.enum(['locations','europe','worldwide']),
  locations:z.array(searchLocationSchema).max(10),
  workMode:z.enum(['any','remote','office']),
  workFromCountries:z.array(countryCode).max(40),
}).superRefine((track,ctx)=>{
  if(track.area==='locations'&&!track.locations.length)ctx.addIssue({code:'custom',message:'Choose a country or city for this search track.'});
  if(track.area==='worldwide'&&track.workMode!=='remote')ctx.addIssue({code:'custom',message:'Worldwide searches must be remote.'});
  if(track.workMode!=='remote'&&track.workFromCountries.length)ctx.addIssue({code:'custom',message:'Work-from countries apply to remote tracks only.'});
  if(track.area!=='locations'&&track.locations.length)ctx.addIssue({code:'custom',message:'Regional tracks do not need individual search locations.'});
});
export const searchTracksSchema=z.array(searchTrackSchema).max(8);
export type SearchTrack=z.infer<typeof searchTrackSchema>;
export type SearchTarget={location:string;workMode:SearchTrack['workMode'];track:number};
type SearchScope={searchTracks?:SearchTrack[];preferredLocations?:{kind:'country'|'city';countryCode:string;city:string;region:string}[];locations:readonly string[];remoteOnly:boolean};
export function trackLocations(track:SearchTrack):string[]{
  return track.area==='europe'?europeCountries.map(code=>countryName(code)):track.area==='worldwide'?(track.workFromCountries.length?track.workFromCountries.map(code=>countryName(code)):['Worldwide']):track.locations.map(locationQuery);
}
export function searchTargets(profile:SearchScope):SearchTarget[]{
  if(!profile.searchTracks?.length)return profile.locations.map(location=>({location,workMode:profile.remoteOnly?'remote':'any',track:0}));
  const tracks=profile.searchTracks.map((track,index)=>{
    const locations=trackLocations(track);
    const preferred=(profile.preferredLocations||[]).filter(place=>track.area==='europe'?europeCountries.includes(place.countryCode):track.area==='worldwide'?track.workFromCountries.includes(place.countryCode):track.locations.some(p=>p.countryCode===place.countryCode&&(p.kind==='country'||locationQuery(p)===locationQuery(place)))).map(locationQuery);
    return [...new Set([...preferred,...locations])].map(location=>({location,workMode:track.workMode,track:index}));
  });
  // Interleave tracks so a continent cannot consume the entire first round.
  const result:SearchTarget[]=[];const seen=new Set<string>();
  for(let i=0;i<Math.max(...tracks.map(t=>t.length));i++)for(const track of tracks){
    const target=track[i];if(!target)continue;
    const key=JSON.stringify([target.location,target.workMode]);if(seen.has(key))continue;
    seen.add(key);result.push(target);
  }
  return result;
}
export function remoteSearchOnly(profile:SearchScope){return profile.searchTracks?.length?profile.searchTracks.every(track=>track.workMode==='remote'):profile.remoteOnly;}
export function trackSummary(track:SearchTrack,locale:'en'|'es'='en'){
  const area=track.area==='europe'?(locale==='es'?'Toda Europa':'All Europe'):track.area==='worldwide'?(locale==='es'?'Todo el mundo':'Worldwide'):track.locations.map(place=>place.kind==='country'?countryName(place.countryCode,locale):locationQuery(place)).join(', ');
  const mode=locale==='es'?{any:'Cualquier modalidad',remote:'Remoto',office:'Presencial o híbrido'}:{any:'Any work mode',remote:'Remote',office:'Office or hybrid'};
  const from=track.workFromCountries.length?` · ${locale==='es'?'trabajando desde':'working from'} ${track.workFromCountries.map(code=>countryName(code,locale)).join(', ')}`:'';
  return `${area} · ${mode[track.workMode]}${from}`;
}
