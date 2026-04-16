/**
 * Workload validation — checks assignments against СанПиН limits and completeness.
 */

import type { CurriculumPlan, RNTeacher, Assignment, HomeroomAssignment, ValidationIssue } from '../types';
import { sanpinMaxForClass, TEACHER_MAX_HOURS } from './sanpin';
import { computeTeacherTotalHours } from './teacherHours';

/**
 * Total hours assigned per class across all assignments.
 *
 * For groupSplit subjects, two assignments exist for the same className+subject
 * (one per teacher). Each teacher is paid for those hours, but the class only
 * has that subject once per week — counting both would double the class total
 * and produce false СанПиН overload errors (З17-1).
 * Deduplication: only the first occurrence of each className+subject is counted.
 */
export function hoursPerClass(assignments: Assignment[]): Record<string, number> {
  const result: Record<string, number> = {};
  const seen = new Set<string>();
  for (const a of assignments) {
    const key = `${a.className}::${a.subject}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result[a.className] = (result[a.className] ?? 0) + a.hoursPerWeek;
  }
  return result;
}

/**
 * RF-W4: Find className+subject pairs where two split assignments carry different hoursPerWeek.
 * Returns entries where the two halves disagree, as a list of {className, subject, hours}.
 */
export function findDivergentSplitHours(
  assignments: Assignment[],
): { className: string; subject: string; hours: number[] }[] {
  const grouped = new Map<string, number[]>();
  for (const a of assignments) {
    const key = `${a.className}::${a.subject}`;
    const existing = grouped.get(key) ?? [];
    grouped.set(key, [...existing, a.hoursPerWeek]);
  }
  const result: { className: string; subject: string; hours: number[] }[] = [];
  for (const [key, hours] of grouped.entries()) {
    if (hours.length < 2) continue;
    const allSame = hours.every((h) => h === hours[0]);
    if (!allSame) {
      const [className, subject] = key.split('::');
      result.push({ className, subject, hours });
    }
  }
  return result;
}

/**
 * Total UP hours required for a class (sum of all subject hours in plan for that class).
 */
export function requiredHoursForClass(plan: CurriculumPlan, className: string): number {
  let total = 0;
  for (const grade of plan.grades) {
    for (const subject of grade.subjects) {
      total += subject.hoursPerClass[className] ?? 0;
    }
  }
  return total;
}

/** All subject+class combinations that have hours in the UP */
export function allRequiredSubjects(plan: CurriculumPlan): { className: string; subject: string; hours: number }[] {
  const result: { className: string; subject: string; hours: number }[] = [];
  for (const grade of plan.grades) {
    for (const subject of grade.subjects) {
      for (const [className, hours] of Object.entries(subject.hoursPerClass)) {
        if (hours > 0) result.push({ className, subject: subject.name, hours });
      }
    }
  }
  return result;
}

/**
 * Build a subject breakdown string for a class, sorted by hours descending.
 * Used in SanPiN overload messages to show what's contributing to the total.
 */
function classSubjectBreakdown(className: string, assignments: Assignment[]): string {
  const seen = new Set<string>();
  const subjects: { name: string; hours: number }[] = [];
  for (const a of assignments) {
    if (a.className !== className) continue;
    const key = `${a.className}::${a.subject}`;
    if (seen.has(key)) continue;
    seen.add(key);
    subjects.push({ name: a.subject, hours: a.hoursPerWeek });
  }
  subjects.sort((a, b) => b.hours - a.hours);
  return subjects.map(s => `${s.name} ${s.hours}ч`).join(', ');
}

export function validateWorkload(
  plan: CurriculumPlan,
  teachers: RNTeacher[],
  assignments: Assignment[],
  _homeroomAssignments: HomeroomAssignment[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ── RF-W4: Divergent hours between split halves ───────────────────────────
  for (const { className, subject, hours } of findDivergentSplitHours(assignments)) {
    issues.push({
      severity: 'warning',
      message: `${className}: «${subject}» — часы у половин группы расходятся (${hours.join(', ')} ч/нед)`,
      target: className,
    });
  }

  // ── СанПиН per class ──────────────────────────────────────────────────────
  // NOTE: «Разговоры о важном» (homeroomAssignments) is a mandatory extracurricular
  // event, NOT part of the academic UP load. It does not count against the SanPiN
  // academic hour limit, so it is intentionally excluded from this check.
  const classTotals = hoursPerClass(assignments);
  for (const [cn, hours] of Object.entries(classTotals)) {
    const max = sanpinMaxForClass(cn);
    if (max !== null && hours > max) {
      issues.push({
        severity: 'error',
        message: `Класс ${cn}: ${hours} ч/нед превышает СанПиН (макс. ${max})`,
        detail: `Предметы: ${classSubjectBreakdown(cn, assignments)}`,
        target: cn,
      });
    }
  }

  // ── Teacher hours ──────────────────────────────────────────────────────────
  // Uses computeTeacherTotalHours (bothGroups × 2) — consistent with UI display.
  const teacherById = Object.fromEntries(teachers.map((t) => [t.id, t]));
  const teacherIds = [...new Set(assignments.map((a) => a.teacherId))];
  for (const tid of teacherIds) {
    const hours = computeTeacherTotalHours(tid, assignments);
    const teacher = teacherById[tid];
    const name = teacher?.name ?? tid;
    if (hours > TEACHER_MAX_HOURS) {
      issues.push({
        severity: 'error',
        message: `${name}: ${hours} ч/нед превышает максимум (${TEACHER_MAX_HOURS})`,
        target: name,
      });
    }
  }

  // ── Unassigned UP subjects ─────────────────────────────────────────────────
  const assignedKeys = new Set(
    assignments.map((a) => `${a.className}::${a.subject}`),
  );
  for (const { className, subject } of allRequiredSubjects(plan)) {
    if (!assignedKeys.has(`${className}::${subject}`)) {
      issues.push({
        severity: 'warning',
        message: `${className}: предмет «${subject}» не назначен`,
        target: className,
      });
    }
  }

  // ── Per-subject slot-count check (З18-3 + RF-W3) ─────────────────────────
  for (const { className, subject } of allRequiredSubjects(plan)) {
    const subjectAssignments = assignments.filter(
      (a) => a.className === className && a.subject === subject,
    );
    if (subjectAssignments.length === 0) continue; // "не назначен" check above covers this
    const assignedSlots = subjectAssignments.reduce(
      (sum, a) => sum + (a.bothGroups ? 2 : 1), 0,
    );
    const subjectRow = plan.grades
      .flatMap((g) => g.subjects)
      .find((s) => s.name === subject && (s.hoursPerClass[className] ?? 0) > 0);
    if (!subjectRow) continue;
    const gc = subjectRow.groupSplit ? (plan.groupCounts?.[className] ?? 2) : 1;
    if (assignedSlots > gc) {
      issues.push({
        severity: 'warning',
        message: `${className}: «${subject}» — назначено учителей: ${assignedSlots}, по плану: ${gc}`,
        target: className,
      });
    } else if (assignedSlots < gc) {
      // RF-W3: split subject assigned to fewer teachers than expected (e.g. one teacher, no bothGroups)
      issues.push({
        severity: 'warning',
        message: `${className}: «${subject}» — не хватает учителей: назначено ${assignedSlots}, по плану: ${gc}`,
        target: className,
      });
    }
  }

  return issues;
}
