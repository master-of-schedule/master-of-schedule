/**
 * З21-5: Vacancy teacher summary.
 *
 * Collects all assignments belonging to teachers whose name contains "вакансия"
 * (case-insensitive) and returns them grouped by DeptTable. This tells the
 * principal exactly which subject area needs filling (e.g. "География", not
 * the broader "ХимБиоГео" department).
 */

import type { RNTeacher, Assignment, DeptGroup } from '../types';
import { computeTeacherTotalHours } from './teacherHours';

export interface VacancyTeacherEntry {
  teacherName: string;
  /** Total weekly hours for this vacancy position (bothGroups counted double). */
  totalHours: number;
}

export interface VacancyTableEntry {
  tableName: string;
  teachers: VacancyTeacherEntry[];
}

/** Returns true when the teacher name indicates a vacancy position. */
export function isVacancyTeacher(name: string): boolean {
  return name.toLowerCase().includes('вакансия');
}

/**
 * Builds a compact summary grouped by DeptTable.
 * Each entry lists the vacancy teachers in that table and their total weekly hours.
 * Tables with no vacancy assignments are omitted.
 */
export function buildVacancySummary(
  teachers: RNTeacher[],
  assignments: Assignment[],
  deptGroups: DeptGroup[],
): VacancyTableEntry[] {
  const vacancyTeacherIds = new Set(
    teachers.filter((t) => isVacancyTeacher(t.name)).map((t) => t.id),
  );
  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  if (vacancyTeacherIds.size === 0) return [];

  const vacancyAssignments = assignments.filter((a) => vacancyTeacherIds.has(a.teacherId));
  if (vacancyAssignments.length === 0) return [];

  const result: VacancyTableEntry[] = [];

  for (const group of deptGroups) {
    for (const table of group.tables) {
      const tableVacancyIds = table.teacherIds.filter((id) => vacancyTeacherIds.has(id));
      if (tableVacancyIds.length === 0) continue;

      const entries: VacancyTeacherEntry[] = [];
      for (const tid of tableVacancyIds) {
        const hours = computeTeacherTotalHours(tid, vacancyAssignments);
        if (hours === 0) continue;
        entries.push({
          teacherName: teacherById.get(tid)?.name ?? tid,
          totalHours: hours,
        });
      }
      if (entries.length === 0) continue;

      entries.sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'ru'));
      result.push({ tableName: table.name, teachers: entries });
    }
  }

  return result;
}
