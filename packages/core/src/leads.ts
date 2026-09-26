import { z } from 'zod';
export const leadSchema=z.object({
 company:z.string().trim().min(2).max(150),url:z.url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;},'Use an HTTPS source link.'),
 kind:z.enum(['company','recruiter']), status:z.enum(['research','contact','monitor','archived']),
 evidence:z.string().max(8000),unknowns:z.string().max(3000),nextAction:z.string().max(1500),
 evidenceDate:z.union([z.literal(''),z.iso.date()]),followUp:z.union([z.literal(''),z.iso.date()]),
});
export type Lead=z.infer<typeof leadSchema>&{id:string;createdAt:string};
