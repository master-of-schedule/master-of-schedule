/**
 * Output generator: converts РН assignments → LessonRequirement rows
 * that can be directly imported into РШР via data.xlsx.
 */

import type { Assignment, RNTeacher, HomeroomAssignment, GroupPair, CurriculumPlan } from '../types';
import type { LessonRequirement } from '../types';
import { groupPairNames } from './groupNames';
import { getExpectedGroupSlots } from './planUtils';

function makeIdGenerator(): () => string {
  let counter = 0;
  return () => `rn-${++counter}`;
}

/**
 * Detect group pairs from assignments:
 * - Two teachers assigned to the same class+subject = standard split pair.
 * - One teacher with bothGroups=true = single teacher takes both group slots (З6-8).
 *
 * @param groupNameOverrides  Optional З6-9 user-defined name overrides
 *                            (overrides[className][subject] = [nameA, nameB])
 * @param plan  When provided, validates that the assignment count matches the plan's
 *              expected slot count before emitting a pair (RF-W3). Assignments that
 *              don't match plan expectations are skipped here and should be surfaced
 *              as validation issues via validateWorkload.
 */
export function detectGroupPairs(
  assignments: Assignment[],
  teachers: RNTeacher[],
  groupNameOverrides?: Record<string, Record<string, [string, string]>>,
  plan?: CurriculumPlan,
): GroupPair[] {
  const byClassSubject = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const key = `${a.className}::${a.subject}`;
    const existing = byClassSubject.get(key) ?? [];
    byClassSubject.set(key, [...existing, a]);
  }

  const teacherById = Object.fromEntries(teachers.map((t) => [t.id, t]));
  const pairs: GroupPair[] = [];

  for (const [key, group] of byClassSubject.entries()) {
    const [className, subject] = key.split('::');
    const override = groupNameOverrides?.[className]?.[subject];

    if (group.length === 2) {
      // Standard split: two different teachers.
      // When plan is provided, only emit a pair if the plan expects ≥2 slots.
      // A 2-teacher assignment on a non-split subject is a validation error, not a pair.
      if (plan && getExpectedGroupSlots(plan, className, subject) < 2) continue;

      const [a, b] = group;
      const teacherA = teacherById[a.teacherId];
      const teacherB = teacherById[b.teacherId];
      if (!teacherA || !teacherB) continue;

      const [nameA, nameB] = override ?? groupPairNames(a.className, teacherA.initials, teacherB.initials);
      pairs.push({
        className: a.className,
        subject,
        teacherAId: a.teacherId,
        teacherBId: b.teacherId,
        groupNameA: nameA,
        groupNameB: nameB,
      });
    } else if (group.length === 1 && group[0].bothGroups) {
      // З6-8: single teacher handles both groups.
      const a = group[0];
      const teacher = teacherById[a.teacherId];
      if (!teacher) continue;

      const [nameA, nameB] = override ?? [`${a.className} (гр.1)`, `${a.className} (гр.2)`];
      pairs.push({
        className: a.className,
        subject,
        teacherAId: a.teacherId,
        teacherBId: a.teacherId, // same teacher for both groups
        groupNameA: nameA,
        groupNameB: nameB,
      });
    }
  }

  return pairs;
}

/**
 * Generate all LessonRequirement rows from current РН state.
 *
 * Rules:
 * - Single teacher for class+subject → type='class', classOrGroup=className
 * - Two teachers for class+subject → type='group', classOrGroup=groupName, className=className,
 *   parallelGroup=otherGroupName
 * - One teacher with bothGroups=true → type='group', generates two rows with same teacher
 * - Homeroom assignments → type='class', subject='Разговоры о важном', countPerWeek=1
 */
export function generateOutput(
  assignments: Assignment[],
  teachers: RNTeacher[],
  homeroomAssignments: HomeroomAssignment[],
  groupNameOverrides?: Record<string, Record<string, [string, string]>>,
  plan?: CurriculumPlan,
): LessonRequirement[] {
  const nextId = makeIdGenerator();
  const teacherById = Object.fromEntries(teachers.map((t) => [t.id, t]));
  const groupPairs = detectGroupPairs(assignments, teachers, groupNameOverrides, plan);
  const groupPairKeys = new Set(groupPairs.map((p) => `${p.className}::${p.subject}`));

  const result: LessonRequirement[] = [];

  // ── Regular (non-group) assignments ───────────────────────────────────────
  for (const a of assignments) {
    const key = `${a.className}::${a.subject}`;
    if (groupPairKeys.has(key)) continue; // handled below as group pairs

    const teacher = teacherById[a.teacherId];
    if (!teacher) continue;

    result.push({
      id: nextId(),
      type: 'class',
      classOrGroup: a.className,
      subject: a.subject,
      teacher: teacher.name,
      countPerWeek: a.hoursPerWeek,
    });
  }

  // ── Group-split assignments ────────────────────────────────────────────────
  for (const pair of groupPairs) {
    const aAssignment = assignments.find(
      (a) => a.teacherId === pair.teacherAId && a.className === pair.className && a.subject === pair.subject,
    );
    // For bothGroups pairs (teacherA === teacherB), reuse aAssignment for the second row
    const bAssignment =
      pair.teacherBId === pair.teacherAId
        ? aAssignment
        : assignments.find(
            (a) => a.teacherId === pair.teacherBId && a.className === pair.className && a.subject === pair.subject,
          );

    const teacherA = teacherById[pair.teacherAId];
    const teacherB = teacherById[pair.teacherBId];
    if (!teacherA || !teacherB || !aAssignment || !bAssignment) continue;

    result.push({
      id: nextId(),
      type: 'group',
      classOrGroup: pair.groupNameA,
      className: pair.className,
      subject: pair.subject,
      teacher: teacherA.name,
      countPerWeek: aAssignment.hoursPerWeek,
      parallelGroup: pair.groupNameB,
    });
    result.push({
      id: nextId(),
      type: 'group',
      classOrGroup: pair.groupNameB,
      className: pair.className,
      subject: pair.subject,
      teacher: teacherB.name,
      countPerWeek: bAssignment.hoursPerWeek,
      parallelGroup: pair.groupNameA,
    });
  }

  // ── Разговоры о важном (homeroom) ──────────────────────────────────────────
  for (const h of homeroomAssignments) {
    const teacher = teacherById[h.teacherId];
    if (!teacher) continue;
    result.push({
      id: nextId(),
      type: 'class',
      classOrGroup: h.className,
      subject: 'Разговоры о важном',
      teacher: teacher.name,
      countPerWeek: 1,
    });
  }

  return result;
}
