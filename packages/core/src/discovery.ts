import {z} from 'zod';

export const discoverySchema=z.object({
  intent:z.string().trim().min(10).max(1200),
  titleVariants:z.array(z.string().trim().min(2).max(120)).max(8),
  evidencePriorities:z.array(z.string().trim().min(5).max(300)).max(6),
  questions:z.array(z.string().trim().min(5).max(300)).max(4),
});
export type Discovery=z.infer<typeof discoverySchema>;
// Confirmed role families always take priority over the proposed equivalent titles.
// Bound query expansion so one account cannot monopolize the scheduled worker.
export function searchTitles(profile:{titles:string[];strategy?:{discovery?:Discovery|null}}) {
  const result:string[]=[];const seen=new Set<string>();
  for(const title of [...profile.titles,...(profile.strategy?.discovery?.titleVariants||[])]){
    const trimmed=title.trim(),key=trimmed.toLocaleLowerCase();
    if(trimmed&&!seen.has(key)){seen.add(key);result.push(trimmed);}
  }
  return result.slice(0,8);
}
