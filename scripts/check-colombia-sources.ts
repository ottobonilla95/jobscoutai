import { defaultProfile } from '../packages/core/src/profile';
import { activeCountrySources } from '../packages/core/src/country-sources';
import { describeCountryJob, searchCountrySource } from '../packages/core/src/country-adapters';

// Read-only public retrieval smoke test. No account, model, email, or database calls.
const profile = {...defaultProfile,titles:[process.argv[2] || 'software'],locations:[process.argv[3] || 'Colombia']};
const sources = activeCountrySources(profile);
if (!sources.length) throw new Error('Choose a Colombia search location.');
let failures = 0;
for (const source of sources) {
  try {
    const jobs = await searchCountrySource(source,profile);
    if (!jobs.length) throw new Error('No listings returned; live retrieval is unverified.');
    const job = jobs.find(job => (job.description?.length || 0) >= 50) || jobs[0];
    const description = job.description || await describeCountryJob(job.id,job);
    if (description.length < 50) throw new Error('No usable description returned.');
    console.log(JSON.stringify({source:source.label,listings:jobs.length,firstJobUrl:job.url,descriptionCharacters:description.length}));
  } catch (error) {
    failures++; console.error(JSON.stringify({source:source.label,error:error instanceof Error ? error.message : 'Retrieval failed.'}));
  }
}
process.exitCode = failures ? 1 : 0;
