import {translate} from './i18n';
import {randomUUID} from 'node:crypto';
import {sendEmail} from './notifications';
import type {Accounts,Account} from './accounts';
export async function sendAccountLink(accounts:Accounts,account:Account,purpose:'reset'|'verify',send=sendEmail){
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw new Error('Email delivery is not configured.');
 const language=(await accounts.language(account.id));const locale=language.preference==='auto'?language.locale:language.preference;const t=(key:string,params?:Record<string,string|number>)=>translate(locale,key,params);
 const token=(await accounts.issueToken(account,purpose));const url=new URL('/account-help',process.env.APP_URL||'http://localhost:3000');url.hash=new URLSearchParams({[purpose]:token}).toString();
 await send({from:process.env.EMAIL_FROM,to:[account.email],subject:t(purpose==='reset'?'Reset your {productName} password':'Verify your {productName} email'),text:t('{action} using this link:\n\n{url}\n\nThis link expires in {duration} and can be used once. If you did not request it, you can ignore this email.',{action:t(purpose==='reset'?'Choose a new password':'Verify your email address'),url:url.href,duration:t(purpose==='reset'?'30 minutes':'24 hours')})},randomUUID());
}
