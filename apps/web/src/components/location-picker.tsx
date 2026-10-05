'use client';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {addLocation,countryName,countrySuggestions,normalize,locationKey,locationLabel,maxSearchLocations,type SearchLocation} from '@core/locations';
import {useI18n} from './i18n';
import {translate} from '@core/i18n';

type Props={value:SearchLocation[];onChange:(places:SearchLocation[])=>void;id?:string;invalid?:boolean;legacyLocations?:string};
export default function LocationPicker({value,onChange,id,invalid,legacyLocations}:Props){
 const {locale,t}=useI18n();const generatedId=useId();const inputId=id||generatedId,listId=`${inputId}-results`,hintId=`${inputId}-hint`;
 const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(-1);
 const [cityCountry,setCityCountry]=useState('');const input=useRef<HTMLInputElement>(null);
 const [cities,setCities]=useState<SearchLocation[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const countries=useMemo(()=>cityCountry?[]:countrySuggestions(query,locale),[query,locale,cityCountry]);
 const options=[...countries,...cities].filter(place=>addLocation(value,place)!==value);
 useEffect(()=>{
  setCities([]);setError('');setActive(-1);
  const term=query.trim();const exactCountry=!cityCountry&&countrySuggestions(term,locale).some(p=>[p.countryCode,countryName(p.countryCode,locale),countryName(p.countryCode,'en')].some(name=>normalize(name)===normalize(term)));if(term.length<3||exactCountry){setLoading(false);return;}
  const controller=new AbortController();setLoading(true);
  const timer=setTimeout(async()=>{
   try{
    const params=new URLSearchParams({q:term});if(cityCountry)params.set('country',cityCountry);
    const response=await fetch(`/api/locations?${params}`,{signal:controller.signal});
    const result=await response.json();if(!response.ok)throw new Error(result.error);
    if(!controller.signal.aborted)setCities(result.cities);
   }catch{if(!controller.signal.aborted)setError(translate(locale,'City search is unavailable. Choose a country or try again later.'));}
   finally{if(!controller.signal.aborted)setLoading(false);}
  },400);
  return ()=>{clearTimeout(timer);controller.abort();};
 },[query,locale,cityCountry]);
 function select(place:SearchLocation){onChange(addLocation(value,place));setQuery('');setOpen(false);setActive(-1);}
 function chooseCities(countryCode:string){setCityCountry(countryCode);setQuery('');setCities([]);setOpen(true);setActive(-1);input.current?.focus();}
 return <div className="location-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
  <label htmlFor={inputId}>{cityCountry?t('Search for cities in {country}',{country:countryName(cityCountry,locale)}):t('Search for a country or city')}</label>
  <p id={hintId} className="footnote">{t('Choose up to {count} countries or cities. A country searches all its cities; a city narrows the search to that location.',{count:maxSearchLocations})}</p>
  {cityCountry&&<div className="location-city-scope"><p className="footnote">{t(value.some(p=>p.kind==='country'&&p.countryCode===cityCountry)?'Selecting a city replaces the whole-country search for {country}. You can add more cities.':'Add more cities in {country} to include them in your search.',{country:countryName(cityCountry,locale)})}</p><button type="button" className="text-button" onClick={()=>{setCityCountry('');setQuery('');setCities([]);input.current?.focus();}}>{t('Search other countries or cities')}</button></div>}
  {legacyLocations&&!value.length&&<p className="footnote">{t('Your previous locations: {locations}. Select them below to confirm your search area.',{locations:legacyLocations})}</p>}
  <input ref={input} id={inputId} role="combobox" aria-autocomplete="list" aria-expanded={open&&options.length>0} aria-controls={open&&options.length?listId:undefined}
   aria-activedescendant={active>=0&&active<options.length?`${listId}-${active}`:undefined} aria-invalid={invalid} aria-describedby={hintId}
   value={query} maxLength={80} autoComplete="off" placeholder={t(cityCountry?'Type a city…':'Type a country or city…')} onFocus={()=>setOpen(true)}
   onChange={event=>{setQuery(event.target.value);setCities([]);setOpen(true);setActive(-1);}}
   onKeyDown={event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);setActive(index=>options.length?(index<0?(event.key==='ArrowDown'?0:options.length-1):(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length):-1);}
    if(event.key==='Escape'){setOpen(false);setActive(-1);}
    if(event.key==='Enter'){event.preventDefault();if(open&&active>=0&&options[active])select(options[active]);}
   }}/>
  {open&&query&&<ul id={listId} role="listbox" aria-label={t('Location suggestions')} className="location-results">
   {options.map((place,index)=><li key={locationKey(place)} role="presentation"><button id={`${listId}-${index}`} type="button" role="option" aria-selected={index===active}
    onMouseDown={event=>event.preventDefault()} onClick={()=>select(place)}>
    <span>{locationLabel(place,locale)}</span><small>{t(place.kind==='country'?'All cities':value.some(p=>p.kind==='country'&&p.countryCode===place.countryCode)?'Search only this city':'City')}</small>
   </button></li>)}
  </ul>}
  {open&&query&&!options.length&&!loading&&!error&&<p role="status" className="footnote">{t(value.length>=maxSearchLocations?'You have selected {count} locations. Remove one to add another, or narrow a country to a city.':'No locations found. Try a country name or another city.',{count:maxSearchLocations})}</p>}
  {loading&&<p role="status" className="footnote">{t('Looking up cities…')}</p>}
  {error&&<p role="status" className="footnote">{error}</p>}
  <div className="selection-chips" aria-label={t('Selected search locations')}>
   {value.map(place=><span className="selection-chip location-chip" key={locationKey(place)}><span>{locationLabel(place,locale)}{place.kind==='country'&&<small> · {t('All cities')}</small>}</span>
    {place.kind==='country'&&<button type="button" className="text-button location-refine" aria-label={t('Choose cities in {country}',{country:countryName(place.countryCode,locale)})} onClick={()=>chooseCities(place.countryCode)}>{t('Choose cities')}</button>}
    <button type="button" className="icon-button" aria-label={t('Remove {location}',{location:locationLabel(place,locale)})} onClick={()=>onChange(value.filter(p=>locationKey(p)!==locationKey(place)))}><X size={16}/></button>
   </span>)}
  </div>
  <p className="footnote">{t('Search locations do not establish work rights. Remote jobs may still restrict where you can live.')}</p>
  <p className="footnote">{t('City suggestions use')} <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></p>
 </div>;
}
