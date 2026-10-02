import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToBuffer} from '@react-pdf/renderer';
import {PDFParse} from 'pdf-parse';
import {fileURLToPath} from 'node:url';
import {emptyCv,emptyCvEntry} from '../packages/core/src/cv';
import CvDocument,{registerCvFonts} from '../apps/web/src/lib/cv-document';

test('both CV templates export selectable Unicode text and paginate long experience without losing entries',async()=>{
  registerCvFonts(fileURLToPath(new URL('../apps/web/public/fonts',import.meta.url)));
  const cv=emptyCv('Ana Martínez — Ingeniería','es');
  cv.content.headline='Software & product engineer';
  cv.content.summary='Experiencia en diseño, colaboración y dirección técnica.';
  cv.content.website='https://example.com';cv.content.email='ana@example.test';
  cv.content.skills=['TypeScript','Arquitectura','Diseño'];
  cv.content.experience=Array.from({length:18},(_,i)=>({...emptyCvEntry(),title:`RoleMarker${i}`,organization:'Example Company',dates:'2020–2026',location:'Madrid',details:Array(4).fill('Built and maintained production applications with reliable delivery and clear ownership across teams.').join('\n')}));
  for(const template of ['accent','minimal'] as const){
    const buffer=await renderToBuffer(CvDocument({cv:{...cv,template}}));
    assert.equal(buffer.subarray(0,4).toString(),'%PDF');
    const parser=new PDFParse({data:buffer});
    try{
      const result=await parser.getText();
      assert.ok(result.total>1,`${template}: expected pagination`);
      assert.match(result.text,/Ana Martínez/);assert.match(result.text,/Experiencia profesional/);
      assert.match(result.text,/ana@example.test/);assert.match(result.text,/Arquitectura/);
      for(let i=0;i<18;i++)assert.equal((result.text.match(new RegExp(`RoleMarker${i}\\b`,'g'))??[]).length,1,`${template}: missing or duplicated role ${i}`);
      assert.match(result.text,/Página 1/);
    }finally{await parser.destroy();}
  }
});
