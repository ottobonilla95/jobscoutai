import { z } from 'zod';
import { localizedJson, requestLanguage } from '@/lib/language';
import { guard, currentAccount, limitedBody, withUserStore } from '@/lib/auth';
import { setupAnswersSchema, firstIncompleteStep } from '@core/setup-schema';
import { minimumSearchIntervalHours } from '@core/search-policy';
import { suggestProfile } from '@core/profile-suggestions';
import { beginGeneration, finishGeneration, AIBudgetError } from '@core/ai-usage';
import { getAccounts } from '@core/accounts';
import { integrations } from '@core/config';
export async function POST(request:Request) {
  const denied=await guard(request);if(denied)return denied;
  if(!integrations().ai)return localizedJson({error:'AI suggestions are unavailable. Enter roles yourself or choose standard matching.'},{status:503});
  try {
    const {answers,kind}=z.object({answers:setupAnswersSchema,kind:z.enum(['roles','matching'])}).parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,600000))));
    if(kind==='roles'&&answers.objective.trim().length<10)return localizedJson({error:'Enter a goal before generating roles.'},{status:400});
    if(answers.cvText.trim().length<100||(kind==='matching'&&firstIncompleteStep(answers,minimumSearchIntervalHours())!==null))return localizedJson({error:'Complete the required questions before generating suggestions.'},{status:400});
    const account=(await currentAccount())!;
    if(!await getAccounts().allow(`profile-suggestions:${account.id}`,12,86400000))return localizedJson({error:'Daily suggestion limit reached. Try tomorrow or choose standard matching.'},{status:429});
    const profile=await withUserStore(async store=>(await store.profile()).profile);
    const id=await beginGeneration(account.id,'strategy',profile.dailyEvaluationLimit);
    try {
      const result=await suggestProfile(answers,kind,(await requestLanguage()).locale);
      await finishGeneration(id,'completed',result.inputTokens,result.outputTokens);
      return localizedJson({...result,generationId:id});
    } catch(error) {await finishGeneration(id,'failed');throw error;}
  } catch(error) {return localizedJson({error:error instanceof AIBudgetError?error.message:'Could not generate suggestions. Your answers are safe; retry or use standard matching.'},{status:error instanceof AIBudgetError?429:400});}
}
