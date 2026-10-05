import {z} from 'zod';
import {parseBoard} from './source-settings';
export const discoveredBoardSchema=z.object({url:z.string().max(250).refine(v=>Boolean(parseBoard(v))),sourceUrl:z.url().max(1000),discoveredAt:z.string()});
export const searchAttemptSchema=z.object({source:z.string().max(150),query:z.string().max(120),location:z.string().max(240),page:z.number().int().min(0).max(2),status:z.enum(['ok','blocked']),found:z.number().int().nonnegative(),checkedAt:z.string()});
export const discoveryStateSchema=z.object({attempts:z.array(searchAttemptSchema).max(120),boards:z.array(discoveredBoardSchema).max(20)});
export type DiscoveryState=z.infer<typeof discoveryStateSchema>;
export const discoveryRoundSchema=z.object({round:z.number().int().min(0).max(2),reason:z.string().max(400),newCandidates:z.number().int().nonnegative(),strongCandidates:z.number().int().nonnegative(),attempts:z.array(searchAttemptSchema).max(24),generationId:z.string().nullable(),queries:z.array(z.string().max(120)).max(8),boards:z.array(z.string().max(250)).max(20)});
export const searchDiscoverySchema=z.object({profileVersion:z.number().int(),rounds:z.array(discoveryRoundSchema).max(3),requests:z.number().int().min(0).max(24),requestLimit:z.literal(24),stopReason:z.enum(['sufficient_matches','round_limit','request_budget','evaluation_budget','time_budget','profile_changed','no_untried_queries','sources_unavailable','planner_unavailable'])});
export type SearchDiscovery=z.infer<typeof searchDiscoverySchema>;
