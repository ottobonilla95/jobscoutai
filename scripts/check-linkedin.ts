import { defaultProfile } from '../packages/core/src/profile';
import { searchLinkedIn, fetchDescription } from '../packages/core/src/linkedin';
const jobs = await searchLinkedIn({ ...defaultProfile, titles: ['Founding Engineer'], locations: [''] });
if (!jobs.length) throw new Error('No listings returned; source availability is not proven.');
const description = await fetchDescription(jobs[0].id);
console.log(JSON.stringify({ listings: jobs.length, firstJobUrl: jobs[0].url, descriptionCharacters: description.length },null,2));
