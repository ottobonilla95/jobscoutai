import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {register} from 'tsx/esm/api';
import {translate} from '../packages/core/src/i18n';

// Resolve the web app's aliases without changing the worker/test tsconfig.
const web=register({namespace:'account-settings-tests',tsconfig:fileURLToPath(new URL('../apps/web/tsconfig.json',import.meta.url))});
after(()=>web.unregister());
const {default:Settings}=await web.import('../apps/web/src/components/settings.tsx',import.meta.url);
const {I18nProvider}=await web.import('../apps/web/src/components/i18n.tsx',import.meta.url);

for(const locale of ['en','es'] as const){
 for(const onboardingCompleted of [false,true]){
  test(`${locale} settings include account details before browser requests (${onboardingCompleted?'workspace':'onboarding'})`,()=>{
   for(const [verified,emailAvailable] of [[false,false],[false,true],[true,true]]){
    const html=renderToStaticMarkup(createElement(I18nProvider,{initial:{locale,preference:locale}},
     createElement(Settings,{name:'Test',matchCount:0,onboardingCompleted,account:{email:'person@example.test',verified,emailAvailable}})));
    assert.match(html,/person@example\.test/);
    assert.ok(html.includes(translate(locale,verified?'Email verified':'Email not verified')));
    assert.ok(html.includes(translate(locale,'Delete account')));
    assert.ok(html.includes('href="/account-help"'));
    assert.equal(html.includes(translate(locale,'Could not load account status.')),false);
    const verificationButton=html.match(/<button\b[^>]*>[^<]*<\/button>/g)?.find(button=>button.includes(translate(locale,'Send verification email')));
    if(verified)assert.equal(verificationButton,undefined);
    else{
     assert.ok(verificationButton);
     assert.equal(verificationButton.includes('disabled'),!emailAvailable);
    }
    assert.equal(html.includes(translate(locale,'Email delivery needs to be connected by the platform owner.')),!emailAvailable);
   }
  });
 }
}
