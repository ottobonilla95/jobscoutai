'use client';
import {useState} from 'react';
import {Select} from './ui';
import LocationPicker from './location-picker';
import {countryCodes,countryName,type SearchLocation} from '@core/locations';
import {trackSummary,type SearchTrack} from '@core/search-plan';
import {useI18n} from './i18n';

export default function SearchTrackEditor({value,onChange}:{value:SearchTrack[];onChange:(tracks:SearchTrack[])=>void}){
  const {t,locale}=useI18n();const [places,setPlaces]=useState<SearchLocation[]>([]);
  function update(index:number,patch:Partial<SearchTrack>){onChange(value.map((track,i)=>i===index?{...track,...patch}:track));}
  function add(track:SearchTrack){if(value.length<8)onChange([...value,track]);}
  return <div className="search-tracks">
    <p>{t('Search tracks')}</p>
    <p className="footnote">{t('Each track is an alternative. Remote eligibility is checked against where you will work, independently of employer headquarters. Regional searches rotate countries across runs; one run may not cover every country.')}</p>
    {value.map((track,index)=><fieldset key={index} className="panel">
      <legend>{t('Search track')} {index+1}</legend>
      <p>{trackSummary(track,locale)}</p>
      <label>{t('Work preference')}<Select aria-label={`${t('Work preference')} ${index+1}`} value={track.workMode} options={[
        {value:'any',label:t('Any work mode'),disabled:track.area==='worldwide'},
        {value:'remote',label:t('Remote only')},
        {value:'office',label:t('Office or hybrid'),disabled:track.area==='worldwide'},
      ]} onValueChange={workMode=>update(index,{workMode:workMode as SearchTrack['workMode'],workFromCountries:workMode==='remote'?track.workFromCountries:[]})}/></label>
      {track.area==='locations'&&<LocationPicker id={`track-${index}-locations`} value={track.locations} onChange={locations=>{if(locations.length)update(index,{locations});}}/>}
      {track.workMode==='remote'&&<>
        <p className="footnote">{t('Countries you may work from. Leave blank if undecided; missing eligibility remains a research question.')}</p>
        <div className="selection-chips">{track.workFromCountries.map(code=><button key={code} className="button secondary" type="button" aria-label={`${t('Remove')} ${countryName(code,locale)}`} onClick={()=>update(index,{workFromCountries:track.workFromCountries.filter(c=>c!==code)})}>{countryName(code,locale)} ×</button>)}</div>
        <Select aria-label={`${t('Add work-from country')} ${index+1}`} value="" options={[{value:'',label:t('Add work-from country'),disabled:true},...countryCodes.filter(code=>!track.workFromCountries.includes(code)).map(code=>({value:code,label:countryName(code,locale)})).sort((a,b)=>a.label.localeCompare(b.label))]} onValueChange={code=>{if(track.workFromCountries.length<40)update(index,{workFromCountries:[...track.workFromCountries,code]});}}/>
      </>}
      <button type="button" className="text-button" onClick={()=>onChange(value.filter((_,i)=>i!==index))}>{t('Remove search track')}</button>
    </fieldset>)}
    {value.length<8&&<div>
      <div className="profile-matching-actions"><button type="button" className="button secondary" onClick={()=>add({area:'europe',locations:[],workMode:'any',workFromCountries:[]})}>{t('Add all Europe')}</button><button type="button" className="button secondary" onClick={()=>add({area:'worldwide',locations:[],workMode:'remote',workFromCountries:[]})}>{t('Add worldwide remote')}</button></div>
      <details><summary>{t('Add a track for countries or cities')}</summary><LocationPicker id="new-track-locations" value={places} onChange={setPlaces}/><button type="button" className="button secondary" disabled={!places.length} onClick={()=>{add({area:'locations',locations:places,workMode:'any',workFromCountries:[]});setPlaces([]);}}>{t('Add search track')}</button></details>
    </div>}
  </div>;
}
