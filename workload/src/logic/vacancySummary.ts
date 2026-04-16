/**
 * З21-5: Vacancy teacher location summary.
 *
 * Collects all assignments belonging to teachers whose name contains "вакансия"
 * (case-insensitive) and returns them grouped by DeptGroup → DeptTable.
 */

import type { RNTeacher, Assignment, DeptGroup } from '../types';

export interface VacancyItem {
  subject: string;
  /** Sorted class names covered by this vacancy teacher for this subject. */
  classNames: string[];
  /** Teacher name, e.g. "Вакансия (математики)" */
  teacherName: string;
}

export interface VacancyTableEntry {
  tableName: string;
  items: VacancyItem[];
}

export interface VacancyGroupEntry {
  groupName: string;
  tables: VacancyTableEntry[];
}

/** Returns true when the teacher name indicates a vacancy position. */
export function isVacancyTeacher(name: string): boolean {
  return name.toLowerCase().includes('вакансия');
}

/**
 * Builds a summary of where vacancy teachers are assigned, grouped by
 * DeptGroup → DeptTable. Groups and tables with no vacancy assignments are omitted.
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
    const tableEntries: VacancyTableEntry[] = [];

    for (const table of group.tables) {
      const tableVacancyTeacherIds = table.teacherIds.filter((id) => vacancyTeacherIds.has(id));
      if (tableVacancyTeacherIds.length === 0) continue;

      // Assignments from vacancy teachers in this table
      const tableAssignments = vacancyAssignments.filter((a) =>
        tableVacancyTeacherIds.includes(a.teacherId),
      );
      if (tableAssignments.length === 0) continue;

      // Group by (teacherId, subject) → collect classNames
      const key = (a: Assignment) => `${a.teacherId}::${a.subject}`;
      const grouped = new Map<string, { teacherId: string; subject: string; classNames: string[] }>();
      for (const a of tableAssignments) {
        const k = key(a);
        const entry = grouped.get(k);
        if (entry) {
          entry.classNames.push(a.className);
        } else {
          grouped.set(k, { teacherId: a.teacherId, subject: a.subject, classNames: [a.className] });
        }
      }

      const items: VacancyItem[] = [...grouped.values()].map(({ teacherId, subject, classNames }) => ({
        subject,
        classNames: [...classNames].sort(),
        teacherName: teacherById.get(teacherId)?.name ?? teacherId,
      }));

      // Sort items by subject name
      items.sort((a, b) => a.subject.localeCompare(b.subject, 'ru'));

      tableEntries.push({ tableName: table.name, items });
    }

    if (tableEntries.length > 0) {
      result.push({ groupName: group.name, tables: tableEntries });
    }
  }

  return result;
}
