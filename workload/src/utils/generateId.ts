/** Generate a unique ID combining timestamp and random suffix. */
export function generateId(prefix?: string): string {
  const suffix = Math.random().toString(36).slice(2, 7);
  return prefix ? `${prefix}-${Date.now()}-${suffix}` : `${Date.now()}-${suffix}`;
}
