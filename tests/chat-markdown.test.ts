import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import ChatMessageBody from '../apps/web/src/components/chat-message-body';

function render(text:string,role:'assistant'|'user'='assistant'){
  return load(renderToStaticMarkup(ChatMessageBody({role,text})));
}

test('assistant replies render emphasis and the Spanish numbered questions from the chat',()=>{
  const $=render('Puedes buscar **Founding Engineer**, **Senior Product Engineer** y *Technical Lead*.\n\nPara empezar a buscar bien, dime dos cosas:\n1. ¿En qué países o ciudades quieres buscar?\n2. ¿Te interesa remoto, híbrido o te da igual?');
  assert.deepEqual($('strong').map((_,el)=>$(el).text()).get(),['Founding Engineer','Senior Product Engineer']);
  assert.equal($('em').text(),'Technical Lead');
  assert.equal($('.chat-markdown > p').length,2);
  assert.equal($('ol > li').length,2);
  assert.match($('ol > li').first().text(),/¿En qué países/);
  assert.doesNotMatch($.text(),/\*\*/);
});

test('assistant Markdown supports links, nested lists, code and GFM tables',()=>{
  const $=render('## Opciones\n\n- [Empresa](https://example.com/jobs)\n  - Usan `TypeScript`\n\n```js\nconst role = "engineer";\n```\n\n| Rol | Modalidad |\n| --- | --- |\n| Engineer | Remoto |');
  assert.equal($('h2').text(),'Opciones');
  assert.equal($('ul ul li').text(),'Usan TypeScript');
  assert.equal($('a').attr('href'),'https://example.com/jobs');
  assert.equal($('a').attr('rel'),'noopener noreferrer');
  assert.equal($('pre > code.language-js').text(),'const role = "engineer";\n');
  assert.equal($('table tbody td').last().text(),'Remoto');
});

test('assistant content cannot inject HTML, executable links or remote images',()=>{
  const $=render('<script>alert(1)</script>\n\n<img src="https://example.com/track" onerror="alert(1)">\n\n[Unsafe](javascript:alert%281%29)\n\n![Tracker](https://example.com/track)\n\n**Safe text**');
  assert.equal($('script,img,[onerror]').length,0);
  assert.equal($('a[href^="javascript:"]').length,0);
  assert.equal($('strong').text(),'Safe text');
});

test('user messages keep literal text and line breaks before and after sending',()=>{
  const text='**Keep this literal**\n1. My notes\n<script>alert(1)</script>';
  const $=render(text,'user');
  assert.equal($('p').text(),text);
  assert.equal($('strong,ol,script,.chat-markdown').length,0);
});
