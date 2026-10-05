import {z} from 'zod';
export const researchEvidenceSchema=z.object({
 id:z.string().max(64),topic:z.string().min(1).max(120),claim:z.string().max(600),quote:z.string().min(8).max(1000),url:z.url().refine(v=>new URL(v).protocol==='https:'),
 scope:z.enum(['job','company']),origin:z.enum(['listing','web']),stance:z.enum(['supports','contradicts']),recordedAt:z.iso.datetime(),retrievedAt:z.iso.datetime(),
});
export type ResearchEvidence=z.infer<typeof researchEvidenceSchema>;
export const researchQuestionSchema=z.object({id:z.string().max(64),question:z.string().min(1).max(600),topic:z.string().min(1).max(120),status:z.enum(['open','answered','conflicting']),answer:z.string().max(800).default(''),evidenceIds:z.array(z.string().max(64)).max(8).default([])});
export type ResearchQuestion=z.infer<typeof researchQuestionSchema>;
export const researchDossierSchema=z.object({profileVersion:z.number().int(),updatedAt:z.iso.datetime(),summary:z.string().max(1200),evidence:z.array(researchEvidenceSchema).max(40),questions:z.array(researchQuestionSchema).max(12),generationIds:z.array(z.string().max(64)).max(20).default([])});
export type ResearchDossier=z.infer<typeof researchDossierSchema>;
export const companyMemorySchema=z.object({name:z.string().max(150),identity:z.literal('name_match_only'),evidence:z.array(researchEvidenceSchema).max(80),updatedAt:z.iso.datetime()});
export type CompanyMemory=z.infer<typeof companyMemorySchema>;
