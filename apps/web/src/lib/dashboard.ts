import type { Store } from '@core/store';
import { integrations } from '@core/config';
export async function dashboard(store: Store) { const { profile, version } = (await store.profile());
  const state = (await store.state());
  return {
    leads: (await store.leads()), profile, version, jobs: (await store.jobs()), runs: (await store.runs()),
    state: { nextRun: state.next_run ? String(state.next_run) : null, requested: Boolean(state.requested), heartbeat: state.heartbeat ? String(state.heartbeat) : null },
    integrations: integrations(),
    deliveries: (await store.deliveries()).map(row => ({
      id: String(row.id), status: String(row.status), createdAt: String(row.created_at), error: row.error ? String(row.error) : null,
    })),
  };
}
export type DashboardData = Awaited<ReturnType<typeof dashboard>>;
