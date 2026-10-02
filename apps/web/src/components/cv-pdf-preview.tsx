'use client';
import {useEffect,useRef,useState} from 'react';
import {pdf} from '@react-pdf/renderer';
import CvDocument,{registerCvFonts} from '@/lib/cv-document';
import {cvContentSchema,type CvDraft} from '@core/cv';
import {useI18n} from './i18n';
registerCvFonts();
// React PDF's renderer shares internal state; serialize renders during fast edits.
let renderQueue:Promise<unknown>=Promise.resolve();
export default function CvPdfPreview({draft}:{draft:CvDraft}){
  const {t}=useI18n();
  const [result,setResult]=useState<{url:string;source:string}|null>(null);
  const [error,setError]=useState('');
  const activeUrl=useRef<string|null>(null);
  const source=JSON.stringify(draft);
  const errorMessage=t('Could not generate the PDF. Try shortening long entries and edit a field to retry.');
  useEffect(()=>{
    let cancelled=false;
    const timer=setTimeout(()=>{
      setError('');
      renderQueue=renderQueue.catch(()=>{}).then(async()=>{
        if(cancelled)return;
        const cv=JSON.parse(source) as CvDraft;
        if(!cvContentSchema.safeParse(cv.content).success||JSON.stringify(cv.content).length>60000)throw new Error('CV field limits exceeded.');
        const blob=await pdf(<CvDocument cv={cv}/>).toBlob();
        if(cancelled)return;
        const url=URL.createObjectURL(blob);
        if(activeUrl.current)URL.revokeObjectURL(activeUrl.current);
        activeUrl.current=url;
        setResult({url,source});
      }).catch(()=>{if(!cancelled)setError(errorMessage);});
    },800);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[source,errorMessage]);
  useEffect(()=>()=>{if(activeUrl.current)URL.revokeObjectURL(activeUrl.current);},[]);
  const current=result?.source===source;
  return <section className="cv-preview" aria-label={t('CV preview')}>
    <div className="cv-preview-heading"><div><h2>{t('Live preview')}</h2><p className="muted">{t('A4 · Preview and download share the same layout.')}</p></div>
      {current&&result?<a className="button" href={result.url} download={`${draft.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_')||'CV'}.pdf`}>{t('Download PDF')}</a>:<button className="button" disabled>{t('Preparing PDF…')}</button>}
    </div>
    {error&&<p role="alert" className="error-text">{error}</p>}
    <div className="cv-preview-status" role="status">{error?t('PDF unavailable'):current?t('Preview is up to date'):t('Updating preview…')}</div>
    {result?<><iframe title={t('CV preview')} src={result.url}/><a className="text-button" href={result.url} target="_blank" rel="noopener noreferrer">{t('Open preview in a new tab')}</a></>:<div className="cv-preview-empty">{t('Your CV preview will appear here.')}</div>}
  </section>;
}
