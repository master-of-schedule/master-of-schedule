/**
 * З23-3: Detect teacher records that look like near-duplicates.
 *
 * Rationale: a stakeholder file contained two teacher rows for the same
 * person — the patronymic on one row was missing a single letter
 * ("Анатольевна" vs "Анаольевна"). The department import had created
 * the dup silently, and assignments attached to the wrong record. We
 * surface such pairs on the Teachers page so the user can merge them.
 */

import type { RNTeacher } from '../types';

export interface DuplicatePair {
  a: RNTeacher;
  b: RNTeacher;
  /** Levenshtein distance between the normalized full names (0–2) */
  distance: number;
}

/** Max edit distance on the normalized full name to flag a pair as suspicious. */
const MAX_DISTANCE = 2;

/**
 * Normalize a name for comparison: lowercase, trim, collapse internal whitespace,
 * unify dash characters, and map Russian "ё" → "е" (a frequent spelling variant).
 */
export function normalizeTeacherName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein distance with early-exit when the running minimum exceeds `maxDistance`.
 * Iterative, O(m*n) time, O(min(m,n)) space.
 */
export function levenshtein(a: string, b: string, maxDistance: number = Infinity): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  // Ensure b is the shorter one so the row array stays small
  if (a.length < b.length) {
    const tmp = a; a = b; b = tmp;
  }

  let prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  const curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,      // insertion
        prev[j] + 1,          // deletion
        prev[j - 1] + cost,   // substitution
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    // swap prev and curr
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/**
 * Return all pairs of teachers whose normalized names differ by ≤ MAX_DISTANCE
 * edits. Self-pairs and exact duplicates (distance 0) on different IDs are
 * both flagged — distance 0 with different IDs is always suspicious.
 *
 * Deterministic ordering: within each pair, teacher `a` is the one with the
 * lexicographically smaller id; the returned array is sorted by (a.id, b.id)
 * so output does not depend on input order.
 */
export function findDuplicateTeachers(teachers: RNTeacher[]): DuplicatePair[] {
  const normalized = teachers.map((t) => ({ t, norm: normalizeTeacherName(t.name) }));
  const pairs: DuplicatePair[] = [];

  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const d = levenshtein(normalized[i].norm, normalized[j].norm, MAX_DISTANCE);
      if (d <= MAX_DISTANCE) {
        const [a, b] = normalized[i].t.id < normalized[j].t.id
          ? [normalized[i].t, normalized[j].t]
          : [normalized[j].t, normalized[i].t];
        pairs.push({ a, b, distance: d });
      }
    }
  }

  pairs.sort((x, y) => {
    if (x.a.id !== y.a.id) return x.a.id < y.a.id ? -1 : 1;
    return x.b.id < y.b.id ? -1 : 1;
  });
  return pairs;
}
