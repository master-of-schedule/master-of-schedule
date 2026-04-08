/** Generate a unique ID combining timestamp and random suffix. */
export function generateId(prefix?: string): string {
  const suffix = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}-${Date.now()}-${suffix}` : `${Date.now()}-${suffix}`;
}
