import {answeredClarifications,type GoalClarification} from '@core/goal-clarifications';
import type {SetupAnswers} from '@core/setup-schema';
import {useI18n} from './i18n';

export default function GoalAnswerSummary({answers}:{answers:SetupAnswers}){
 const {t}=useI18n();const questions:GoalClarification[]=answeredClarifications(answers);
 if(!questions.length)return null;
 return <section className="goal-answer-summary" aria-label={t('Your clarified priorities')}><h3>{t('Your clarified priorities')}</h3><dl>{questions.map(q=><div key={q.id}><dt>{q.question}<span className="pill neutral">{t(q.importance==='requirement'?'Firm requirement':'Preference')}</span></dt><dd>{q.answer}</dd></div>)}</dl></section>;
}
