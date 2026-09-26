import {accountsFixture,storeFixture} from './database-fixture';
import {brand} from '../packages/core/src/brand';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {browserLocale,resolveLocale,formatDate,formatNumber,aiLanguageInstruction} from '../packages/core/src/i18n/locale';
import {translate,systemMessage,dictionaries} from '../packages/core/src/i18n';
import {Accounts} from '../packages/core/src/accounts';
import {sendAccountLink} from '../packages/core/src/account-email';
import {notifyMatches,type EmailPayload} from '../packages/core/src/notifications';
import {defaultProfile,profileSchema} from '../packages/core/src/profile';
const require=createRequire(import.meta.url);const parser=require('next/dist/compiled/babel/parser');
async function fixture(t:test.TestContext){return accountsFixture(t);}
function emailConfig(t:test.TestContext){for(const [key,value]of Object.entries({RESEND_API_KEY:'fixture',EMAIL_FROM:`${brand.slug}@example.test`})){const old=process.env[key];process.env[key]=value;t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});}}
test('browser detection honors region tags, preference weights, exclusions and fallback',()=>{
 assert.equal(browserLocale('es-MX,es;q=0.9,en;q=0.8'),'es');assert.equal(browserLocale('en-GB,es;q=0.5'),'en');assert.equal(browserLocale('en;q=0.5,es-AR;q=0.9'),'es');assert.equal(browserLocale('es;q=0,en;q=0.9'),'en');assert.equal(browserLocale('fr-FR,es;q=0.8'),'es');assert.equal(browserLocale('fr-FR,de;q=0.8'),'en');assert.equal(browserLocale(null),'en');assert.equal(browserLocale('es;q=broken'),'en');
 assert.equal(resolveLocale('en','es-ES'),'en');assert.equal(resolveLocale('es','en-US'),'es');assert.equal(resolveLocale('auto','es-CO'),'es');
});
test('catalog has complete messages and matching interpolation parameters',()=>{
 for(const [key,value]of Object.entries(dictionaries.es)){assert.ok(value.trim(),key);assert.ok(Object.hasOwn(dictionaries.en,key));const parameters=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();assert.deepEqual(parameters(key),parameters(value),key);}
 assert.equal(translate('es','Show more opportunities ({count} remaining)',{count:7}),'Mostrar más oportunidades (quedan 7)');assert.equal(translate('es','Unmapped external content'),'Unmapped external content');
});
test('view translation calls reference real keys and visible copy is translated',()=>{
 const allowed=new Set(['Wellfound ↗','Indeed ↗','English','Español']);
 for(const file of readdirSync('apps/web/src/components').filter(f=>f.endsWith('.tsx'))){
  const ast=parser.parse(readFileSync(join('apps/web/src/components',file),'utf8'),{sourceType:'module',plugins:['typescript','jsx']});
  function walk(node:any,parent?:any){if(!node||typeof node!=='object')return;
   if(node.type==='JSXText'&&/[A-Za-z]/.test(node.value.trim()))assert.ok(allowed.has(node.value.trim()),`${file}: untranslated ${node.value}`);
   if(node.type==='StringLiteral'&&parent?.type==='CallExpression'&&parent.callee?.name==='t')assert.ok(Object.hasOwn(dictionaries.es,node.value),`${file}: missing ${node.value}`);
   for(const [key,value]of Object.entries(node)){if(['loc','extra'].includes(key))continue;if(Array.isArray(value))value.forEach(child=>walk(child,node));else if(value&&typeof value==='object')walk(value,node);}
  }walk(ast);
 }
});
test('dates, numbers and application diagnostics use the selected language',()=>{
 assert.equal(formatNumber(12345.6,'es'),'12.345,6');assert.equal(formatNumber(12345.6,'en'),'12,345.6');assert.notEqual(formatDate('2026-09-24','es',false),formatDate('2026-09-24','en',false));
 assert.match(systemMessage('es','LinkedIn access limited (HTTP 429). Search stopped; try again later.'),/Acceso a LinkedIn limitado \(HTTP 429\)/);
 assert.match(systemMessage('es','Job sources could not be reached. Check connectivity and run again later. AI evaluation failed. Check model access, API balance, and credentials. The job is saved for retry.'),/No se pudo acceder/);
});
test('account preferences persist across connections without changing another user or original content',async t=>{
 const accounts=(await fixture(t));const a=await accounts.signup({email:'es@example.test',password:'A private test phrase 2026'});const b=await accounts.signup({email:'en@example.test',password:'A private test phrase 2026'});
 const store=(await accounts.store(a.id));const original={...(await store.profile()).profile,cvText:'Original English CV',objective:'Original personal career goal'};(await store.saveProfile(original));const version=(await store.profile()).version;(await accounts.setLanguage(a.id,'es','es'));
 const second=new Accounts(accounts.db);assert.deepEqual((await second.language(a.id)),{preference:'es',locale:'es'});assert.deepEqual((await second.language(b.id)),{preference:'auto',locale:'en'});
 const saved=(await second.store(a.id));assert.equal((await saved.profile()).profile.cvText,original.cvText);assert.equal((await saved.profile()).profile.objective,original.objective);assert.equal((await saved.profile()).profile.outputLanguage,'es');assert.equal((await saved.profile()).version,version+1);
 (await accounts.setLanguage(a.id,'auto','en'));assert.equal((await accounts.language(a.id)).locale,'en');
 const {outputLanguage,...legacy}=defaultProfile;assert.equal(profileSchema.parse(legacy).outputLanguage,'en');
});
test('account and job email templates localize copy while preserving titles and evidence',async t=>{
 emailConfig(t);const accounts=(await fixture(t));const user=await accounts.signup({email:'mail-es@example.test',password:'A private test phrase 2026'});(await accounts.setLanguage(user.id,'es','es'));const sent:EmailPayload[]=[];
 await sendAccountLink(accounts,user,'reset',async payload=>{sent.push(payload);});assert.equal(sent[0].subject,`Restablece tu contraseña de ${brand.name}`);assert.match(sent[0].text,/30 minutos/);assert.match(sent[0].text,/#reset=/);
 const store=(await accounts.store(user.id));(await store.upsert({id:'es-mail',title:'Original English Job Title',company:'Original Company',location:'Berlin',url:'https://example.com/job',postedAt:null}));(await store.assess('es-mail',{language:'es',score:90,eligibility:'eligible',summary:'Buen encaje con tu experiencia.',reasons:[],concerns:[],salaryEvidence:null,equityEvidence:'1% equity',founderPathEvidence:null},1));
 await notifyMatches(store,{...defaultProfile,outputLanguage:'es',email:user.email,emailEnabled:true},1,async payload=>{sent.push(payload);});assert.equal(sent[1].subject,'1 nueva oportunidad para ti');assert.match(sent[1].text,/Original English Job Title/);assert.match(sent[1].text,/Participación accionaria: 1% equity/);assert.match(sent[1].text,/Recomendación:/);
});
test('AI language instructions preserve source excerpts and user data',()=>{const instructions=aiLanguageInstruction('es');assert.match(instructions,/neutral Spanish/);assert.match(instructions,/Never translate evidence excerpts/);assert.match(aiLanguageInstruction('en'),/in English/);});
