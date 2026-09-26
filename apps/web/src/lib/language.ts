import {brand} from '@core/brand';
import {cookies,headers} from 'next/headers';
import {cache} from 'react';
import {currentAccount} from './auth';
import {getAccounts} from '@core/accounts';
import {languagePreference,resolveLocale} from '@core/i18n/locale';
import {translate,systemMessage} from '@core/i18n';
export const requestLanguage=cache(async()=>{
 const account=await currentAccount();const jar=await cookies();const preference=account?getAccounts().language(account.id).preference:languagePreference(jar.get(brand.compatibility.languageCookie)?.value);
 return {preference,locale:resolveLocale(preference,(await headers()).get('accept-language'))};
});
export async function localizedJson(data:Record<string,unknown>,init?:ResponseInit){
 const {locale}=await requestLanguage();const output={...data};for(const key of ['error','message'])if(typeof output[key]==='string')output[key]=systemMessage(locale,output[key]);
 return Response.json(output,init);
}
