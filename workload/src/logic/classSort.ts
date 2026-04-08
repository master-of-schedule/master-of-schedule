/**
 * Class name sorting utility.
 * Sorts by grade number (5, 6, ..., 10, 11), then by suffix alphabetically.
 */

/** Parse "10-а" → { grade: 10, suffix: "а" }, "5б" → { grade: 5, suffix: "б" } */
export function parseClassName(name: string): { grade: number; suffix: string } {
  const m = name.match(/^(\d+)-?(.*)$/);
  if (!m) return { grade: 0, suffix: name };
  return { grade: parseInt(m[1], 10), suffix: m[2] };
}

/** Compare two class names: grade numerically, then suffix alphabetically (Russian locale). */
export function compareClassNames(a: string, b: string): number {
  const pa = parseClassName(a);
  const pb = parseClassName(b);
  if (pa.grade !== pb.grade) return pa.grade - pb.grade;
  return pa.suffix.localeCompare(pb.suffix, 'ru');
}
