import { z } from 'zod';
import {searchLocationSchema,maxSearchLocations} from './locations';
import { setupDraftSchema } from './setup-schema';
import { strategySchema, defaultStrategy, type Research, type evaluateStrategy } from './strategy';
import { parseBoard } from './source-settings';
import type {SearchDiscovery} from './adaptive-search-schema';
import {goalClarificationsSchema} from './goal-clarifications';

export const profileSchema = z.object({
  onboardingCompleted:z.boolean().default(true),
  setupDraft:setupDraftSchema.nullable().default(null),
  workAuthorization:z.string().max(1000).default(''),
  matchingSummary:z.string().max(1200).default(''),
  goalClarifications:goalClarificationsSchema.default([]), clarificationBasis:z.string().max(70000).default(''),
  emailAlertsRequested:z.boolean().default(false),
  outputLanguage: z.enum(['en','es']).default('en'),
  strategy: strategySchema.default(defaultStrategy),
  postedWithinDays: z.number().int().min(1).max(90).default(7),
  includeUnknownDates: z.boolean().default(true),
  dailyEvaluationLimit: z.number().int().min(1).max(300).default(50),
  name: z.string().trim().max(100),
  objective: z.string().trim().min(10).max(3000),
  cvText: z.string().trim().max(30000),
  cvFileName: z.string().max(200),
  titles: z.array(z.string().trim().min(2).max(120)).min(1).max(4),
  searchLocations:z.array(searchLocationSchema).max(maxSearchLocations).default([]),
  locations: z.array(z.string().trim().max(240)).min(1).max(maxSearchLocations),
  remoteOnly: z.boolean(),
  sources: z.array(z.enum(['linkedin','yc','companies'])).min(1).max(3).default(['linkedin']),
  companyBoards: z.array(z.string().trim().max(250).refine(value => Boolean(parseBoard(value)), 'Use an Ashby or Greenhouse company board URL.')).max(5).default([]),
  discoveredCompanyBoards:z.array(z.string().max(250).refine(v=>Boolean(parseBoard(v)))).max(20).default([]),
  constraints: z.string().trim().max(3000),
  salaryExpectation: z.string().trim().max(300),
  equityExpectation: z.string().trim().max(500),
  email: z.union([z.literal(''), z.email()]),
  intervalHours: z.number().int().min(1).max(168),
  minimumScore: z.number().int().min(0).max(100),
  maxJobsPerRun: z.number().int().min(1).max(30),
  enabled: z.boolean(),
  emailEnabled: z.boolean(),
}).refine(p => !p.sources.includes('companies') || p.companyBoards.length > 0, 'Add at least one company board.');
export type Profile = z.infer<typeof profileSchema>;
export const defaultProfile: Profile = {
  onboardingCompleted:true, setupDraft:null, workAuthorization:'', matchingSummary:'', goalClarifications:[],clarificationBasis:'',emailAlertsRequested:false,
  outputLanguage:'en', strategy: defaultStrategy, postedWithinDays: 7, includeUnknownDates: true, dailyEvaluationLimit: 50,
  name: '',
  objective: 'Find a role that matches my experience, priorities, and career goals.',
  cvText: '', cvFileName: '',
  searchLocations:[], titles: ['Software Engineer'], locations: [''], remoteOnly: false,
  sources: ['linkedin'], companyBoards: [],discoveredCompanyBoards:[],
  constraints: '', salaryExpectation: '', equityExpectation: '', email: '',
  intervalHours: 4, minimumScore: 80, maxJobsPerRun: 10,
  enabled: false, emailEnabled: false,
};

export const assessmentSchema = z.object({
  score: z.number().int().min(0).max(100),
  eligibility: z.enum(['eligible', 'ineligible', 'uncertain']),
  summary: z.string().max(600),
  reasons: z.array(z.string().max(350)).max(4),
  concerns: z.array(z.string().max(350)).max(4),
  salaryEvidence: z.string().max(500).nullable(),
  equityEvidence: z.string().max(500).nullable(),
  founderPathEvidence: z.string().max(500).nullable(),
});
export type Assessment = z.infer<typeof assessmentSchema> & { language?:'en'|'es'; evaluation?: ReturnType<typeof evaluateStrategy> };

export type JobListing = {
  id: string; title: string; company: string; location: string; url: string; postedAt: string | null;
  sourceKey?: string; description?: string | null;
};
export type Job = JobListing & {
  description: string | null; firstSeen: string; lastSeen: string;
  assessment: Assessment | null; status: 'new' | 'saved' | 'dismissed';
  tracking?: Tracking; verification?: Verification | null; duplicateOf?: string | null;
  notifiedAt: string | null; evaluatedVersion: number | null;
};
export type Run = {
  discovery:SearchDiscovery|null;
  id: string; startedAt: string; finishedAt: string | null;
  status: 'running' | 'completed' | 'partial' | 'failed';
  discovered: number; evaluated: number; matched: number; inputTokens: number; outputTokens: number;
  error: string | null;
};

export const trackingSchema=z.object({
  stage:z.enum(['not_recorded','not_applied','applied','interviewing','offer','rejected','withdrawn']).default('not_recorded'),
  recommendation:z.enum(['automatic','apply','apply_verify','research','exclude']).default('automatic'),
  nextAction:z.string().max(1500).default(''), notes:z.string().max(8000).default(''),
  followUp:z.union([z.literal(''),z.iso.date()]).default(''),
});
export type Tracking=z.infer<typeof trackingSchema>;
export type Verification={status:'open'|'closed'|'unknown'; checkedAt:string; applicationUrl:string|null; note:string};
