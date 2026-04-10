/**
 * Builds the official "Нагрузка учителей" report data model.
 *
 * The report corresponds to the official school workload document (Word/PDF):
 * - One table with subjects in a fixed Russian ФОП order
 * - Two hardcoded compound subject groups (Рус+Лит; Алг+Геом+Вер)
 * - Compact class-hours notation per teacher
 * - Separate electives section for optional subjects (grades 10-11)
 * - Summary totals at the end
 */

import type { Assignment, RNTeacher, HomeroomAssignment, CurriculumPlan, DeptGroup } from '../types';
import { gradeFromClassName, formatSimpleClasses, formatCompoundClasses } from './formatReportCell';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReportTeacherRow {
  teacherName: string;
  homeroomClass: string | null;
  cells5to9: string;
  cells10to11: string;
  totalHours: number;
}

export interface SubjectBreakdown {
  name: string;
  total: number;
  hours5to9: number;
  hours10to11: number;
}

export interface ReportSubjectGroup {
  /** Display name shown in yellow cell, e.g. "Русский язык, Литература" or "Физика" */
  displayName: string;
  /** Actual subject names matched from assignments (may differ from canonical by case/suffix) */
  subjects: string[];
  isCompound: boolean;
  totalHours: number;
  hours5to9: number;
  hours10to11: number;
  /** Non-empty only for compound groups */
  subjectBreakdown: SubjectBreakdown[];
  teachers: ReportTeacherRow[];
  /** Set on the first subject group of each department section when dept-ordered. */
  deptLabel?: string;
}

export interface ElectiveRow {
  className: string;
  hours: number;
  teacherName: string;
}

export interface ElectiveCourse {
  name: string;
  totalHours: number;
  rows: ElectiveRow[];
}

export interface ReportSummary {
  mandatory59NoSplit: number;
  mandatory59Split: number;
  optional59: number;
  mandatory1011NoSplit: number;
  mandatory1011Split: number;
  optional1011: number;
  total59: number;
  total1011: number;
  grandTotal: number;
}

export interface OfficialReport {
  variantDate: string;
  variantLabel: string;
  /** Auto-computed school year, e.g. "2025-2026" */
  schoolYear: string;
  subjectGroups: ReportSubjectGroup[];
  electives: ElectiveCourse[];
  summary: ReportSummary;
}

// ─── Constants ────────────────────────────────────────────────────────────────

interface CompoundDef {
  /** Canonical prefixes for startsWith matching */
  prefixes: string[];
}

const COMPOUND_DEFS: CompoundDef[] = [
  { prefixes: ['Русский язык', 'Литература'] },
  { prefixes: ['Алгебра', 'Геометрия', 'Вероятность'] },
];

/**
 * Fixed ФОП subject order (canonical prefixes for matching).
 * The compound group anchor is the FIRST subject in each compound pair.
 * Subjects absent from assignments are simply skipped.
 */
