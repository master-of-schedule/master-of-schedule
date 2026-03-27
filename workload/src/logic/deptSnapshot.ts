import { computePlanHash } from './planHash';
import type { CurriculumPlan, RNTeacher, DeptGroup, Assignment } from '../types';

// ── Conflict detection ────────────────────────────────────────────────────────

export interface SnapshotConflicts {
  /** Subjects in the snapshot that are not in the master plan */
  unknownSubjects: string[];
  /** Class names in the snapshot that are not in the master plan */
  unknownClassNames: string[];
  /** Total number of assignments with at least one unknown field */
  orphanedCount: number;
}

/**
 * Detects assignments in the snapshot that cannot be displayed or edited in
 * the current master plan (because the plan changed after the snapshot was created).
 * These orphaned assignments are invisible in AssignPage — the grid is built
 * from the current plan's subjects and classNames only.
 */
export function detectSnapshotConflicts(
  snapshot: DeptSnapshotFile,
  masterPlan: CurriculumPlan,
): SnapshotConflicts {
  const masterSubjects = new Set(
    masterPlan.grades.flatMap((g) => g.subjects.map((s) => s.name)),
  );
  const masterClassNames = new Set(masterPlan.classNames);
  const unknownSubjects = new Set<string>();
  const unknownClassNames = new Set<string>();
  let orphanedCount = 0;
  for (const a of snapshot.assignments) {
    const badSubject = !masterSubjects.has(a.subject);
    const badClass = !masterClassNames.has(a.className);
    if (badSubject) unknownSubjects.add(a.subject);
    if (badClass) unknownClassNames.add(a.className);
    if (badSubject || badClass) orphanedCount++;
  }
  return {
    unknownSubjects: [...unknownSubjects],
    unknownClassNames: [...unknownClassNames],
    orphanedCount,
  };
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface DeptSnapshotFile {
  type: 'dept-snapshot';
  version: 1;
  exportedAt: string;
  groupId: string;
  groupName: string;
  planHash: string;
  plan: CurriculumPlan;
  teachers: RNTeacher[];
  deptGroup: DeptGroup;
  assignments: Assignment[];
}

export interface DeptMergeResult {
  groupName: string;
  replacedCount: number;
  addedCount: number;
}

export type DeptSnapshotError =
  | { kind: 'not-dept-snapshot' }
  | { kind: 'unknown-group'; groupId: string }
  | { kind: 'plan-hash-mismatch' }
  | { kind: 'empty-subject-filter' };

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the union of all subjectFilter arrays across all tables in the group.
 * Empty result means the group has no subject scope defined.
 */
export function getGroupSubjects(group: DeptGroup): string[] {
  const seen = new Set<string>();
  for (const table of group.tables) {
    for (const s of table.subjectFilter) {
      seen.add(s);
    }
  }
  return [...seen];
}

// ── Export (MU-1) ────────────────────────────────────────────────────────────

export function createDeptSnapshot(
  groupId: string,
  state: {
    curriculumPlan: CurriculumPlan;
    teachers: RNTeacher[];
    deptGroups: DeptGroup[];
    assignments: Assignment[];
  },
): DeptSnapshotFile {
  const group = state.deptGroups.find((g) => g.id === groupId);
  if (!group) throw new Error(`Кафедра с id «${groupId}» не найдена`);

  const groupSubjects = getGroupSubjects(group);
  if (groupSubjects.length === 0) {
    throw new Error(
      `У всех таблиц кафедры «${group.name}» нет предметов. Сначала назначьте предметы на вкладке «Кафедры».`,
    );
  }

  // Collect all teacherIds across all tables
  const teacherIdSet = new Set<string>();
  for (const table of group.tables) {
    for (const id of table.teacherIds) teacherIdSet.add(id);
  }
  const teachers = state.teachers.filter((t) => teacherIdSet.has(t.id));

  // Filter assignments to only this group's subjects
  const assignments = state.assignments.filter((a) => groupSubjects.includes(a.subject));

  // Strip groupNameOverrides from the plan
  const { groupNameOverrides: _stripped, ...planCore } = state.curriculumPlan as CurriculumPlan & {
    groupNameOverrides?: unknown;
  };

  return {
    type: 'dept-snapshot',
    version: 1,
    exportedAt: new Date().toISOString(),
    groupId: group.id,
    groupName: group.name,
    planHash: computePlanHash(state.curriculumPlan),
    plan: planCore as CurriculumPlan,
    teachers,
    deptGroup: group,
    assignments,
  };
}

// ── Parse (MU-2 input validation) ────────────────────────────────────────────

export function parseDeptSnapshot(data: unknown): DeptSnapshotFile {
  if (!data || typeof data !== 'object') {
    throw new Error('Файл не является объектом JSON');
  }
  const d = data as Record<string, unknown>;
  if (d.type !== 'dept-snapshot') {
    throw new Error(
      'Это не файл кафедры. Загрузите файл, экспортированный кнопкой «Скачать стартовый файл».',
    );
  }
  if (d.version !== 1) throw new Error(`Неизвестная версия файла: ${d.version}`);
  if (typeof d.groupId !== 'string') throw new Error('Поле groupId отсутствует или имеет неверный тип');
  if (typeof d.groupName !== 'string') throw new Error('Поле groupName отсутствует или имеет неверный тип');
  if (typeof d.planHash !== 'string') throw new Error('Поле planHash отсутствует или имеет неверный тип');
  if (!d.plan || typeof d.plan !== 'object') throw new Error('Поле plan отсутствует или имеет неверный тип');
  if (!Array.isArray(d.teachers)) throw new Error('Поле teachers должно быть массивом');
  if (!d.deptGroup || typeof d.deptGroup !== 'object') throw new Error('Поле deptGroup отсутствует или имеет неверный тип');
  if (!Array.isArray(d.assignments)) throw new Error('Поле assignments должно быть массивом');
  return data as DeptSnapshotFile;
}

// ── Validate against master state (MU-2) ─────────────────────────────────────

export function validateDeptSnapshot(
  snapshot: DeptSnapshotFile,
  masterState: {
    deptGroups: DeptGroup[];
    curriculumPlan: CurriculumPlan | null;
  },
): DeptSnapshotError | null {
  const group = masterState.deptGroups.find((g) => g.id === snapshot.groupId);
  if (!group) return { kind: 'unknown-group', groupId: snapshot.groupId };

  if (!masterState.curriculumPlan) return { kind: 'plan-hash-mismatch' };
  const masterHash = computePlanHash(masterState.curriculumPlan);
  if (masterHash !== snapshot.planHash) return { kind: 'plan-hash-mismatch' };

  return null;
}

// ── Apply merge (MU-2) ───────────────────────────────────────────────────────

export function applyDeptMerge(
  snapshot: DeptSnapshotFile,
  currentAssignments: Assignment[],
  masterGroup: DeptGroup,
): { newAssignments: Assignment[]; replacedCount: number; addedCount: number } {
  const masterSubjects = new Set(getGroupSubjects(masterGroup));
  const toKeep = currentAssignments.filter((a) => !masterSubjects.has(a.subject));
  const replacedCount = currentAssignments.length - toKeep.length;
  return {
    newAssignments: [...toKeep, ...snapshot.assignments],
    replacedCount,
    addedCount: snapshot.assignments.length,
  };
}
