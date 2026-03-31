/**
 * Редактор нагрузки — Zustand store with localStorage persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migrateInitials } from './logic/groupNames';
import type { SnapshotConflicts } from './logic/deptSnapshot';
import type {
  CurriculumPlan,
  RNTeacher,
  DeptTable,
  DeptGroup,
  Department,
  Assignment,
  HomeroomAssignment,
} from './types';

interface RNState {
  // ── Data ──────────────────────────────────────────────────────────────────
  curriculumPlan: CurriculumPlan | null;
  teachers: RNTeacher[];
  deptGroups: DeptGroup[];
  assignments: Assignment[];
  homeroomAssignments: HomeroomAssignment[];
  /** З11-5: User-edited short names, persisted independently of the plan */
  subjectShortNames: Record<string, string>;

  // ── Active tab ────────────────────────────────────────────────────────────
  activeTab: 'import' | 'teachers' | 'departments' | 'assign' | 'homeroom' | 'export';

  // ── Actions ───────────────────────────────────────────────────────────────
  setCurriculumPlan: (plan: CurriculumPlan) => void;
  /** З11-5: Persist a user-edited short name across plan reloads */
  setSubjectShortName: (name: string, shortName: string) => void;
  setGroupCount: (className: string, count: 1 | 2) => void;
  setActiveTab: (tab: RNState['activeTab']) => void;

  addTeacher: (teacher: RNTeacher) => void;
  updateTeacher: (id: string, updates: Partial<RNTeacher>) => void;
  deleteTeacher: (id: string) => void;

  // ── DeptGroup actions ──────────────────────────────────────────────────────
  addDeptGroup: (group: DeptGroup) => void;
  updateDeptGroup: (groupId: string, updates: { name: string }) => void;
  deleteDeptGroup: (groupId: string) => void;
  moveDeptGroup: (groupId: string, direction: 'up' | 'down') => void;

  // ── DeptTable actions ──────────────────────────────────────────────────────
  addDeptTable: (groupId: string, table: DeptTable) => void;
  updateDeptTable: (groupId: string, tableId: string, updates: Partial<Omit<DeptTable, 'id'>>) => void;
  deleteDeptTable: (groupId: string, tableId: string) => void;
  moveDeptTable: (groupId: string, tableId: string, direction: 'up' | 'down') => void;

  setAssignment: (assignment: Assignment) => void;
  removeAssignment: (teacherId: string, className: string, subject: string) => void;

  setHomeroom: (className: string, teacherId: string) => void;
  removeHomeroom: (className: string) => void;
  /** З6-9: Store user-defined group name pair for a class+subject */
  setGroupNameOverride: (className: string, subject: string, names: [string, string]) => void;

  /**
   * MU-3: Remove all assignments whose subject is not in the given list.
   * Called after loading a new UP snapshot if orphaned subjects were detected.
   */
  pruneOrphanedAssignments: (keepSubjects: string[]) => void;

  /**
   * З7-1а: Remove a class from the curriculum plan and all dependent data.
   */
  deleteClass: (className: string) => void;

  /**
   * MU-2: Merge a dept snapshot into the master assignments, teachers, and deptGroup.
   * Removes all assignments for subjects in the group's scope, then adds snapshot assignments.
   * New teachers from the snapshot are appended to the master list; the deptGroup is replaced.
   */
  applyDeptSnapshot: (snapshot: { groupId: string; assignments: Assignment[]; teachers: RNTeacher[]; deptGroup: DeptGroup }) => void;

  /**
   * З9-BUG-1a: Bootstrap full state from a dept-snapshot on a blank machine.
   * Used when curriculumPlan is null and deptGroups is empty (fresh install).
   */
  bootstrapFromDeptSnapshot: (snapshot: {
    plan: CurriculumPlan;
    teachers: RNTeacher[];
    deptGroup: DeptGroup;
    assignments: Assignment[];
  }) => void;

  /**
   * З9-3а: Replace the entire assignments array atomically (used by undo/redo in AssignPage).
   */
  bulkSetAssignments: (assignments: Assignment[]) => void;

  /**
   * З12-2: Replace the entire homeroomAssignments array atomically (used by undo/redo in ImportPage
   * when a class deletion is undone — restores homeroom assignments alongside the plan and assignments).
   */
  bulkSetHomeroomAssignments: (homeroom: HomeroomAssignment[]) => void;

  /**
   * З9-BUG-1b: Restore full state from a backup file (нагрузка-*.json).
   */
  loadFullState: (state: {
    curriculumPlan: CurriculumPlan | null;
    teachers: RNTeacher[];
    deptGroups: DeptGroup[];
    assignments: Assignment[];
    homeroomAssignments: HomeroomAssignment[];
  }) => void;

  resetAll: () => void;

  /**
   * З16-1: Transient banner shown after a dept import with plan-hash-mismatch.
   * NOT persisted to localStorage (excluded via partialize).
   */
  importConflictBanner: { groupName: string; conflicts: SnapshotConflicts } | null;
  setImportConflictBanner: (data: { groupName: string; conflicts: SnapshotConflicts } | null) => void;
}