const SUBJECT_ORDER_PREFIXES: string[] = [
  'Русский язык',
  'Математика',
  'Английский язык',
  'Испанский язык',
  'Немецкий язык',
  'История',
  'Обществознание',
  'География',
  'Биология',
  'Естествознание',
  'Физика',
  'Химия',
  'Музыка',
  'Искусство',
  'Физическая культура',
  'Основы безопасности',
  'Труд',
  'Информатика',
  'Основы проектной деятельности',
  'Индивидуальный проект',
  'Разговоры о важном',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function matchesPrefix(actual: string, prefix: string): boolean {
  return actual.toLowerCase().startsWith(prefix.toLowerCase());
}

/** Returns the compound def index (0 or 1) if the subject belongs to a compound group, else -1. */
function compoundIndex(subject: string): number {
  return COMPOUND_DEFS.findIndex((def) =>
    def.prefixes.some((p) => matchesPrefix(subject, p)),
  );
}

/** Returns the prefix index within a compound def (which sub-subject position). */
function compoundSubjectPosition(subject: string, defIdx: number): number {
  return COMPOUND_DEFS[defIdx].prefixes.findIndex((p) => matchesPrefix(subject, p));
}

function subjectOrderIndex(subject: string): number {
  // Check compound: if it's in compound group, use the FIRST prefix as anchor
  const ci = compoundIndex(subject);
  if (ci >= 0) {
    const anchorPrefix = COMPOUND_DEFS[ci].prefixes[0];
    const idx = SUBJECT_ORDER_PREFIXES.findIndex((p) => matchesPrefix(anchorPrefix, p));
    return idx >= 0 ? idx : SUBJECT_ORDER_PREFIXES.length;
  }
  const idx = SUBJECT_ORDER_PREFIXES.findIndex((p) => matchesPrefix(subject, p));
  return idx >= 0 ? idx : SUBJECT_ORDER_PREFIXES.length;
}

/**
 * Auto-computes school year from a date string (YYYY-MM-DD).
 * Aug–Dec YYYY → "YYYY/(YYYY+1)", Jan–Jul YYYY → "(YYYY-1)/YYYY".
 */
export function schoolYearFromDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-based
  const y1 = month >= 8 ? year : year - 1;
  return `${y1}-${y1 + 1}`;
}

// ─── Dept ordering ────────────────────────────────────────────────────────────

/**
 * Returns [deptGroupIndex, tableIndex] of the first dept table that matches
 * one of the subject names, or null if no match. Catch-all tables (empty
 * subjectFilter) are skipped — they never win a position match.
 */
