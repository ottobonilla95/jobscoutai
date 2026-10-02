'use client';
import {useEffect,useId,useMemo,useState} from 'react';
import {X} from 'lucide-react';
import {addLocation,countryName,countrySuggestions,normalize,locationKey,locationLabel,maxSearchLocations,type SearchLocation} from '@core/locations';
import {useI18n} from './i18n';

type Props={value:SearchLocation[];onChange:(places:SearchLocation[])=>void;id?:string;invalid?:boolean;legacyLocations?:string};
export default function LocationPicker({value,onChange,id,invalid,legacyLocations}:Props){
 const {locale,t}=useI18n();const generatedId=useId();const inputId=id||generatedId,listId=`${inputId}-results`,hintId=`${inputId}-hint`;
 const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(-1);
 const [cities,setCities]=useState<SearchLocation[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const countries=useMemo(()=>countrySuggestions(query,locale),[query,locale]);
 const options=[...countries,...cities].filter(place=>addLocation(value,place)!==value);
 useEffect(()=>{
  setCities([]);setError('');setActive(-1);
  const term=query.trim();const exactCountry=countrySuggestions(term,locale).some(p=>[p.countryCode,countryName(p.countryCode,locale),countryName(p.countryCode,'en')].some(name=>normalize(name)===normalize(term)));if(term.length<3||exactCountry||value.length>=maxSearchLocations){setLoading(false);return;}
  const controller=new AbortController();setLoading(true);
  const timer=setTimeout(async()=>{
   try{
    const response=await fetch(`/api/locations?q=${encodeURIComponent(term)}`,{signal:controller.signal});
    const result=await response.json();if(!response.ok)throw new Error(result.error);
    if(!controller.signal.aborted)setCities(result.cities);
   }catch{if(!controller.signal.aborted)setError(t('City search is unavailable. Choose a country or try again later.'));}
   finally{if(!controller.signal.aborted)setLoading(false);}
  },400);
  return ()=>{clearTimeout(timer);controller.abort();};
 },[query,locale]);
 function select(place:SearchLocation){onChange(addLocation(value,place));setQuery('');setOpen(false);setActive(-1);}
 return <div className="location-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
  <label htmlFor={inputId}>{t('Search for a country or city')}</label>
  <p id={hintId} className="footnote">{t('Choose whole countries or specific cities, up to 3. A city includes its country.')}</p>
  {legacyLocations&&!value.length&&<p className="footnote">{t('Your previous locations: {locations}. Select them below to confirm your search area.',{locations:legacyLocations})}</p>}
  <input id={inputId} role="combobox" aria-autocomplete="list" aria-expanded={open&&Boolean(query)} aria-controls={listId}
   aria-activedescendant={active>=0&&active<options.length?`${listId}-${active}`:undefined} aria-invalid={invalid} aria-describedby={hintId}
   value={query} maxLength={80} autoComplete="off" placeholder={t('Type a country or city…')} onFocus={()=>setOpen(true)}
   onChange={event=>{setQuery(event.target.value);setOpen(true);setActive(-1);}}
   onKeyDown={event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);setActive(index=>options.length?(index<0?(event.key==='ArrowDown'?0:options.length-1):(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length):-1);}
    if(event.key==='Escape'){setOpen(false);setActive(-1);}
    if(event.key==='Enter'){event.preventDefault();if(open&&active>=0&&options[active])select(options[active]);}
   }}/>
  {open&&query&&<ul id={listId} role="listbox" aria-label={t('Location suggestions')} className="location-results">
   {options.map((place,index)=><li key={locationKey(place)} role="presentation"><button id={`${listId}-${index}`} type="button" role="option" aria-selected={index===active}
    onMouseDown={event=>event.preventDefault()} onClick={()=>select(place)}>
    <span>{locationLabel(place,locale)}</span><small>{t(place.kind==='country'?'Whole country':'City')}</small>
   </button></li>)}
  </ul>}
  {open&&query&&!options.length&&!loading&&!error&&<p role="status" className="footnote">{t(value.length>=maxSearchLocations?'Remove a location to add another.':'No locations found. Try a country name or another city.')}</p>}
  {loading&&<p role="status" className="footnote">{t('Looking up cities…')}</p>}
  {error&&<p role="status" className="footnote">{error}</p>}
  <div className="selection-chips" aria-label={t('Selected search locations')}>
   {value.map(place=><span className="selection-chip" key={locationKey(place)}><span>{locationLabel(place,locale)}{place.kind==='country'&&<small> · {t('Whole country')}</small>}</span>
    <button type="button" className="icon-button" aria-label={t('Remove {location}',{location:locationLabel(place,locale)})} onClick={()=>onChange(value.filter(p=>locationKey(p)!==locationKey(place)))}><X size={16}/></button>
   </span>)}
  </div>
  <p className="footnote">{t('Search locations do not establish work rights. Remote jobs may still restrict where you can live.')}</p>
  <p className="footnote">{t('City suggestions use')} <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></p>
 </div>;
}
