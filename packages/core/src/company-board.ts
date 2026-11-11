import {z} from 'zod';
import {load} from 'cheerio';
import type {JobListing} from './profile';
import {parseBoard,sourceLabel} from './source-settings';
import {SourceError} from './source-error';
import {publicData} from './source-http';
import {plainText} from './source-html';

const ashbySchema=z.object({jobs:z.array(z.object({
  id:z.string().optional(),title:z.string(),location:z.string(),jobUrl:z.url(),isListed:z.boolean().optional(),
  isRemote:z.boolean().optional(),descriptionPlain:z.string().optional(),descriptionHtml:z.string().optional(),
  publishedAt:z.string().optional(),compensation:z.object({compensationTierSummary:z.string().nullish()}).nullish(),
  secondaryLocations:z.array(z.object({location:z.string()})).optional(),
}))});
const greenhouseSchema=z.object({jobs:z.array(z.object({
  id:z.number(),title:z.string(),location:z.object({name:z.string()}),absolute_url:z.url(),content:z.string(),
}))});
export function parseCompanyJobs(raw: unknown, board: NonNullable<ReturnType<typeof parseBoard>>): JobListing[] {
  if(board.provider==='ashby')return ashbySchema.parse(raw).jobs.filter(j=>j.isListed!==false).map(j=>{
    const url=new URL(j.jobUrl);
    if(url.protocol!=='https:'||url.hostname!=='jobs.ashbyhq.com')throw new SourceError('Ashby returned an unexpected job URL.',true);
    const id=j.id||url.pathname.split('/').filter(Boolean).at(-1)!;
    return {id:`${board.key}:${id}`,sourceKey:board.key,title:j.title,company:board.slug,
      location:[j.location,...(j.secondaryLocations||[]).map(l=>l.location),...(j.isRemote?['Remote']:[])].join(' · '),
      url:url.href,postedAt:j.publishedAt||null,description:`${j.descriptionPlain||plainText(j.descriptionHtml||'')}\n${j.compensation?.compensationTierSummary||''}`.trim().slice(0,24000)};
  });
  return greenhouseSchema.parse(raw).jobs.map(j=>{
    const url=new URL(j.absolute_url);if(url.protocol!=='https:')throw new SourceError('Greenhouse returned an invalid job URL.',true);
    // Greenhouse content can be entity-encoded HTML. Decode once, then strip markup.
    const decoded=load(j.content).text();
    return {id:`${board.key}:${j.id}`,sourceKey:board.key,title:j.title,company:board.slug,location:j.location.name,
      url:url.href,postedAt:null,description:plainText(decoded.includes('<')?decoded:j.content)};
  });
}
export async function loadCompanyBoard(board:NonNullable<ReturnType<typeof parseBoard>>):Promise<JobListing[]>{
 const url=board.provider==='ashby'?`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.slug)}?includeCompensation=true`:
  `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.slug)}/jobs?content=true`;
 return parseCompanyJobs(JSON.parse(await publicData(url,sourceLabel(board.key))),board);
}
