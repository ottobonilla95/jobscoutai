'use client';
import {X} from 'lucide-react';
import {useI18n} from './i18n';

export default function RolePicker({value,onChange,id='target-roles',invalid=false}:{value:string;onChange:(value:string)=>void;id?:string;invalid?:boolean}){
 const {t}=useI18n();const roles=value.split('\n');
 return <div className="role-picker" id={id}>
  {roles.map((role,index)=><div className="role-picker-row" key={index}>
   <label htmlFor={`${id}-${index}`}><span>{t('Role {number}',{number:index+1})}</span>
    <input id={`${id}-${index}`} value={role} maxLength={120} aria-invalid={invalid} placeholder={t('Enter a role title')}
     onChange={event=>onChange(roles.map((item,i)=>i===index?event.target.value:item).join('\n'))}/></label>
   <button type="button" className="icon-button" aria-label={t('Remove role {number}',{number:index+1})} onClick={()=>onChange(roles.filter((_,i)=>i!==index).join('\n'))}><X size={18}/></button>
  </div>)}
  {roles.length<4&&<button type="button" className="text-button" onClick={()=>onChange([...roles,''].join('\n'))}>{t('Add a role')}</button>}
  <p className="footnote">{t('Review up to four role families. We can search equivalent titles without changing your goal.')}</p>
 </div>;
}
