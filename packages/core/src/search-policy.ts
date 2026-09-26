/** Server-side policy. Do not expose environment access to client components. */
export function minimumSearchIntervalHours() {
  const value=Number(process.env.MIN_SEARCH_INTERVAL_HOURS ?? 4);
  return Number.isInteger(value)&&value>=2&&value<=168 ? value : 4;
}
