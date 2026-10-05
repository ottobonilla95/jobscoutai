import {z} from 'zod';
export const reviewedPreferenceSchema=z.object({id:z.uuid(),text:z.string().trim().min(5).max(500)});
export const feedbackSchema=z.object({id:z.uuid(),reason:z.string().trim().min(5).max(500),proposedPreference:z.string().trim().min(5).max(500),status:z.enum(['proposed','applied','job_only']),profileVersion:z.number().int().positive(),createdAt:z.iso.datetime()});
export type OpportunityFeedback=z.infer<typeof feedbackSchema>;
export const feedbackInputSchema=z.object({reason:z.string().trim().min(5).max(500),archive:z.boolean().default(false)});
export const feedbackReviewSchema=z.object({id:z.uuid(),action:z.enum(['apply','job_only']),preference:z.string().trim().min(5).max(500).optional()});
