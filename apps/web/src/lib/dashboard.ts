import { minimumSearchIntervalHours } from '@core/search-policy';
import type { Store } from '@core/store';
import { integrations } from '@core/config';
import type { Job } from '@core/profile';

/** Keep worker evidence and hidden editor contents out of browser refreshes. */
export function dashboardJob(job: Job): Job {
  const {description,descriptionCheckedAt,research,researchTask,researchRequested,researchRequestId,feedback,...visible}=job;
  return {...visible,description:null,tracking:job.tracking?{...job.tracking,notes:'',nextAction:''}:undefined};
}

export async function dashboard(store: Store) { const { profile, version } = (await store.profile());
  const state = (await store.state());
  return {
    leads: (await store.leads()), profile, version, jobs: (await store.jobs()).map(dashboardJob), runs: (await store.runs()),
    state: { nextRun: state.next_run ? String(state.next_run) : null, requested: Boolean(state.requested), heartbeat: state.heartbeat ? String(state.heartbeat) : null },
    integrations: integrations(), minimumSearchIntervalHours:minimumSearchIntervalHours(),
    deliveries: (await store.deliveries()).map(row => ({
      id: String(row.id), status: String(row.status), createdAt: String(row.created_at), error: row.error ? String(row.error) : null,
    })),
  };
}
export type DashboardData = Awaited<ReturnType<typeof dashboard>>;
