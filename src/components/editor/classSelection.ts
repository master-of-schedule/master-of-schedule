import type { SchoolClass } from '@/types';
import { compareClassNames } from '@/utils/formatLesson';

export function groupClassesByGrade(
  classNames: string[],
  gapExcluded: string[]
): [string, string[]][] {
  const groups = new Map<string, string[]>();
  const excludedSet = new Set(gapExcluded);

  for (const name of classNames) {
    const grade = name.match(/^\d+/)?.[0] ?? 'Другие';
    const existing = groups.get(grade) ?? [];
    existing.push(name);
    existing.sort(compareClassNames);
    groups.set(grade, existing);
  }

  const sortByGrade = (a: [string, string[]], b: [string, string[]]) => {
    const numA = parseInt(a[0], 10);
    const numB = parseInt(b[0], 10);
    if (isNaN(numA) && isNaN(numB)) return a[0].localeCompare(b[0], 'ru');
    if (isNaN(numA)) return 1;
    if (isNaN(numB)) return -1;
    return numA - numB;
  };

  const entries = Array.from(groups.entries());
  const normal = entries.filter(([, names]) => names.some(n => !excludedSet.has(n)));
  const allExcluded = entries.filter(([, names]) => names.every(n => excludedSet.has(n)));

  return [...normal.sort(sortByGrade), ...allExcluded.sort(sortByGrade)];
}

export function pickFirstEditableClass(
  classes: SchoolClass[],
  gapExcluded: string[]
): string | undefined {
  if (classes.length === 0) return undefined;
  const ownClasses = classes.filter(c => !c.isPartner);
  const candidates = ownClasses.length > 0 ? ownClasses : classes;
  const sorted = groupClassesByGrade(candidates.map(c => c.name), gapExcluded);
  return sorted[0]?.[1][0] ?? candidates[0]?.name;
}
