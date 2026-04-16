import type { CurriculumPlan, SubjectRow } from '../types';

/**
 * З21-3/З21-6: Returns subjects sorted so mandatory entries always precede optional ones.
 * The relative order within each group is preserved (stable sort).
 */
export function sortSubjectsMandatoryFirst(subjects: SubjectRow[]): SubjectRow[] {
  return [
    ...subjects.filter((s) => s.part === 'mandatory'),
    ...subjects.filter((s) => s.part === 'optional'),
  ];
}

/**
 * Returns the expected number of teacher-assignment slots for a given class+subject
 * according to the curriculum plan.
 *
 * - groupSplit=false → 1 slot (one teacher for the whole class)
 * - groupSplit=true  → groupCounts[className] (defaults to 2 if not specified)
 * - Subject not found in plan → 1 (safe fallback; caller should validate separately)
 *
 * This is the single authoritative answer to "how many teachers are expected here?"
 * All split-detection logic (detectGroupPairs, validation, assign blocking) should
 * route through this function (RF-W2).
 */
export function getExpectedGroupSlots(plan: CurriculumPlan, className: string, subject: string): number {
  for (const grade of plan.grades) {
    const subjectRow = grade.subjects.find(
      (s) => s.name === subject && (s.hoursPerClass[className] ?? 0) > 0,
    );
    if (subjectRow) {
      return subjectRow.groupSplit ? (plan.groupCounts?.[className] ?? 2) : 1;
    }
  }
  return 1; // not in plan — treat as single slot
}

/**
 * Returns a new CurriculumPlan with className removed from all hoursPerClass maps,
 * from the classNames list, and from groupCounts. Extracted from the deleteClass
 * store action for testability (RF-W7).
 */
export function removeClassFromPlan(plan: CurriculumPlan, className: string): CurriculumPlan {
  const grades = plan.grades.map((g) => {
    const subjects = g.subjects.map((s) => {
      const { [className]: _removed, ...rest } = s.hoursPerClass;
      return { ...s, hoursPerClass: rest };
    });
    const expectedTotals = g.expectedTotals
      ? (() => { const { [className]: _r, ...rest } = g.expectedTotals!; return rest; })()
      : undefined;
    return { ...g, subjects, ...(expectedTotals !== undefined ? { expectedTotals } : {}) };
  });
  const classNames = plan.classNames.filter((cn) => cn !== className);
  const groupCounts = plan.groupCounts
    ? (() => { const { [className]: _r, ...rest } = plan.groupCounts!; return rest as Record<string, 1 | 2>; })()
    : undefined;
  return { ...plan, grades, classNames, ...(groupCounts !== undefined ? { groupCounts } : {}) };
}

/**
 * Toggles groupSplit for a subject across parallels.
 * @param onlyThisGrade  If true, only the given grade is affected; otherwise all grades
 *                       with the same (name, part) are toggled together.
 */
export function applyGroupSplitToggle(
  plan: CurriculumPlan,
  grade: number,
  subjectName: string,
  part: SubjectRow['part'],
  onlyThisGrade: boolean,
): CurriculumPlan {
  return {
    ...plan,
    grades: plan.grades.map((g) => ({
      ...g,
      subjects: g.subjects.map((s) => {
        if (s.name !== subjectName || s.part !== part) return s;
        if (onlyThisGrade && g.grade !== grade) return s;
        return { ...s, groupSplit: !s.groupSplit };
      }),
    })),
  };
}
