import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {Select} from '../apps/web/src/components/ui/select';

const options=[{value:'',label:'New CV'},{value:4,label:'Every 4 hours'},{value:'saved',label:'Saved CV'}];

test('select renders the current label before hydration, including empty and numeric values',()=>{
  for(const option of options){
    const $=load(renderToStaticMarkup(createElement(Select,{value:option.value,options,onValueChange:()=>{}})));
    assert.equal($('[role=combobox]').text(),option.label);
    assert.equal($('[role=combobox]').attr('type'),'button');
  }
});

test('select preserves accessible labels, validation, focus target and disabled state',()=>{
  const $=load(renderToStaticMarkup(createElement(Select,{value:4,options,onValueChange:()=>{},id:'frequency','aria-label':'Search frequency','aria-describedby':'frequency-hint','aria-invalid':true,disabled:true})));
  const trigger=$('#frequency');
  assert.equal(trigger.attr('role'),'combobox');
  assert.equal(trigger.attr('aria-label'),'Search frequency');
  assert.equal(trigger.attr('aria-describedby'),'frequency-hint');
  assert.equal(trigger.attr('aria-invalid'),'true');
  assert.ok(trigger.is('[disabled]'));
});
