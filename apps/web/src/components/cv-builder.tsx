'use client';
import {useEffect,useState} from 'react';
import dynamic from 'next/dynamic';
import {ArrowDown,ArrowUp,Copy,FilePlus2,Save,Trash2} from 'lucide-react';
import {cvDraftSchema,cvSectionKeys,emptyCv,emptyCvEntry,type CvDraft,type CvEntry,type CvSectionKey,type SavedCv} from '@core/cv';
import WorkspaceSidebar from './workspace-sidebar';
import {useI18n} from './i18n';
const PdfPreview=dynamic(()=>import('./cv-pdf-preview'),{ssr:false});
const sectionNames:Record<CvSectionKey,string>={experience:'Work experience',projects:'Projects',education:'Education',courses:'Courses & professional development',achievements:'Achievements'};
function draftOf(cv:SavedCv):CvDraft {return {title:cv.title,template:cv.template,language:cv.language,content:cv.content};}

export default function CvBuilder({name,matchCount,initialCvs,sourceText}:{name:string;matchCount:number;initialCvs:SavedCv[];sourceText:string}) {
  const {t,locale,date}=useI18n();
  const [cvs,setCvs]=useState(initialCvs);
  const [selected,setSelected]=useState<SavedCv|null>(initialCvs[0]??null);
  const [draft,setDraft]=useState<CvDraft>(()=>initialCvs[0]?draftOf(initialCvs[0]):emptyCv(name,locale));
  const [baseline,setBaseline]=useState(()=>JSON.stringify(initialCvs[0]?draftOf(initialCvs[0]):emptyCv(name,locale)));
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const [reference,setReference]=useState(sourceText),[importing,setImporting]=useState(false);
  const dirty=JSON.stringify(draft)!==baseline;
  useEffect(()=>{
    if(!dirty)return;
    const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();};
    const navigate=(event:MouseEvent)=>{
      const anchor=(event.target as Element).closest?.('a');
      if(anchor&&['http:','https:'].includes(anchor.protocol)&&anchor.origin===location.origin&&anchor.pathname!==location.pathname&&anchor.target!=='_blank'&&!anchor.hasAttribute('download')&&!window.confirm(t('Discard unsaved CV changes?')))event.preventDefault();
    };
    window.addEventListener('beforeunload',unload);document.addEventListener('click',navigate);
    return ()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',navigate);};
  },[dirty,locale]);
  function update<K extends keyof CvDraft>(key:K,value:CvDraft[K]){setDraft(previous=>({...previous,[key]:value}));setMessage('');}
  function content<K extends keyof CvDraft['content']>(key:K,value:CvDraft['content'][K]){setDraft(previous=>({...previous,content:{...previous.content,[key]:value}}));setMessage('');}
  function activate(cv:SavedCv|null) {
    const value=cv?draftOf(cv):emptyCv(name,locale);
    setSelected(cv);setDraft(value);setBaseline(JSON.stringify(value));setMessage('');setError('');
  }
  function switchCv(cv:SavedCv|null){if(!dirty||window.confirm(t('Discard unsaved CV changes?')))activate(cv);}
  async function request(method:string,body:unknown){
    const response=await fetch('/api/cvs',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(response.status===401){window.location.assign('/login');throw new Error(t('Please sign in.'));}
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||t('Could not save your CV. Check the fields and try again.'));
    return result;
  }
  async function save():Promise<SavedCv>{
    const parsed=cvDraftSchema.safeParse(draft);
    if(!parsed.success)throw new Error(t('Check the CV title and field limits before saving.'));
    const result=selected?await request('PATCH',{action:'save',id:selected.id,revision:selected.revision,draft:parsed.data}):await request('POST',parsed.data);
    const cv:SavedCv=result.cv;
    setCvs(previous=>[cv,...previous.filter(item=>item.id!==cv.id)]);activate(cv);return cv;
  }
  async function run(action:()=>Promise<void>){
    setBusy(true);setError('');setMessage('');
    try{await action();}catch(e){setError(e instanceof Error?e.message:t('Please try again.'));}finally{setBusy(false);}
  }
  return <div className="app-shell">
    <WorkspaceSidebar activeView="cv-builder" name={name} matchCount={matchCount}/>
    <main className="main-content cv-builder-main">
      <div className="topline"><span>{t('WORKSPACE /')} {t('CV builder')}</span><span className="private-badge"><span className="tiny-dot"/>{t('Your account · Private')}</span></div>
      <header className="page-header"><div><span className="eyebrow">{t('YOUR EXPERIENCE, YOUR STORY')}</span><h1>{t('Build your next chapter.')}</h1><p className="muted">{t('Write once. Choose a template. Make it yours.')}</p></div></header>
      <div className="cv-workspace-toolbar">
        <label>{t('Saved CVs')}<select value={selected?.id??''} disabled={busy} onChange={event=>switchCv(cvs.find(cv=>cv.id===event.target.value)??null)}><option value="">{t('New CV')}</option>{cvs.map(cv=><option key={cv.id} value={cv.id}>{cv.title}</option>)}</select></label>
        <div className="cv-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={()=>switchCv(null)}><FilePlus2 size={16}/>{t('New CV')}</button>
          <button type="button" className="button secondary" disabled={busy} onClick={()=>void run(async()=>{const result=await request('POST',{...draft,title:`${draft.title.slice(0,85)} ${t('(copy)')}`});setCvs(previous=>[result.cv,...previous]);activate(result.cv);setMessage(t('CV duplicated.'));})}><Copy size={16}/>{t('Duplicate')}</button>
          <button type="button" className="button" disabled={busy||(!dirty&&!!selected)} onClick={()=>void run(async()=>{await save();setMessage(t('Your CV is saved.'));})}><Save size={16}/>{busy?t('Working…'):t('Save CV')}</button>
        </div>
      </div>
      <div className="cv-save-state"><span>{dirty?t('Unsaved changes'):selected?t('Saved {date}',{date:date(selected.updatedAt)}):t('Start with your details, then save your CV.')}</span>{selected&&<button type="button" className="text-button" disabled={busy} onClick={()=>void run(async()=>{const response=await fetch('/api/cvs');if(!response.ok)throw new Error(t('Could not load your CVs.'));const result=await response.json();setCvs(result.cvs);switchCv(result.cvs.find((cv:SavedCv)=>cv.id===selected.id)??null);})}>{t('Reload saved CV')}</button>}</div>
      {error&&<div role="alert" className="cv-notice error-text">{error}</div>}{message&&<div role="status" className="cv-notice">{message}</div>}
      <div className="cv-builder-grid">
        <div className="cv-editor">
          <fieldset disabled={busy}>
            <section className="panel cv-design-panel"><h2>{t('Your document')}</h2>
              <label>{t('CV title')}<input maxLength={100} value={draft.title} onChange={e=>update('title',e.target.value)}/></label>
              <div className="cv-template-options" role="group" aria-label={t('Choose a template')}>
                {(['accent','minimal'] as const).map(template=><button type="button" key={template} aria-pressed={draft.template===template} className={`cv-template-option ${draft.template===template?'selected':''}`} onClick={()=>update('template',template)}><span className={`cv-template-swatch ${template}`} aria-hidden="true"><span/><span/><span/></span><strong>{template==='accent'?t('Signature'):t('Minimal')}</strong><small>{template==='accent'?t('Dark header · Teal accents'):t('Clean typography · Simple layout')}</small></button>)}
              </div>
              <label>{t('CV section language')}<select value={draft.language} onChange={e=>update('language',e.target.value as CvDraft['language'])}><option value="en">English</option><option value="es">Español</option></select></label><p className="footnote">{t('Changes section headings. Your writing stays as entered.')}</p>
            </section>
            <section className="panel"><h2>{t('Personal details')}</h2><div className="cv-field-grid">
              {([['name','Full name'],['headline','Professional headline'],['email','Email'],['phone','Phone'],['location','Location'],['website','Website']] as const).map(([key,label])=><label key={key}>{t(label)}<input type={key==='email'?'email':'text'} maxLength={key==='website'?500:200} value={draft.content[key]} onChange={e=>content(key,e.target.value)}/></label>)}
            </div><label>{t('Professional summary')}<textarea rows={5} maxLength={3000} value={draft.content.summary} onChange={e=>content('summary',e.target.value)}/></label></section>
            <section className="panel"><h2>{t('Skills')}</h2><label>{t('One skill per line')}<textarea rows={6} value={draft.content.skills.join('\n')} onChange={e=>content('skills',e.target.value.split('\n'))}/></label><p className="footnote">{t('Up to 80 skills, 200 characters each.')}</p></section>
            {cvSectionKeys.map(key=><EntrySection key={key} title={sectionNames[key]} entries={draft.content[key]} onChange={entries=>content(key,entries)}/>)}
          </fieldset>
          <details className="panel cv-reference"><summary>{t('Use an existing CV as a reference')}</summary><p className="muted">{t('Read your existing CV here and copy details into the editor. Import extracts text; it does not populate fields automatically.')}</p><label>{t('Import reference text')}<input type="file" accept=".pdf,.docx,.txt" disabled={importing} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setImporting(true);setError('');try{const body=new FormData();body.set('cv',file);const response=await fetch('/api/cv',{method:'POST',body});const result=await response.json();if(!response.ok)throw new Error(result.error);setReference(result.text);}catch(error){setError(error instanceof Error?error.message:t('Could not read that file.'));}finally{setImporting(false);e.target.value='';}}}/></label>{importing&&<p role="status">{t('Reading CV…')}</p>}<label>{t('Reference text')}<textarea rows={10} value={reference} onChange={e=>setReference(e.target.value)}/></label></details>
          <section className="panel cv-matching"><h2>{t('Connect to your search')}</h2><p className="muted">{t('Use this CV as the experience reference for future job matching. This replaces the CV text in your search profile.')}</p><button type="button" className="button secondary" disabled={busy} onClick={()=>void run(async()=>{const cv=dirty||!selected?await save():selected;await request('PATCH',{action:'use',id:cv.id,revision:cv.revision});setMessage(t('This CV is now used for job matching.'));})}>{t('Save and use for matching')}</button></section>
          {selected&&<button type="button" className="text-button cv-delete" disabled={busy} onClick={()=>{if(window.confirm(t('Delete this saved CV? This cannot be undone. The search profile keeps its current CV text.')))void run(async()=>{await request('PATCH',{action:'delete',id:selected.id,revision:selected.revision});const remaining=cvs.filter(cv=>cv.id!==selected.id);setCvs(remaining);activate(remaining[0]??null);setMessage(t('CV deleted.'));});}}><Trash2 size={15}/>{t('Delete CV')}</button>}
        </div>
        <PdfPreview draft={draft}/>
      </div>
    </main>
  </div>;
}

