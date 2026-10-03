import {guard,currentAccount} from '@/lib/auth';
import {localizedJson} from '@/lib/language';
import {getAccounts} from '@core/accounts';
import {parseCitySuggestions} from '@core/locations';

export async function GET(request:Request){
 const denied=await guard();if(denied)return denied;
 const query=(new URL(request.url).searchParams.get('q')||'').trim();
 if(query.length<3||query.length>80)return Response.json({cities:[]});
 const account=(await currentAccount())!;
 if(!await getAccounts().allow(`locations:${account.id}`,120,3600000))return localizedJson({error:'City search is unavailable. Choose a country or try again later.'},{status:429});
 try{
  // Only the location query is sent to Photon; no CV or profile content.
  const url=new URL('https://photon.komoot.io/api/');url.search=new URLSearchParams({q:query,layer:'city',limit:'6',lang:'en'}).toString();
  const response=await fetch(url,{signal:AbortSignal.timeout(6000),next:{revalidate:3600}});
  if(!response.ok)throw new Error('City lookup failed.');
  return Response.json({cities:parseCitySuggestions(await response.json())});
 }catch{return localizedJson({error:'City search is unavailable. Choose a country or try again later.'},{status:503});}
}
