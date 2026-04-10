import type { CurriculumPlan, SubjectRow } from '../types';

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
