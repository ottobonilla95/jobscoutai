// The systemd timer checks every 15 minutes. Allow a missed tick before warning;
// the short per-run lease timeout does not describe scheduler availability.
export const workerCheckGraceMs = 30 * 60_000;

export function workerCheckedRecently(heartbeat: string | null, now = Date.now()) {
  if (!heartbeat) return false;
  const checkedAt = Date.parse(heartbeat);
  return Number.isFinite(checkedAt) && checkedAt <= now && now - checkedAt < workerCheckGraceMs;
}
