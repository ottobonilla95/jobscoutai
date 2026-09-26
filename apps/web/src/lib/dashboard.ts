import type { Store } from '@core/store';
import { integrations } from '@core/config';
export function dashboard(store: Store) { const { profile, version } = store.profile();
  const state = store.state();
  return {
    leads: store.leads(), profile, version, jobs: store.jobs(), runs: store.runs(),
    state: { nextRun: state.next_run ? String(state.next_run) : null, requested: Boolean(state.requested), heartbeat: state.heartbeat ? String(state.heartbeat) : null },
    integrations: integrations(),
    deliveries: store.db.prepare('SELECT id,status,created_at,sent_at,error FROM deliveries ORDER BY created_at DESC LIMIT 20').all().map(row => ({
      id: String(row.id), status: String(row.status), createdAt: String(row.created_at), error: row.error ? String(row.error) : null,
    })),
  };
}
export type DashboardData = ReturnType<typeof dashboard>;