function EntrySection({title,entries,onChange}:{title:string;entries:CvEntry[];onChange:(entries:CvEntry[])=>void}) {
  const {t}=useI18n();
  function update(index:number,key:keyof CvEntry,value:string){onChange(entries.map((entry,i)=>i===index?{...entry,[key]:value}:entry));}
  function move(index:number,direction:number){const next=[...entries];[next[index],next[index+direction]]=[next[index+direction],next[index]];onChange(next);}
  return <details className="panel cv-entry-section"><summary>{t(title)}<span className="muted">{entries.length}</span></summary>
    {entries.map((entry,index)=><div key={index} className="cv-entry-editor"><div className="cv-entry-toolbar"><strong>{t('Entry {number}',{number:index+1})}</strong><div><button type="button" className="icon-button" aria-label={t('Move entry up')} disabled={index===0} onClick={()=>move(index,-1)}><ArrowUp size={15}/></button><button type="button" className="icon-button" aria-label={t('Move entry down')} disabled={index===entries.length-1} onClick={()=>move(index,1)}><ArrowDown size={15}/></button><button type="button" className="icon-button" aria-label={t('Remove entry')} onClick={()=>onChange(entries.filter((_,i)=>i!==index))}><Trash2 size={15}/></button></div></div><div className="cv-field-grid">
      {([['title','Title / qualification'],['organization','Organization'],['dates','Dates'],['location','Location']] as const).map(([key,label])=><label key={key}>{t(label)}<input maxLength={200} value={entry[key]} onChange={e=>update(index,key,e.target.value)}/></label>)}
    </div><label>{t('Details · One bullet per line')}<textarea rows={5} maxLength={4000} value={entry.details} onChange={e=>update(index,'details',e.target.value)}/></label></div>)}
    <button type="button" className="text-button" disabled={entries.length>=30} onClick={()=>onChange([...entries,emptyCvEntry()])}><FilePlus2 size={15}/>{t('Add entry')}</button>
    {entries.length===0&&<p className="footnote">{t('Empty sections are hidden in your CV.')}</p>}
  </details>;
}
