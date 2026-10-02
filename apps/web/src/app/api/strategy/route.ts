import {localizedJson} from '@/lib/language';
import {requestLanguage} from '@/lib/language';
import { z } from 'zod';
import { guard, limitedBody, currentAccount, withUserStore } from '@/lib/auth';
import { getAccounts } from '@core/accounts';
import {beginGeneration,finishGeneration,AIBudgetError} from '@core/ai-usage';
import { importStrategy } from '@core/import-strategy';
import { integrations } from '@core/config';
export async function POST(request:Request){
 const denied=await guard(request);if(denied)return denied;
 if(!integrations().ai)return localizedJson({error:'Connect AI matching before importing. You can edit the settings manually.'},{status:503});
 const account=(await currentAccount())!;
 if(!(await getAccounts().allow(`strategy:${account.id}`,5,86400000)))return localizedJson({error:'Daily strategy import limit reached. Try again tomorrow.'},{status:429});
 try{const {text}=z.object({text:z.string().min(100).max(40000)}).parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,170000))));
 const profile=await withUserStore(async store=>(await store.profile()).profile);profile.outputLanguage=(await requestLanguage()).locale;const id=(await beginGeneration(account.id,'strategy',profile.dailyEvaluationLimit));
 try{const result=await importStrategy(text,profile);(await finishGeneration(id,'completed',result.inputTokens,result.outputTokens));return localizedJson({...result,generationId:id});}catch(error){(await finishGeneration(id,'failed'));throw error;}
 }catch(error){if(error instanceof AIBudgetError)return localizedJson({error:error.message},{status:429});return localizedJson({error:'Could not prepare this strategy. Check the text and model connection, then try again.'},{status:400});}
}