// З7-3: Default structure — 8 DeptGroups × 16 DeptTables
export const DEFAULT_DEPT_GROUPS: DeptGroup[] = [
  {
    id: 'filo',
    name: 'Филологи',
    tables: [
      { id: 'filo-t1', name: 'Филологи', teacherIds: [], subjectFilter: [] },
    ],
  },
  {
    id: 'inya',
    name: 'ИнЯз',
    tables: [
      { id: 'inya-t1', name: 'Английский', teacherIds: [], subjectFilter: [] },
    ],
  },
  {
    id: 'hist',
    name: 'Историки',
    tables: [
      { id: 'hist-t1', name: 'История', teacherIds: [], subjectFilter: [] },
      { id: 'hist-t2', name: 'Обществознание', teacherIds: [], subjectFilter: [] },
    ],
  },
  {
    id: 'mathphys',
    name: 'Математика, Физика',
    tables: [
      { id: 'mathphys-t1', name: 'Математика', teacherIds: [], subjectFilter: [] },
      { id: 'mathphys-t2', name: 'Физика', teacherIds: [], subjectFilter: [] },
    ],
  },
  {
    id: 'infotech',
    name: 'Информатика, Технология',
    tables: [
      { id: 'infotech-t1', name: 'Информатика', teacherIds: [], subjectFilter: [] },
      { id: 'infotech-t2', name: 'Технология', teacherIds: [], subjectFilter: [] },
    ],
  },
  {
    id: 'chembio',
    name: 'Химия, Биология, География',
    tables: [
      { id: 'chembio-t1', name: 'Химия', teacherIds: [], subjectFilter: [] },
      { id: 'chembio-t2', name: 'Биология', teacherIds: [], subjectFilter: [] },
      { id: 'chembio-t3', name: 'География', teacherIds: [], subjectFilter: [] },
    ],
  },
  {
    id: 'arts',
    name: 'Музыка, ИЗО, ОБЗ, Физ-ра',
    tables: [
      { id: 'arts-t1', name: 'Музыка', teacherIds: [], subjectFilter: [] },
      { id: 'arts-t2', name: 'ИЗО', teacherIds: [], subjectFilter: [] },
      { id: 'arts-t3', name: 'ОБЗ', teacherIds: [], subjectFilter: [] },
      { id: 'arts-t4', name: 'Физ-ра', teacherIds: [], subjectFilter: [] },
    ],
  },
  {
    id: 'elec',
    name: 'Факультативы+',
    tables: [
      { id: 'elec-t1', name: 'Факультативы+', teacherIds: [], subjectFilter: [] },
    ],
  },
];

const initialState = {
  curriculumPlan: null,
  teachers: [],
  deptGroups: DEFAULT_DEPT_GROUPS,
  assignments: [],
  homeroomAssignments: [],
  activeTab: 'import' as const,
  subjectShortNames: {} as Record<string, string>,
  importConflictBanner: null as { groupName: string; conflicts: SnapshotConflicts } | null,
};

