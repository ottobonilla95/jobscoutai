import {guard, currentAccount, limitedBody, withUserStore} from '@/lib/auth';
import {localizedJson, requestLanguage} from '@/lib/language';
import {getAccounts} from '@core/accounts';
import {integrations} from '@core/config';
import {minimumSearchIntervalHours} from '@core/search-policy';
import {chatRequestSchema} from '@core/search-chat-schema';
import {applyChatTurn, attachChatCV, ChatConflict, commitSearchChat, generateChatTurn, loadSearchChat, saveSearchChat} from '@core/search-chat';
import {beginGeneration, finishGeneration, AIBudgetError} from '@core/ai-usage';
import {suggestProfile} from '@core/profile-suggestions';

export const runtime='nodejs';
export const maxDuration=240;
export async function GET(){
  const denied=await guard();if(denied)return denied;
  const {locale}=await requestLanguage();
  return withUserStore(async store=>{
    const chat=await loadSearchChat(store,minimumSearchIntervalHours(),locale);
    const {profile}=await store.profile();
    return localizedJson({chat,verificationNeeded:profile.emailAlertsRequested&&!profile.emailEnabled});
  });
}
export async function POST(request:Request){
  const denied=await guard(request);if(denied)return denied;
  try{
    const input=chatRequestSchema.parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,150000))));
    const account=(await currentAccount())!;const {locale}=await requestLanguage();const minimum=minimumSearchIntervalHours();
    return await withUserStore(async store=>{
      if(input.action==='commit')return localizedJson(await commitSearchChat(store,input.revision,minimum,account.email,await getAccounts().verified(account.id),locale));
      const chat=await loadSearchChat(store,minimum,locale);
      if(chat.revision!==input.revision)throw new ChatConflict();
      if(input.action==='upload')return localizedJson({chat:await saveSearchChat(store,attachChatCV(chat,input.text,input.name,locale),input.revision)});
      if(!integrations().ai)return localizedJson({error:'Chat is unavailable until AI matching is connected. Your conversation is saved. Please try again later.'},{status:503});
      if(!await getAccounts().allow(`search-chat:${account.id}`,60,3600000))return localizedJson({error:'Please wait a little before sending more messages.'},{status:429});
      const {profile}=await store.profile();
      async function generated<T extends {inputTokens:number;outputTokens:number}>(run:()=>Promise<T>):Promise<T>{
        const id=await beginGeneration(account.id,'strategy',profile.dailyEvaluationLimit);
        try{const result=await run();await finishGeneration(id,'completed',result.inputTokens,result.outputTokens);return result;}
        catch(error){await finishGeneration(id,'failed');throw error;}
      }
      const {turn}=await generated(()=>generateChatTurn(chat,input.text,minimum,locale,profile));
      let next=applyChatTurn(chat,turn,input.text,minimum,locale);
      if(next.ready&&!next.draft.matching){
        const result=await generated(()=>suggestProfile(next.draft.answers,'matching',locale));
        if(!('matching' in result))throw new Error('Could not prepare matching preferences.');
        next={...next,draft:{...next.draft,matching:result.matching}};
      }
      return localizedJson({chat:await saveSearchChat(store,next,input.revision)});
    });
  }catch(error){
    if(error instanceof ChatConflict)return localizedJson({error:error.message},{status:409});
    if(error instanceof AIBudgetError)return localizedJson({error:error.message},{status:429});
    console.error('[api/chat]',error instanceof Error?{name:error.name,message:error.message}:{name:'UnknownError'});
    return localizedJson({error:'Could not update your conversation. Your saved preferences are safe. Please try again.'},{status:400});
  }
}
