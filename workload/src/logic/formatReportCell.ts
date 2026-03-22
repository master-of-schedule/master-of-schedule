/**
 * Utilities for formatting class-hours cells in the official workload report.
 *
 * Two cell formats are supported:
 *  - Simple:   "5-а,б,в(6), 7-а(3)"  (compact when multiple classes of same grade + equal hours)
 *  - Compound: "7-г(3/2/1)"           (slash-separated hours per sub-subject, always individual)
 */

export type GradeRange = '5-9' | '10-11';

/** Extracts the leading grade number from a class name. "5а" → 5, "10б" → 10. */
export function gradeFromClassName(cn: string): number {
  const m = cn.match(/^(\d{1,2})/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Extracts the letter suffix from a class name. "5а" → "а", "10б" → "б", "5мк" → "мк". */
function suffixFromClassName(cn: string): string {
  return cn.replace(/^\d{1,2}/, '');
}

/** Formats a class name for display: "5а" → "5-а", "10б" → "10-б". */
function displayClass(cn: string): string {
  const grade = gradeFromClassName(cn);
  const suffix = suffixFromClassName(cn);
  return suffix ? `${grade}-${suffix}` : String(grade);
}

function matchesRange(grade: number, range: GradeRange): boolean {
  return range === '5-9' ? grade >= 5 && grade <= 9 : grade >= 10 && grade <= 11;
}

/**
 * Formats a list of {className, hours} entries into a compact display string.
 *
 * Compact rule: if multiple classes of the same grade all have equal hours,
 * they are grouped as "N-а,б,в(totalHours)" where totalHours = count × hours.
 * Otherwise each class is shown individually: "N-а(h1), N-б(h2)".
 *
 * @param entries  All assignments for one teacher + one simple subject
 * @param range    Which grade range to include ('5-9' or '10-11')
 */
export function formatSimpleClasses(
  entries: { className: string; hours: number }[],
  range: GradeRange,
): string {
  const filtered = entries.filter((e) => matchesRange(gradeFromClassName(e.className), range));
  if (filtered.length === 0) return '';

  filtered.sort((a, b) => {
    const ga = gradeFromClassName(a.className);
    const gb = gradeFromClassName(b.className);
    if (ga !== gb) return ga - gb;
    return suffixFromClassName(a.className).localeCompare(suffixFromClassName(b.className), 'ru');
  });

  // Group by grade
  const byGrade = new Map<number, { className: string; hours: number }[]>();
  for (const e of filtered) {
    const g = gradeFromClassName(e.className);
    if (!byGrade.has(g)) byGrade.set(g, []);
    byGrade.get(g)!.push(e);
  }

  const parts: string[] = [];
  for (const [grade, items] of byGrade) {
    const allEqual = items.every((i) => i.hours === items[0].hours);
    if (allEqual && items.length > 1) {
      // Compact: "5-а,б,в(8)" — suffixes joined by comma, total in parens
      const suffixes = items.map((i) => suffixFromClassName(i.className) || String(grade)).join(',');
      const total = items.reduce((s, i) => s + i.hours, 0);
      parts.push(`${grade}-${suffixes}(${total})`);
    } else {
      // Individual: "5-а(2), 5-б(3)"
      for (const item of items) {
        parts.push(`${displayClass(item.className)}(${item.hours})`);
      }
    }
  }

  return parts.join(', ');
}

/**
 * Formats class entries for compound subjects (Рус+Лит, Алг+Геом+Вер).
 * Each class is always shown individually with slash-separated hours per sub-subject.
 *
 * Example: [{className: "7г", hoursPerSubject: [3, 2]}] → "7-г(3/2)"
 *
 * @param entries  Per-class compound hours; hoursPerSubject.length = number of sub-subjects
 * @param range    Which grade range to include
 */
export function formatCompoundClasses(
  entries: { className: string; hoursPerSubject: number[] }[],
  range: GradeRange,
): string {
  const filtered = entries.filter((e) => matchesRange(gradeFromClassName(e.className), range));
  if (filtered.length === 0) return '';

  filtered.sort((a, b) => {
    const ga = gradeFromClassName(a.className);
    const gb = gradeFromClassName(b.className);
    if (ga !== gb) return ga - gb;
    return suffixFromClassName(a.className).localeCompare(suffixFromClassName(b.className), 'ru');
  });

  return filtered
    .map((e) => `${displayClass(e.className)}(${e.hoursPerSubject.join('/')})`)
    .join(', ');
}
