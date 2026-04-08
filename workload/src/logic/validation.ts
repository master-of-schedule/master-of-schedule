/**
 * Workload validation — checks assignments against СанПиН limits and completeness.
 */

import type { CurriculumPlan, RNTeacher, Assignment, HomeroomAssignment, ValidationIssue } from '../types';
import { sanpinMaxForClass, TEACHER_MAX_HOURS } from './sanpin';

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
 * Total hours assigned per teacher (by teacherId).
 * З7-2: homeroom (Разговоры о важном) is NOT counted — it is paid separately.
 */
export function hoursPerTeacher(
  assignments: Assignment[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const a of assignments) {
    result[a.teacherId] = (result[a.teacherId] ?? 0) + a.hoursPerWeek;
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

export function validateWorkload(
  plan: CurriculumPlan,
  teachers: RNTeacher[],
  assignments: Assignment[],
  homeroomAssignments: HomeroomAssignment[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ── СанПиН per class ──────────────────────────────────────────────────────
  const classTotals = hoursPerClass(assignments);
  // Add Разговоры (1h per class with homeroom)
  for (const h of homeroomAssignments) {
    classTotals[h.className] = (classTotals[h.className] ?? 0) + 1;
  }
  for (const [cn, hours] of Object.entries(classTotals)) {
    const max = sanpinMaxForClass(cn);
    if (max !== null && hours > max) {
      issues.push({
        severity: 'error',
        message: `Класс ${cn}: ${hours} ч/нед превышает СанПиН (макс. ${max})`,
        target: cn,
      });
    } else if (max !== null && hours > max - 2) {
      issues.push({
        severity: 'warning',
        message: `Класс ${cn}: ${hours} ч/нед — близко к лимиту СанПиН (${max})`,
        target: cn,
      });
    }
  }

  // ── Teacher hours ──────────────────────────────────────────────────────────
  const teacherById = Object.fromEntries(teachers.map((t) => [t.id, t]));
  const teacherTotals = hoursPerTeacher(assignments);
  for (const [tid, hours] of Object.entries(teacherTotals)) {
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

  // ── Per-subject over-assignment (З18-3) ────────────────────────────────────
  for (const { className, subject } of allRequiredSubjects(plan)) {
    const subjectAssignments = assignments.filter(
      (a) => a.className === className && a.subject === subject,
    );
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
    }
  }

  return issues;
}
