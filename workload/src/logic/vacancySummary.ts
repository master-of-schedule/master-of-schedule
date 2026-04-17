/**
 * З21-5: Vacancy teacher summary.
 *
 * Collects all assignments belonging to teachers whose name contains "вакансия"
 * (case-insensitive) and returns them grouped by DeptGroup with total hours per
 * vacancy teacher. Gives the principal a compact view of how many hours need
 * filling per department.
 */

import type { RNTeacher, Assignment, DeptGroup } from '../types';
import { computeTeacherTotalHours } from './teacherHours';

export interface VacancyTeacherEntry {
  teacherName: string;
  /** Total weekly hours for this vacancy position (bothGroups counted double). */
  totalHours: number;
}

export interface VacancyGroupEntry {
  groupName: string;
  teachers: VacancyTeacherEntry[];
}

/** Returns true when the teacher name indicates a vacancy position. */
export function isVacancyTeacher(name: string): boolean {
  return name.toLowerCase().includes('вакансия');
}

/**
 * Builds a compact summary grouped by DeptGroup.
 * Each entry lists the vacancy teachers in that group and their total weekly hours.
 * Groups with no vacancy assignments are omitted.
 */
export function buildVacancySummary(
  teachers: RNTeacher[],
  assignments: Assignment[],
  deptGroups: DeptGroup[],
): VacancyGroupEntry[] {
  const vacancyTeacherIds = new Set(
    teachers.filter((t) => isVacancyTeacher(t.name)).map((t) => t.id),
  );
  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  if (vacancyTeacherIds.size === 0) return [];

  const vacancyAssignments = assignments.filter((a) => vacancyTeacherIds.has(a.teacherId));
  if (vacancyAssignments.length === 0) return [];

  const result: VacancyGroupEntry[] = [];

  for (const group of deptGroups) {
    // Collect all vacancy teacher IDs that appear in any table of this group
    const groupVacancyIds = new Set<string>();
    for (const table of group.tables) {
      for (const tid of table.teacherIds) {
        if (vacancyTeacherIds.has(tid)) groupVacancyIds.add(tid);
      }
    }
    if (groupVacancyIds.size === 0) continue;

    const teachers_: VacancyTeacherEntry[] = [];
    for (const tid of groupVacancyIds) {
      const hours = computeTeacherTotalHours(tid, vacancyAssignments);
      if (hours === 0) continue;
      teachers_.push({
        teacherName: teacherById.get(tid)?.name ?? tid,
        totalHours: hours,
      });
    }
    if (teachers_.length === 0) continue;

    // Sort by teacher name
    teachers_.sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'ru'));
    result.push({ groupName: group.name, teachers: teachers_ });
  }

  return result;
}
