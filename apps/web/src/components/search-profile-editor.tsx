import type { ChangeEvent, RefObject } from 'react';
import { Check, FileText, MapPin, SlidersHorizontal, Sparkles, Target, Upload } from 'lucide-react';
import type { SetupAnswers, SetupDraft } from '@core/setup-schema';
import LocationPicker from './location-picker';
import RolePicker from './role-picker';
import StrategyReview from './strategy-review';
import type {SearchLocation} from '@core/locations';
import { useI18n } from './i18n';

export const profileFieldIds: Record<number, string> = {
  1: 'profile-cv', 2: 'profile-objective', 3: 'profile-titles-0',
  4: 'profile-location', 5: 'profile-work-preference', 10: 'profile-frequency',
};

type Props = {
  answers: SetupAnswers;
  matching: SetupDraft['matching'];
  matchingCurrent: boolean;
  minimum: number;
  frequencies: number[];
  busy: boolean;
  saveState: string;
  error: string;
  notice: string;
  invalidStep: number | null;
  verificationNotice: React.ReactNode;
  formRef: RefObject<HTMLFormElement | null>;
  update: <K extends keyof SetupAnswers>(key: K, value: SetupAnswers[K]) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onSuggest: (kind: 'roles' | 'matching') => Promise<void>;
  onStandardMatching: () => void;
  onSave: () => Promise<void>;
  onLocations:(places:SearchLocation[])=>void;
  onMatching:(matching:NonNullable<SetupDraft['matching']>)=>void;
};