function findDeptPosition(
  subjectNames: string[],
  deptGroups: DeptGroup[],
): [number, number] | null {
  for (let gi = 0; gi < deptGroups.length; gi++) {
    const group = deptGroups[gi];
    for (let ti = 0; ti < group.tables.length; ti++) {
      const table = group.tables[ti];
      if (table.subjectFilter.length === 0) continue;
      if (subjectNames.some((s) => table.subjectFilter.includes(s))) {
        return [gi, ti];
      }
    }
  }
  return null;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildOfficialReport(
  plan: CurriculumPlan,
  assignments: Assignment[],
  teachers: RNTeacher[],
  homeroomAssignments: HomeroomAssignment[],
  variantDate: string,
  variantLabel: string,
  deptGroups?: DeptGroup[],
): OfficialReport {
  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const homeroomMap = new Map(homeroomAssignments.map((h) => [h.teacherId, h.className]));

  // Build a lookup: subjectName → part ('mandatory' | 'optional') per grade
  function getSubjectPart(subjectName: string, grade: number): 'mandatory' | 'optional' {
    const block = plan.grades.find((g) => g.grade === grade);
    const row = block?.subjects.find((s) => s.name === subjectName);
    return row?.part ?? 'mandatory';
  }

  function isGroupSplit(subjectName: string, grade: number): boolean {
    const block = plan.grades.find((g) => g.grade === grade);
    const row = block?.subjects.find((s) => s.name === subjectName);
    return row?.groupSplit ?? false;
  }

  // Separate elective assignments (optional part, grades 10-11) from main-table assignments
  const electiveAssignments: Assignment[] = [];
  const mainAssignments: Assignment[] = [];

  for (const a of assignments) {
    const grade = gradeFromClassName(a.className);
    if (grade >= 10 && getSubjectPart(a.subject, grade) === 'optional') {
      electiveAssignments.push(a);
    } else {
      mainAssignments.push(a);
    }
  }

  // ─── Build compound groups ─────────────────────────────────────────────────

  // Map from compound def index → actual subject names found in assignments
  const compoundSubjectNames: Map<number, string[]> = new Map(
    COMPOUND_DEFS.map((_, i) => [i, []]),
  );
  const handledSubjects = new Set<string>();

  for (const a of mainAssignments) {
    const ci = compoundIndex(a.subject);
    if (ci >= 0) {
      const names = compoundSubjectNames.get(ci)!;
      if (!names.includes(a.subject)) names.push(a.subject);
      handledSubjects.add(a.subject);
    }
  }

  const compoundGroups: ReportSubjectGroup[] = [];

  for (const [ci] of COMPOUND_DEFS.entries()) {
    const actualSubjects = compoundSubjectNames.get(ci)!;
    if (actualSubjects.length === 0) continue;

    // Sort actual subjects by their position in the compound def
    actualSubjects.sort(
      (a, b) => compoundSubjectPosition(a, ci) - compoundSubjectPosition(b, ci),
    );

    const displayName = actualSubjects.join(', ');

    // Build per-teacher rows
    const allCompoundAssignments = mainAssignments.filter((a) => actualSubjects.includes(a.subject));
    const teacherIds = [...new Set(allCompoundAssignments.map((a) => a.teacherId))];

    let totalHours = 0;
    let hours5to9 = 0;
    let hours10to11 = 0;

    const teacherRows: ReportTeacherRow[] = teacherIds
      .map((tid) => {
        const teacher = teacherMap.get(tid);
        if (!teacher) return null;

        const teacherAssignments = allCompoundAssignments.filter((a) => a.teacherId === tid);
        const classNames = [...new Set(teacherAssignments.map((a) => a.className))];

        // RF-W8: pre-build index to avoid O(n²) find() inside the class loop
        const hoursByClassSubject = new Map<string, number>();
        for (const a of teacherAssignments) {
          hoursByClassSubject.set(`${a.className}::${a.subject}`, a.hoursPerWeek);
        }

        // Build compound entries per class: hoursPerSubject[i] = hours for actualSubjects[i]
        const entries59: { className: string; hoursPerSubject: number[] }[] = [];
        const entries1011: { className: string; hoursPerSubject: number[] }[] = [];

        for (const cn of classNames) {
          const hoursPerSubject = actualSubjects.map((s) => hoursByClassSubject.get(`${cn}::${s}`) ?? 0);
          const grade = gradeFromClassName(cn);
          const entry = { className: cn, hoursPerSubject };
          if (grade >= 5 && grade <= 9) entries59.push(entry);
          else if (grade >= 10) entries1011.push(entry);
        }

        const teacherTotal = teacherAssignments.reduce((s, a) => s + a.hoursPerWeek, 0);
        totalHours += teacherTotal;
        const t59 = entries59.flatMap((e) => e.hoursPerSubject).reduce((s, h) => s + h, 0);
        const t1011 = entries1011.flatMap((e) => e.hoursPerSubject).reduce((s, h) => s + h, 0);
        hours5to9 += t59;
        hours10to11 += t1011;

        return {
          teacherName: teacher.name,
          homeroomClass: homeroomMap.get(tid) ?? null,
          cells5to9: formatCompoundClasses(entries59, '5-9'),
          cells10to11: formatCompoundClasses(entries1011, '10-11'),
          totalHours: teacherTotal,
        };
      })
      .filter((r): r is ReportTeacherRow => r !== null)
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'ru'));

    // Per-subject breakdown for the yellow cell
    // RF-W8: single pass per subject instead of three separate filter() passes
    const subjectBreakdown: SubjectBreakdown[] = actualSubjects.map((s) => {
      let t = 0, t5 = 0, t10 = 0;
      for (const a of allCompoundAssignments) {
        if (a.subject !== s) continue;
        t += a.hoursPerWeek;
        const grade = gradeFromClassName(a.className);
        if (grade <= 9) t5 += a.hoursPerWeek;
        else if (grade >= 10) t10 += a.hoursPerWeek;
      }
      return { name: s, total: t, hours5to9: t5, hours10to11: t10 };
    });

    compoundGroups.push({
      displayName,
      subjects: actualSubjects,
      isCompound: true,
      totalHours,
      hours5to9,
      hours10to11,
      subjectBreakdown,
      teachers: teacherRows,
    });
  }

  // ─── Build simple subject groups ───────────────────────────────────────────

  const simpleSubjects = [
    ...new Set(mainAssignments.map((a) => a.subject).filter((s) => !handledSubjects.has(s))),
  ];

  const simpleGroups: ReportSubjectGroup[] = simpleSubjects
    .map((subjectName) => {
      const sa = mainAssignments.filter((a) => a.subject === subjectName);
      const teacherIds = [...new Set(sa.map((a) => a.teacherId))];

      let totalHours = 0;
      let hours5to9 = 0;
      let hours10to11 = 0;

      const teacherRows: ReportTeacherRow[] = teacherIds
        .map((tid) => {
          const teacher = teacherMap.get(tid);
          if (!teacher) return null;

          const ta = sa.filter((a) => a.teacherId === tid);
          const entries = ta.map((a) => ({ className: a.className, hours: a.hoursPerWeek }));
          const teacherTotal = ta.reduce((s, a) => s + a.hoursPerWeek, 0);
          const t59 = ta.filter((a) => gradeFromClassName(a.className) <= 9).reduce((s, a) => s + a.hoursPerWeek, 0);
          const t1011 = ta.filter((a) => gradeFromClassName(a.className) >= 10).reduce((s, a) => s + a.hoursPerWeek, 0);

          totalHours += teacherTotal;
          hours5to9 += t59;
          hours10to11 += t1011;

          return {
            teacherName: teacher.name,
            homeroomClass: homeroomMap.get(tid) ?? null,
            cells5to9: formatSimpleClasses(entries, '5-9'),
            cells10to11: formatSimpleClasses(entries, '10-11'),
            totalHours: teacherTotal,
          };
        })
        .filter((r): r is ReportTeacherRow => r !== null)
        .sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'ru'));

      return {
        displayName: subjectName,
        subjects: [subjectName],
        isCompound: false,
        totalHours,
        hours5to9,
        hours10to11,
        subjectBreakdown: [],
        teachers: teacherRows,
      };
    })
    .filter((g) => g.teachers.length > 0);

  // ─── Разговоры о важном ─────────────────────────────────────────────────────

  const razgGroups: ReportSubjectGroup[] = [];
  if (homeroomAssignments.length > 0) {
    let totalHours = 0;
    let hours5to9 = 0;
    let hours10to11 = 0;

    const teacherRows: ReportTeacherRow[] = homeroomAssignments
      .flatMap((h) => {
        const teacher = teacherMap.get(h.teacherId);
        if (!teacher) return [];
        const grade = gradeFromClassName(h.className);
        const entries = [{ className: h.className, hours: 1 }];
        totalHours += 1;
        if (grade <= 9) hours5to9 += 1;
        else hours10to11 += 1;
        const row: ReportTeacherRow = {
          teacherName: teacher.name,
          homeroomClass: h.className,
          cells5to9: grade <= 9 ? formatSimpleClasses(entries, '5-9') : '',
          cells10to11: grade >= 10 ? formatSimpleClasses(entries, '10-11') : '',
          totalHours: 1,
        };
        return [row];
      })
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'ru'));

    if (teacherRows.length > 0) {
      razgGroups.push({
        displayName: 'Разговоры о важном',
        subjects: ['Разговоры о важном'],
        isCompound: false,
        totalHours,
        hours5to9,
        hours10to11,
        subjectBreakdown: [],
        teachers: teacherRows,
      });
    }
  }

  // ─── Sort and merge all groups ──────────────────────────────────────────────

  const allGroups = [...compoundGroups, ...simpleGroups, ...razgGroups];

  if (deptGroups && deptGroups.length > 0) {
    // Dept-based ordering: sort by [deptGroupIndex, tableIndex], unmatched groups last.
    const positioned = allGroups.map((g) => ({
      group: g,
      pos: findDeptPosition(g.subjects, deptGroups),
    }));
    positioned.sort((a, b) => {
      if (a.pos === null && b.pos === null) {
        return a.group.displayName.localeCompare(b.group.displayName, 'ru');
      }
      if (a.pos === null) return 1;
      if (b.pos === null) return -1;
      if (a.pos[0] !== b.pos[0]) return a.pos[0] - b.pos[0];
      if (a.pos[1] !== b.pos[1]) return a.pos[1] - b.pos[1];
      return a.group.displayName.localeCompare(b.group.displayName, 'ru');
    });

    // Mark the first subject group in each dept section with a deptLabel header.
    let lastDeptIdx = -1;
    for (const { group, pos } of positioned) {
      if (pos !== null && pos[0] !== lastDeptIdx) {
        group.deptLabel = deptGroups[pos[0]].name;
        lastDeptIdx = pos[0];
      }
    }

    allGroups.length = 0;
    allGroups.push(...positioned.map((p) => p.group));
  } else {
    // Default ФОП order.
    function groupSortKey(g: ReportSubjectGroup): number {
      return subjectOrderIndex(g.subjects[0]);
    }
    allGroups.sort((a, b) => {
      const ka = groupSortKey(a);
      const kb = groupSortKey(b);
      if (ka !== kb) return ka - kb;
      return a.displayName.localeCompare(b.displayName, 'ru');
    });
  }

  // ─── Electives ─────────────────────────────────────────────────────────────

  const electiveSubjects = [...new Set(electiveAssignments.map((a) => a.subject))].sort((a, b) =>
    a.localeCompare(b, 'ru'),
  );

  const electives: ElectiveCourse[] = electiveSubjects.map((name) => {
    const sa = electiveAssignments.filter((a) => a.subject === name);
    const totalHours = sa.reduce((s, a) => s + a.hoursPerWeek, 0);
    const rows: ElectiveRow[] = sa
      .map((a) => {
        const teacher = teacherMap.get(a.teacherId);
        if (!teacher) return null;
        return { className: a.className, hours: a.hoursPerWeek, teacherName: teacher.name };
      })
      .filter((r): r is ElectiveRow => r !== null)
      .sort((a, b) => a.className.localeCompare(b.className, 'ru'));
    return { name, totalHours, rows };
  });

  // ─── Summary ───────────────────────────────────────────────────────────────

  let mandatory59NoSplit = 0;
  let mandatory59Split = 0;
  let optional59 = 0;
  let mandatory1011NoSplit = 0;
  let mandatory1011Split = 0;
  let optional1011 = 0;

  for (const a of assignments) {
    const grade = gradeFromClassName(a.className);
    const part = getSubjectPart(a.subject, grade);
    const split = isGroupSplit(a.subject, grade);

    if (grade >= 5 && grade <= 9) {
      if (part === 'mandatory') {
        if (split) mandatory59Split += a.hoursPerWeek;
        else mandatory59NoSplit += a.hoursPerWeek;
      } else {
        optional59 += a.hoursPerWeek;
      }
    } else if (grade >= 10) {
      if (part === 'mandatory') {
        if (split) mandatory1011Split += a.hoursPerWeek;
        else mandatory1011NoSplit += a.hoursPerWeek;
      } else {
        optional1011 += a.hoursPerWeek;
      }
    }
  }

  // Add Разговоры о важном to summary (always mandatory 5-9 or 10-11 non-split)
  for (const h of homeroomAssignments) {
    const grade = gradeFromClassName(h.className);
    if (grade >= 5 && grade <= 9) mandatory59NoSplit += 1;
    else if (grade >= 10) mandatory1011NoSplit += 1;
  }

  const total59 = mandatory59NoSplit + mandatory59Split + optional59;
  const total1011 = mandatory1011NoSplit + mandatory1011Split + optional1011;
  const grandTotal = total59 + total1011;

  const summary: ReportSummary = {
    mandatory59NoSplit,
    mandatory59Split,
    optional59,
    mandatory1011NoSplit,
    mandatory1011Split,
    optional1011,
    total59,
    total1011,
    grandTotal,
  };

  return {
    variantDate,
    variantLabel,
    schoolYear: schoolYearFromDate(variantDate),
    subjectGroups: allGroups,
    electives,
    summary,
  };
}