/** З9-BUG-2: Collapse multiple spaces / trim in subject names to prevent duplicates from Excel typos. */
function normalizeStr(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

function normalizePlanSubjectNames(plan: CurriculumPlan, storedShortNames?: Record<string, string>): CurriculumPlan {
  return {
    ...plan,
    grades: plan.grades.map((g) => ({
      ...g,
      subjects: g.subjects.map((s) => {
        const normalized = normalizeStr(s.name);
        return {
          ...s,
          name: normalized,
          // З11-5: apply stored short name override if available
          shortName: storedShortNames?.[normalized] ?? normalizeStr(s.shortName),
        };
      }),
    })),
  };
}

function updateTablesInGroup(
  groups: DeptGroup[],
  groupId: string,
  updater: (tables: DeptTable[]) => DeptTable[],
): DeptGroup[] {
  return groups.map((g) =>
    g.id === groupId ? { ...g, tables: updater(g.tables) } : g,
  );
}

export const useStore = create<RNState>()(
  persist(
    (set) => ({
      ...initialState,

      setCurriculumPlan: (plan) =>
        set((s) => ({ curriculumPlan: normalizePlanSubjectNames(plan, s.subjectShortNames) })),
      setSubjectShortName: (name, shortName) =>
        set((s) => ({ subjectShortNames: { ...s.subjectShortNames, [name]: shortName } })),
      setGroupCount: (className, count) =>
        set((s) => {
          if (!s.curriculumPlan) return {};
          const groupCounts = { ...(s.curriculumPlan.groupCounts ?? {}), [className]: count };
          return { curriculumPlan: { ...s.curriculumPlan, groupCounts } };
        }),
      setActiveTab: (tab) => set({ activeTab: tab }),

      addTeacher: (teacher) =>
        set((s) => ({ teachers: [...s.teachers, teacher] })),
      updateTeacher: (id, updates) =>
        set((s) => ({
          teachers: s.teachers.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),
      deleteTeacher: (id) =>
        set((s) => ({
          teachers: s.teachers.filter((t) => t.id !== id),
          assignments: s.assignments.filter((a) => a.teacherId !== id),
          homeroomAssignments: s.homeroomAssignments.filter((h) => h.teacherId !== id),
          deptGroups: s.deptGroups.map((g) => ({
            ...g,
            tables: g.tables.map((t) => ({
              ...t,
              teacherIds: t.teacherIds.filter((tid) => tid !== id),
            })),
          })),
        })),

      // ── DeptGroup actions ────────────────────────────────────────────────
      addDeptGroup: (group) =>
        set((s) => ({ deptGroups: [...s.deptGroups, group] })),
      updateDeptGroup: (groupId, updates) =>
        set((s) => ({
          deptGroups: s.deptGroups.map((g) =>
            g.id === groupId ? { ...g, ...updates } : g,
          ),
        })),
      deleteDeptGroup: (groupId) =>
        set((s) => ({ deptGroups: s.deptGroups.filter((g) => g.id !== groupId) })),
      moveDeptGroup: (groupId, direction) =>
        set((s) => {
          const idx = s.deptGroups.findIndex((g) => g.id === groupId);
          if (idx < 0) return {};
          const newIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (newIdx < 0 || newIdx >= s.deptGroups.length) return {};
          const groups = [...s.deptGroups];
          [groups[idx], groups[newIdx]] = [groups[newIdx], groups[idx]];
          return { deptGroups: groups };
        }),

      // ── DeptTable actions ────────────────────────────────────────────────
      addDeptTable: (groupId, table) =>
        set((s) => ({
          deptGroups: updateTablesInGroup(s.deptGroups, groupId, (ts) => [...ts, table]),
        })),
      updateDeptTable: (groupId, tableId, updates) =>
        set((s) => ({
          deptGroups: updateTablesInGroup(s.deptGroups, groupId, (ts) =>
            ts.map((t) => (t.id === tableId ? { ...t, ...updates } : t)),
          ),
        })),
      deleteDeptTable: (groupId, tableId) =>
        set((s) => ({
          deptGroups: updateTablesInGroup(s.deptGroups, groupId, (ts) =>
            ts.filter((t) => t.id !== tableId),
          ),
        })),
      moveDeptTable: (groupId, tableId, direction) =>
        set((s) => ({
          deptGroups: updateTablesInGroup(s.deptGroups, groupId, (ts) => {
            const idx = ts.findIndex((t) => t.id === tableId);
            if (idx < 0) return ts;
            const newIdx = direction === 'up' ? idx - 1 : idx + 1;
            if (newIdx < 0 || newIdx >= ts.length) return ts;
            const next = [...ts];
            [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
            return next;
          }),
        })),

      setAssignment: (assignment) =>
        set((s) => {
          const filtered = s.assignments.filter(
            (a) =>
              !(
                a.teacherId === assignment.teacherId &&
                a.className === assignment.className &&
                a.subject === assignment.subject
              ),
          );
          return { assignments: [...filtered, assignment] };
        }),
      removeAssignment: (teacherId, className, subject) =>
        set((s) => ({
          assignments: s.assignments.filter(
            (a) =>
              !(a.teacherId === teacherId && a.className === className && a.subject === subject),
          ),
        })),

      setHomeroom: (className, teacherId) =>
        set((s) => ({
          homeroomAssignments: [
            ...s.homeroomAssignments.filter((h) => h.className !== className),
            { className, teacherId },
          ],
        })),
      removeHomeroom: (className) =>
        set((s) => ({
          homeroomAssignments: s.homeroomAssignments.filter((h) => h.className !== className),
        })),
      setGroupNameOverride: (className, subject, names) =>
        set((s) => {
          if (!s.curriculumPlan) return {};
          const existing = s.curriculumPlan.groupNameOverrides ?? {};
          const classOverrides = { ...(existing[className] ?? {}), [subject]: names };
          return {
            curriculumPlan: {
              ...s.curriculumPlan,
              groupNameOverrides: { ...existing, [className]: classOverrides },
            },
          };
        }),

      pruneOrphanedAssignments: (keepSubjects) =>
        set((s) => {
          const keep = new Set(keepSubjects);
          return {
            assignments: s.assignments.filter((a) => keep.has(a.subject)),
          };
        }),

      deleteClass: (className) =>
        set((s) => {
          if (!s.curriculumPlan) return {};
          const grades = s.curriculumPlan.grades.map((g) => ({
            ...g,
            subjects: g.subjects.map((subj) => {
              const { [className]: _removed, ...rest } = subj.hoursPerClass;
              return { ...subj, hoursPerClass: rest };
            }),
            expectedTotals: g.expectedTotals
              ? (() => { const { [className]: _r, ...rest } = g.expectedTotals!; return rest; })()
              : undefined,
          }));
          const classNames = s.curriculumPlan.classNames.filter((cn) => cn !== className);
          const groupCounts = s.curriculumPlan.groupCounts
            ? (() => { const { [className]: _r, ...rest } = s.curriculumPlan.groupCounts!; return rest as Record<string, 1|2>; })()
            : undefined;
          return {
            curriculumPlan: { ...s.curriculumPlan, grades, classNames, groupCounts },
            assignments: s.assignments.filter((a) => a.className !== className),
            homeroomAssignments: s.homeroomAssignments.filter((h) => h.className !== className),
          };
        }),

      applyDeptSnapshot: ({ groupId, assignments: snapAssignments, teachers: snapTeachers, deptGroup: snapDeptGroup }) =>
        set((s) => {
          const group = s.deptGroups.find((g) => g.id === groupId);
          if (!group) return {};
          const groupSubjects = new Set(group.tables.flatMap((t) => t.subjectFilter));
          const toKeep = s.assignments.filter((a) => !groupSubjects.has(a.subject));

          // Merge teachers: add any new teachers from the snapshot not yet in master list
          const existingIds = new Set(s.teachers.map((t) => t.id));
          const newTeachers = snapTeachers.filter((t) => !existingIds.has(t.id));
          const mergedTeachers = newTeachers.length > 0 ? [...s.teachers, ...newTeachers] : s.teachers;

          // Replace deptGroup with the snapshot version (preserves updated teacherIds)
          const mergedDeptGroups = s.deptGroups.map((g) => (g.id === groupId ? snapDeptGroup : g));

          return {
            assignments: [...toKeep, ...snapAssignments],
            teachers: mergedTeachers,
            deptGroups: mergedDeptGroups,
          };
        }),

      bulkSetAssignments: (newAssignments) => set({ assignments: newAssignments }),

      bulkSetHomeroomAssignments: (homeroom) => set({ homeroomAssignments: homeroom }),

      bootstrapFromDeptSnapshot: ({ plan, teachers, deptGroup, assignments }) =>
        set((s) => ({
          curriculumPlan: normalizePlanSubjectNames(plan, s.subjectShortNames),
          teachers,
          deptGroups: [deptGroup],
          assignments,
          homeroomAssignments: [],
        })),

      loadFullState: ({ curriculumPlan, teachers, deptGroups, assignments, homeroomAssignments }) =>
        set((s) => ({
          curriculumPlan: curriculumPlan ? normalizePlanSubjectNames(curriculumPlan, s.subjectShortNames) : null,
          teachers,
          deptGroups: deptGroups.length > 0 ? deptGroups : DEFAULT_DEPT_GROUPS,
          assignments,
          homeroomAssignments,
        })),

      resetAll: () => set({ ...initialState, deptGroups: DEFAULT_DEPT_GROUPS }),

      setImportConflictBanner: (data) => set({ importConflictBanner: data }),
    }),
    {
      name: 'rn-store',
      version: 4,
      // З16-1: Exclude transient UI state from localStorage persistence
      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { importConflictBanner: _banner, setImportConflictBanner: _setter, ...rest } = state;
        return rest;
      },
      migrate: (persistedState: unknown, version: number) => {
        const s = persistedState as Record<string, unknown> & {
          teachers?: RNTeacher[];
          departments?: Department[];
          deptGroups?: DeptGroup[];
          curriculumPlan?: CurriculumPlan | null;
        };
        if (version < 1) {
          // З3-7: convert old "Н.В." initials to "НВ" format
          s.teachers = (s.teachers ?? []).map((t) => ({
            ...t,
            initials: migrateInitials(t.initials),
          }));
        }
        if (version < 2) {
          // З7-3: migrate flat Department[] → DeptGroup[] (each dept becomes a group with 1 table)
          if (s.departments && !s.deptGroups) {
            s.deptGroups = (s.departments as Department[]).map((d) => ({
              id: d.id,
              name: d.name,
              tables: [{
                id: `${d.id}-t1`,
                name: d.name,
                teacherIds: d.teacherIds ?? [],
                subjectFilter: d.subjectFilter ?? [],
              }],
            }));
          } else if (!s.deptGroups) {
            s.deptGroups = DEFAULT_DEPT_GROUPS;
          }
          delete s.departments;
        }
        if (version < 4) {
          // З11-5: add subjectShortNames map (empty — populated on first edit)
          if (!s.subjectShortNames) s.subjectShortNames = {};
        }
        if (version < 3) {
          // З11-1: backfill part='mandatory' for all existing SubjectRow entries
          if (s.curriculumPlan) {
            s.curriculumPlan = {
              ...s.curriculumPlan,
              grades: s.curriculumPlan.grades.map((g) => ({
                ...g,
                subjects: g.subjects.map((subj) => ({
                  ...subj,
                  part: ((subj as unknown as Record<string, unknown>).part as ('mandatory' | 'optional') | undefined) ?? 'mandatory',
                })),
              })),
            };
          }
        }
        return s as unknown as RNState;
      },
    },
  ),
);
