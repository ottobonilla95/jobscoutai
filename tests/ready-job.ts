import {defaultProfile,type Assessment,type Verification} from '../packages/core/src/profile';
import {evaluateStrategy} from '../packages/core/src/strategy';
import type {Store} from '../packages/core/src/store';

const quote='Build useful products with customers and take ownership of delivery.';
export const readyEvaluation=evaluateStrategy(defaultProfile.strategy,{
 components:defaultProfile.strategy.groups.flatMap(group=>group.criteria.map(criterion=>({id:criterion.id,score:5,reason:'Supported fit.',evidence:quote}))),
 requirements:[],countries:[],
},quote,'Remote');
export function readyAssessment(assessment:Assessment):Assessment{return {...assessment,evaluation:readyEvaluation};}
export function readyVerification(url:string):Verification{return {status:'open',checkedAt:new Date().toISOString(),applicationUrl:url,note:'Checked application form.'};}
export async function markReady(store:Store,id:string){const job=await store.job(id);if(!job)throw new Error('Missing job fixture.');await store.verify(id,readyVerification(job.url));}
