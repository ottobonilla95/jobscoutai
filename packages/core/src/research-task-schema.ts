import {z} from 'zod';
const claimSchema=z.object({url:z.url().max(2000),quote:z.string().min(8).max(1000),scope:z.enum(['job','company']),stance:z.enum(['supports','contradicts'])});
export const investigationSchema=z.object({questions:z.array(z.object({question:z.string().min(8).max(600),topic:z.string().min(2).max(120),scope:z.enum(['job','company']),claims:z.array(claimSchema).max(3)})).max(4)});
export type InvestigationOutput=z.infer<typeof investigationSchema>;
export const sourceReceiptSchema=z.object({url:z.url(),retrievedAt:z.iso.datetime(),status:z.enum(['checked','unavailable']),employerNamed:z.boolean().default(false),quotes:z.array(z.string().max(1000)).max(12)});
export const researchTaskSchema=z.object({
 jobId:z.string(),profileVersion:z.number().int().positive(),requestId:z.string().nullable(),
 status:z.enum(['running','waiting','completed','failed','cancelled']),attempts:z.number().int().min(0).max(3),
 lease:z.uuid().nullable(),expiresAt:z.number().nullable(),nextAttemptAt:z.iso.datetime().nullable(),updatedAt:z.iso.datetime(),
 plan:z.object({output:investigationSchema,citations:z.array(z.url()).max(50),generationId:z.uuid(),inputTokens:z.number(),outputTokens:z.number()}).nullable(),
 pages:z.array(sourceReceiptSchema).max(4),lastError:z.string().max(300).nullable(),
});
export type ResearchTask=z.infer<typeof researchTaskSchema>;
export const researchStatsSchema=z.object({attempted:z.number().int().nonnegative(),completed:z.number().int().nonnegative(),resumed:z.number().int().nonnegative(),verifiedEvidence:z.number().int().nonnegative(),answered:z.number().int().nonnegative(),unresolved:z.number().int().nonnegative(),retryScheduled:z.number().int().nonnegative(),failed:z.number().int().nonnegative(),stopReason:z.enum(['disabled','unavailable','daily_budget','time_budget','opportunity_limit','finished'])});
export type ResearchStats=z.infer<typeof researchStatsSchema>;