export default function SearchProfileEditor({
  answers: a, matching, matchingCurrent, minimum, frequencies, busy, saveState,
  error, notice, invalidStep, verificationNotice, formRef, update, onUpload,
  onSuggest, onStandardMatching, onSave, onLocations, onMatching,
}: Props) {
  const { t } = useI18n();
  const fieldError = (step: number) => invalidStep === step || undefined;

  return <form ref={formRef} className="profile-editor" onSubmit={event => {
    event.preventDefault(); void onSave();
  }}>
    <div className="profile-editor-toolbar">
      <div><p>{t('These values guide every search.')}</p><span role="status">{t(saveState === 'Progress saved' ? 'Draft saved' : saveState)}</span></div>
      <button className="button primary" disabled={busy}><Check size={16}/>{t('Save search profile')}</button>
    </div>
    {error && <p role="alert" id="profile-error" className="toast error">{error}</p>}
    {notice && <p role="status" className="toast">{notice}</p>}
    <fieldset className="profile-editor-fields" disabled={busy}>
      <div className="profile-editor-grid">
        <div className="profile-editor-main">
          <section className="panel profile-panel" aria-labelledby="profile-direction-heading">
            <div className="profile-panel-heading"><Target size={19}/><div><h2 id="profile-direction-heading">{t('Your direction')}</h2><p>{t('The roles and goals you want to move toward.')}</p></div></div>
            <label htmlFor="profile-name">{t('Your name')} <span className="profile-optional">{t('Optional')}</span><input id="profile-name" value={a.name} maxLength={100} autoComplete="given-name" onChange={event => update('name', event.target.value)}/></label>
            <div className="profile-field-grid">
              <label htmlFor="profile-objective">{t('Career goal')}<textarea id="profile-objective" rows={4} value={a.objective} maxLength={3000} aria-invalid={fieldError(2)} aria-describedby={fieldError(2) ? 'profile-error' : undefined} onChange={event => update('objective', event.target.value)}/></label>
              <div className="profile-role-field"><RolePicker id="profile-titles" value={a.titles} invalid={fieldError(3)} onChange={value=>update('titles',value)}/><button type="button" className="text-button" onClick={() => void onSuggest('roles')}><Sparkles size={14}/>{t('Regenerate from my CV and goal')}</button></div>
            </div>
          </section>

          <section className="panel profile-panel" aria-labelledby="profile-location-heading">
            <div className="profile-panel-heading"><MapPin size={19}/><div><h2 id="profile-location-heading">{t('Location and work')}</h2><p>{t('Where and how your next role should fit your life.')}</p></div></div>
            <div className="profile-field-grid">
              <LocationPicker id="profile-location" value={a.selectedLocations} legacyLocations={a.locations} invalid={fieldError(4)} onChange={onLocations}/>
              <label htmlFor="profile-work-preference">{t('Work preference')}<select id="profile-work-preference" value={a.remotePreference} aria-invalid={fieldError(5)} onChange={event => update('remotePreference', event.target.value as SetupAnswers['remotePreference'])}><option value="" disabled>{t('Choose your work preference.')}</option><option value="remote">{t('Remote only')}</option><option value="flexible">{t('Also open to office work')}</option></select><small>{t('Remote jobs can still have location and work-authorization restrictions.')}</small></label>
            </div>
            <label htmlFor="profile-authorization">{t('Work authorization')} <span className="profile-optional">{t('Optional')}</span><textarea id="profile-authorization" rows={2} value={a.workAuthorization} maxLength={1000} onChange={event => update('workAuthorization', event.target.value)}/></label>
          </section>

          <section className="panel profile-panel" aria-labelledby="profile-preferences-heading">
            <div className="profile-panel-heading"><SlidersHorizontal size={19}/><div><h2 id="profile-preferences-heading">{t('Your preferences')}</h2><p>{t('Compensation, ownership, and firm requirements.')}</p></div></div>
            <div className="profile-field-grid">
              <label htmlFor="profile-salary">{t('Salary expectations')} <span className="profile-optional">{t('Optional')}</span><input id="profile-salary" value={a.salaryExpectation} maxLength={300} placeholder={t('For example: €70,000–90,000 per year, flexible')} onChange={event => update('salaryExpectation', event.target.value)}/></label>
              <label htmlFor="profile-equity">{t('Equity expectations')} <span className="profile-optional">{t('Optional')}</span><input id="profile-equity" value={a.equityExpectation} maxLength={500} onChange={event => update('equityExpectation', event.target.value)}/></label>
            </div>
            <label htmlFor="profile-constraints">{t('Must-haves and dealbreakers')} <span className="profile-optional">{t('Optional')}</span><textarea id="profile-constraints" rows={3} value={a.constraints} maxLength={3000} onChange={event => update('constraints', event.target.value)}/><small>{t('List only firm requirements or things you would rule out. Use your goal above for softer preferences.')}</small></label>
          </section>

          <section className="panel profile-panel" aria-labelledby="profile-experience-heading">
            <div className="profile-panel-heading"><FileText size={19}/><div><h2 id="profile-experience-heading">{t('Your experience')}</h2><p>{t('Your CV gives matching the context behind your goals.')}</p></div></div>
            <div className="profile-cv-upload"><div><FileText size={22}/><span><strong>{a.cvFileName || t('Bring your experience along')}</strong><small>{t('PDF, DOCX, or TXT · Up to 5 MB')}</small></span></div><label className="button secondary"><Upload size={16}/>{t('Upload CV')}<input className="setup-file" type="file" accept=".pdf,.docx,.txt" aria-label={t('Upload CV')} onChange={event => void onUpload(event)}/></label></div>
            <label htmlFor="profile-cv">{t('CV text')}<textarea id="profile-cv" rows={7} value={a.cvText} maxLength={30000} aria-invalid={fieldError(1)} aria-describedby={fieldError(1) ? 'profile-error' : undefined} placeholder={t('Your experience, skills, and achievements…')} onChange={event => update('cvText', event.target.value)}/></label>
          </section>
        </div>

        <aside className="profile-editor-aside" aria-label={t('Search preferences')}>
          <section className="panel profile-panel" aria-labelledby="profile-matching-heading">
            <div className="profile-panel-heading"><Sparkles size={19}/><h2 id="profile-matching-heading">{t('Matching preferences')}</h2></div>
            <span className={`pill ${matchingCurrent ? 'green' : 'neutral'}`}>{t(matchingCurrent ? 'Up to date' : 'Update needed')}</span>
            <p className="profile-matching-copy">{matchingCurrent ? matching!.summary : t(matching ? 'Your answers changed. Update your matching preferences before saving.' : 'Generate your matching preferences from your CV and answers, or start with standard matching.')}</p>
            {matchingCurrent&&matching&&<StrategyReview matching={matching} onChange={onMatching}/>}
            <div className="profile-matching-actions"><button type="button" className="button secondary full" onClick={() => void onSuggest('matching')}>{t(matchingCurrent ? 'Regenerate matching preferences' : 'Generate matching preferences')}</button><button type="button" className="text-button" onClick={onStandardMatching}>{t('Use standard matching')}</button></div>
            <p className="footnote">{t('Your explicit dealbreakers remain requirements. Missing information stays unknown.')}</p>
          </section>
          <section className="panel profile-panel" aria-labelledby="profile-schedule-heading">
            <div className="profile-panel-heading"><SlidersHorizontal size={19}/><h2 id="profile-schedule-heading">{t('Search preferences')}</h2></div>
            <label htmlFor="profile-frequency">{t('Search frequency')}<select id="profile-frequency" value={a.intervalHours} aria-invalid={fieldError(10)} onChange={event => update('intervalHours', Number(event.target.value))}>{frequencies.map(hours => <option key={hours} value={hours}>{t('Every {count} hours', {count: hours})}</option>)}</select><small>{t('Searches run at least {count} hours apart. You can pause automatic searches later.', {count: minimum})}</small></label>
            <label className="check-label"><input type="checkbox" checked={a.emailAlerts} onChange={event => update('emailAlerts', event.target.checked)}/><span>{t('Yes, email me strong matches')}<small>{t('We will email new strong matches to your verified account address. You can change this later.')}</small></span></label>
            {verificationNotice}
          </section>
        </aside>
      </div>
    </fieldset>
    <div className="profile-editor-save"><span>{t('Drafts are saved automatically. Save your profile to apply changes to searches.')}</span><button className="button primary" disabled={busy}><Check size={16}/>{t(busy ? 'Working on it…' : 'Save search profile')}</button></div>
  </form>;
}
