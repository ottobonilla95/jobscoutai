import {z} from 'zod';

const short = z.string().max(200);
const entry = z.object({
  title: short, organization: short, location: short, dates: short,
  details: z.string().max(4000),
}).strict();
export const cvSectionKeys = ['experience', 'projects', 'education', 'courses', 'achievements'] as const;
export type CvSectionKey = typeof cvSectionKeys[number];
export const cvContentSchema = z.object({
  name: short, headline: short, email: z.string().max(200), phone: short, location: short,
  website: z.string().max(500), summary: z.string().max(3000), skills: z.array(short).max(80),
  experience: z.array(entry).max(30), projects: z.array(entry).max(30),
  education: z.array(entry).max(30), courses: z.array(entry).max(30), achievements: z.array(entry).max(30),
}).strict();
export const cvDraftSchema = z.object({
  title: z.string().trim().min(1).max(100),
  template: z.enum(['accent', 'minimal']), language: z.enum(['en', 'es']),
  content: cvContentSchema,
}).strict().refine(value => JSON.stringify(value.content).length <= 60000, 'CV content is too long.');
export type CvEntry = z.infer<typeof entry>;
export type CvDraft = z.infer<typeof cvDraftSchema>;
export type SavedCv = CvDraft & {id:string; revision:number; updatedAt:string};
export const emptyCvEntry = ():CvEntry => ({title:'', organization:'', location:'', dates:'', details:''});
export function emptyCv(name='', language:CvDraft['language']='en'):CvDraft {
  return {title:language==='es'?'Mi CV':'My CV',template:'accent',language,content:{name,headline:'',email:'',phone:'',location:'',website:'',summary:'',skills:[],experience:[],projects:[],education:[],courses:[],achievements:[]}};
}
export const cvLabels = {
  en:{experience:'Work experience',projects:'Projects',education:'Education',courses:'Courses & professional development',achievements:'Achievements',skills:'Skills',summary:'Summary',page:'Page'},
  es:{experience:'Experiencia profesional',projects:'Proyectos',education:'Educación',courses:'Cursos y desarrollo profesional',achievements:'Logros',skills:'Habilidades',summary:'Perfil',page:'Página'},
};
/** Shared by matching and PDF rendering; empty entries never add phantom headings. */
export function hasCvEntry(value:CvEntry) {return Object.values(value).some(text=>text.trim());}
export function cvToText(cv:CvDraft):string {
  const c=cv.content,labels=cvLabels[cv.language];
  const sections=cvSectionKeys.flatMap(key=>{
    const entries=c[key].filter(hasCvEntry);
    return entries.length?[labels[key],...entries.map(e=>[e.title,e.organization,e.dates,e.location,e.details].filter(Boolean).join('\n'))]:[];
  });
  return [c.name,c.headline,[c.email,c.phone,c.location,c.website].filter(Boolean).join(' | '),c.summary,c.skills.length?`${labels.skills}: ${c.skills.join(', ')}`:'',...sections].filter(Boolean).join('\n\n').trim();
}
export function safeCvWebsite(value:string):string|undefined {
  if(!value.trim())return undefined;
  try {const url=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}
}
