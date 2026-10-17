import {z} from 'zod';
import {setupDraftSchema, setupAnswersSchema} from './setup-schema';
import {parseBoard} from './source-settings';
import {searchLocationSchema,maxSearchLocations} from './locations';
import {goalClarificationSchema} from './goal-clarifications';

export const chatSettingsSchema=z.object({
  sources:z.array(z.enum(['linkedin','yc','companies'])).min(1).max(3),
  companyBoards:z.array(z.string().max(250).refine(url=>Boolean(parseBoard(url)))).max(5),
  enabled:z.boolean(), researchEnabled:z.boolean(),
  minimumScore:z.number().int().min(0).max(100),
  postedWithinDays:z.number().int().min(1).max(90), includeUnknownDates:z.boolean(),
  maxJobsPerRun:z.number().int().min(1).max(30), dailyEvaluationLimit:z.number().int().min(1).max(300),
});
export const chatMessageSchema=z.object({id:z.string(),role:z.enum(['user','assistant']),text:z.string().max(32000)});
export const searchChatSchema=z.object({
  revision:z.number().int().nonnegative(), baseFingerprint:z.string(),
  messages:z.array(chatMessageSchema).max(200),
  draft:setupDraftSchema, settings:chatSettingsSchema, ready:z.boolean(),
});
export type SearchChat=z.infer<typeof searchChatSchema>;
export type ChatSettings=z.infer<typeof chatSettingsSchema>;
// The model can propose preferences, but cannot change account identity, verified
// email, active strategy, or CV evidence through these fields.
export const chatTurnSchema=z.object({
  reply:z.string().trim().min(1).max(4000),
  // Structured provider output requires every property, including empty strings
  // and arrays. Draft-schema defaults would make those JSON properties optional.
  answers:setupAnswersSchema.omit({cvText:true,cvFileName:true,rolesBasis:true,clarificationBasis:true,locations:true}).extend({
    titles:z.array(z.string().trim().min(2).max(120)).max(4),
    selectedLocations:z.array(searchLocationSchema.safeExtend({city:z.string().trim().max(80),region:z.string().trim().max(80)})).max(maxSearchLocations),
    goalClarifications:z.array(goalClarificationSchema.extend({answer:z.string().trim().max(1200),importance:z.enum(['preference','requirement'])})).max(3),
  }),
  experience:z.string().min(100).max(30000).nullable(),
  settings:chatSettingsSchema, ready:z.boolean(),
});
export type ChatTurn=z.infer<typeof chatTurnSchema>;
export const chatRequestSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('message'),revision:z.number().int().nonnegative(),text:z.string().trim().min(1).max(32000)}),
  z.object({action:z.literal('upload'),revision:z.number().int().nonnegative(),text:z.string().trim().min(100).max(30000),name:z.string().max(200)}),
  z.object({action:z.literal('commit'),revision:z.number().int().nonnegative()}),
]);
