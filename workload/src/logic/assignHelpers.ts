/**
 * Pure helpers extracted from AssignPage for testability.
 */

/**
 * З6-5: Determine whether a teacher's cell for a subject should be blocked.
 * A cell is blocked when all available slots are already taken by other teachers.
 */
export function isTeacherBlocked(
  assignedCount: number,
  groupSplit: boolean,
  groupCount: number,
  teacherAlreadyAssigned: boolean,
): boolean {
  const maxTeachers = groupSplit ? groupCount : 1;
  return assignedCount >= maxTeachers && !teacherAlreadyAssigned;
}

/**
 * З12-4 / З12-5: Build the workload summary text for one teacher in one class.
 *
 * - Subjects with 0 hours for that class are omitted (З12-4).
 * - ×2 suffix is added when any assignment in the class has bothGroups=true (З12-5).
 *
 * Returns an entry like "5-а(5/1)" or "5-а(5/1)×2", or just "5-а" / "5-а×2" when
 * the table has a single subject.
 *
 * Returns null when the teacher has no assignments in the given class.
 */
export function buildWorkloadEntry(
  teacherId: string,
  className: string,
  subjectNames: string[],
  getAssignmentHours: (teacherId: string, className: string, subject: string) => number | undefined,
  getBothGroups: (teacherId: string, className: string, subject: string) => boolean,
): string | null {
  const hasAny = subjectNames.some((s) => getAssignmentHours(teacherId, className, s) !== undefined);
  if (!hasAny) return null;

  const hasBothGroups = subjectNames.some((s) => getBothGroups(teacherId, className, s));
  const suffix = hasBothGroups ? '×2' : '';

  if (subjectNames.length === 1) {
    return `${className}${suffix}`;
  }

  const nonZeroHours = subjectNames
    .map((s) => getAssignmentHours(teacherId, className, s) ?? 0)
    .filter((h) => h > 0);

  return `${className}(${nonZeroHours.join('/')})${suffix}`;
}

/**
 * З15-2: Filter class names to those that have at least one subject with non-zero hours
 * for the given table. Catch-all tables (empty subjectFilter) show all classes.
 */
export function visibleClassesForTable(
  classNames: string[],
  isCatchAll: boolean,
  uniqueSubjectNames: string[],
  upHours: (cn: string, subj: string) => number,
): string[] {
  if (isCatchAll) return classNames;
  return classNames.filter((cn) => uniqueSubjectNames.some((s) => upHours(cn, s) > 0));
}

/**
 * З6-7: Compute total planned hours for a set of subjects in one class.
 * For split subjects (groupSplit=true), multiply upHours by groupCount.
 */
export function computeDeptPlanned(
  subjectNames: string[],
  getUpHours: (subject: string) => number,
  isGroupSplit: (subject: string) => boolean,
  groupCount: number,
): number {
  return subjectNames.reduce((sum, s) => {
    const hours = getUpHours(s);
    const gc = isGroupSplit(s) ? groupCount : 1;
    return sum + hours * gc;
  }, 0);
}
