import { describe, it, expect } from 'vitest';
import {
  createDeptSnapshot,
  parseDeptSnapshot,
  validateDeptSnapshot,
  applyDeptMerge,
  applyDeptSnapshotState,
  getGroupSubjects,
  detectSnapshotConflicts,
  type DeptSnapshotFile,
} from './deptSnapshot';
import { computePlanHash } from './planHash';
import type { CurriculumPlan, RNTeacher, DeptGroup, Assignment } from '../types';

const PLAN: CurriculumPlan = {
  classNames: ['5а', '5б'],
  grades: [
    {
      grade: 5,
      subjects: [
        { name: 'Математика', shortName: 'Мат', hoursPerClass: { '5а': 4, '5б': 4 }, groupSplit: false, part: 'mandatory' as const },
        { name: 'Физкультура', shortName: 'Физ', hoursPerClass: { '5а': 3, '5б': 3 }, groupSplit: true, part: 'mandatory' as const },
      ],
    },
  ],
};

const TEACHERS: RNTeacher[] = [
  { id: 't1', name: 'Иванов Иван Иванович', initials: 'И.И.', subjects: [] },
  { id: 't2', name: 'Петров Пётр Петрович', initials: 'П.П.', subjects: [] },
];

const MATH_GROUP: DeptGroup = {
  id: 'math',
  name: 'Математики',
  tables: [
    { id: 'math-t1', name: 'Математика', teacherIds: ['t1'], subjectFilter: ['Математика'] },
    { id: 'math-t2', name: 'Физкультура', teacherIds: ['t2'], subjectFilter: ['Физкультура'] },
  ],
};

const EMPTY_FILTER_GROUP: DeptGroup = {
  id: 'empty',
  name: 'Без фильтра',
  tables: [
    { id: 'empty-t1', name: 'Все предметы', teacherIds: [], subjectFilter: [] },
  ],
};

const ASSIGNMENTS: Assignment[] = [
  { teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 4 },
  { teacherId: 't1', className: '5б', subject: 'Математика', hoursPerWeek: 4 },
  { teacherId: 't2', className: '5а', subject: 'Физкультура', hoursPerWeek: 3 },
];

const BASE_STATE = {
  curriculumPlan: PLAN,
  teachers: TEACHERS,
  deptGroups: [MATH_GROUP, EMPTY_FILTER_GROUP],
  assignments: ASSIGNMENTS,
};

// ── getGroupSubjects ──────────────────────────────────────────────────────────

describe('getGroupSubjects', () => {
  it('returns union of all table subjectFilters', () => {
    expect(getGroupSubjects(MATH_GROUP)).toEqual(expect.arrayContaining(['Математика', 'Физкультура']));
  });

  it('returns empty array when all tables have empty filter', () => {
    expect(getGroupSubjects(EMPTY_FILTER_GROUP)).toEqual([]);
  });

  it('deduplicates subjects appearing in multiple tables', () => {
    const g: DeptGroup = {
      id: 'g', name: 'G',
      tables: [
        { id: 't1', name: 'T1', teacherIds: [], subjectFilter: ['Математика', 'Физика'] },
        { id: 't2', name: 'T2', teacherIds: [], subjectFilter: ['Математика', 'Химия'] },
      ],
    };
    const subjects = getGroupSubjects(g);
    expect(subjects).toHaveLength(3);
    expect(subjects).toContain('Математика');
  });
});

// ── createDeptSnapshot ────────────────────────────────────────────────────────

describe('createDeptSnapshot', () => {
  it('returns correct type/version/groupId/groupName', () => {
    const snap = createDeptSnapshot('math', BASE_STATE);
    expect(snap.type).toBe('dept-snapshot');
    expect(snap.version).toBe(1);
    expect(snap.groupId).toBe('math');
    expect(snap.groupName).toBe('Математики');
  });

  it('planHash matches computePlanHash of the plan', () => {
    const snap = createDeptSnapshot('math', BASE_STATE);
    expect(snap.planHash).toBe(computePlanHash(PLAN));
  });

  it('filters teachers to only those in group tables', () => {
    const snap = createDeptSnapshot('math', BASE_STATE);
    expect(snap.teachers).toHaveLength(2);
    expect(snap.teachers.map((t) => t.id)).toEqual(expect.arrayContaining(['t1', 't2']));
  });

  it('filters assignments to only group subjects', () => {
    const snap = createDeptSnapshot('math', BASE_STATE);
    const subjects = snap.assignments.map((a) => a.subject);
    expect(subjects).toContain('Математика');
    expect(subjects).toContain('Физкультура');
    expect(snap.assignments).toHaveLength(3);
  });

  it('strips groupNameOverrides from the plan', () => {
    const planWithOverrides: CurriculumPlan = {
      ...PLAN,
      groupNameOverrides: { '5а': { 'Математика': ['А', 'Б'] } },
    };
    const snap = createDeptSnapshot('math', { ...BASE_STATE, curriculumPlan: planWithOverrides });
    expect(snap.plan.groupNameOverrides).toBeUndefined();
  });

  it('includes the deptGroup structure', () => {
    const snap = createDeptSnapshot('math', BASE_STATE);
    expect(snap.deptGroup.id).toBe('math');
    expect(snap.deptGroup.tables).toHaveLength(2);
  });

  it('throws for unknown groupId', () => {
    expect(() => createDeptSnapshot('nonexistent', BASE_STATE)).toThrow();
  });

  it('throws when all tables have empty subjectFilter', () => {
    const state = { ...BASE_STATE, deptGroups: [EMPTY_FILTER_GROUP] };
    expect(() => createDeptSnapshot('empty', state)).toThrow(/нет предметов/);
  });
});

// ── parseDeptSnapshot ─────────────────────────────────────────────────────────

describe('parseDeptSnapshot', () => {
  it('returns typed object for valid input', () => {
    const snap = createDeptSnapshot('math', BASE_STATE);
    const parsed = parseDeptSnapshot(snap);
    expect(parsed.type).toBe('dept-snapshot');
    expect(parsed.groupId).toBe('math');
  });

  it('throws for non-object input', () => {
    expect(() => parseDeptSnapshot('not-an-object')).toThrow();
  });

  it('throws for wrong type field', () => {
    expect(() => parseDeptSnapshot({ type: 'up-snapshot', version: 1, groupId: 'x', groupName: 'x', planHash: 'x', plan: {}, teachers: [], deptGroup: {}, assignments: [] })).toThrow(/не файл кафедры/);
  });

  it('throws when type is missing', () => {
    expect(() => parseDeptSnapshot({ version: 1, groupId: 'x' })).toThrow();
  });

  it('throws when teachers is not an array', () => {
    expect(() => parseDeptSnapshot({ type: 'dept-snapshot', version: 1, groupId: 'x', groupName: 'x', planHash: 'x', plan: {}, teachers: 'bad', deptGroup: {}, assignments: [] })).toThrow(/teachers/);
  });
});

// ── validateDeptSnapshot ──────────────────────────────────────────────────────

describe('validateDeptSnapshot', () => {
  it('returns null when everything matches', () => {
    const snap = createDeptSnapshot('math', BASE_STATE);
    const err = validateDeptSnapshot(snap, { deptGroups: BASE_STATE.deptGroups, curriculumPlan: PLAN });
    expect(err).toBeNull();
  });

  it('returns unknown-group when groupId not found', () => {
    const snap = createDeptSnapshot('math', BASE_STATE);
    const err = validateDeptSnapshot(snap, { deptGroups: [], curriculumPlan: PLAN });
    expect(err).toEqual({ kind: 'unknown-group', groupId: 'math' });
  });

  it('returns plan-hash-mismatch when hashes differ', () => {
    const snap = createDeptSnapshot('math', BASE_STATE);
    const modifiedPlan: CurriculumPlan = {
      ...PLAN,
      grades: [{ ...PLAN.grades[0], subjects: [{ ...PLAN.grades[0].subjects[0], hoursPerClass: { '5а': 999 } }] }],
    };
    const err = validateDeptSnapshot(snap, { deptGroups: BASE_STATE.deptGroups, curriculumPlan: modifiedPlan });
    expect(err).toEqual({ kind: 'plan-hash-mismatch' });
  });

  it('returns plan-hash-mismatch when curriculumPlan is null', () => {
    const snap = createDeptSnapshot('math', BASE_STATE);
    const err = validateDeptSnapshot(snap, { deptGroups: BASE_STATE.deptGroups, curriculumPlan: null });
    expect(err).toEqual({ kind: 'plan-hash-mismatch' });
  });
});

// ── applyDeptMerge ────────────────────────────────────────────────────────────

describe('applyDeptMerge', () => {
  it('removes existing assignments for group subjects and adds snapshot assignments', () => {
    const snap = createDeptSnapshot('math', BASE_STATE);
    const { newAssignments, replacedCount, addedCount } = applyDeptMerge(snap, ASSIGNMENTS, MATH_GROUP);
    // All 3 original assignments are for math group subjects — should be replaced
    expect(replacedCount).toBe(3);
    expect(addedCount).toBe(3); // snapshot has the same 3
    expect(newAssignments).toHaveLength(3);
  });

  it('keeps assignments for other groups untouched', () => {
    const otherAssignment: Assignment = { teacherId: 't99', className: '6а', subject: 'Биология', hoursPerWeek: 2 };
    const allAssignments = [...ASSIGNMENTS, otherAssignment];
    const snap = createDeptSnapshot('math', { ...BASE_STATE, assignments: ASSIGNMENTS });
    const { newAssignments } = applyDeptMerge(snap, allAssignments, MATH_GROUP);
    expect(newAssignments.some((a) => a.subject === 'Биология')).toBe(true);
  });

  it('when snapshot has no assignments — removes old, adds nothing', () => {
    const emptySnap = createDeptSnapshot('math', { ...BASE_STATE, assignments: [] });
    const { newAssignments, replacedCount, addedCount } = applyDeptMerge(emptySnap, ASSIGNMENTS, MATH_GROUP);
    expect(replacedCount).toBe(3);
    expect(addedCount).toBe(0);
    expect(newAssignments).toHaveLength(0);
  });

  it('returns correct counts when no assignments to replace', () => {
    const snap = createDeptSnapshot('math', BASE_STATE);
    const { replacedCount } = applyDeptMerge(snap, [], MATH_GROUP);
    expect(replacedCount).toBe(0);
  });
});

// ── detectSnapshotConflicts ───────────────────────────────────────────────────

describe('detectSnapshotConflicts', () => {
  const MASTER_PLAN: CurriculumPlan = {
    classNames: ['5а', '5б'],
    grades: [
      {
        grade: 5,
        subjects: [
          { name: 'Математика', shortName: 'Мат', hoursPerClass: { '5а': 4, '5б': 4 }, groupSplit: false, part: 'mandatory' },
        ],
      },
    ],
  };

  // Override assignments directly — createDeptSnapshot filters by group scope,
  // which would strip assignments with subjects outside the group (e.g. 'Физика').
  function makeSnap(assignments: Assignment[]): DeptSnapshotFile {
    return { ...createDeptSnapshot('math', BASE_STATE), assignments };
  }

  it('returns zeros when all assignments match the master plan', () => {
    const snap = makeSnap([
      { teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 4 },
    ]);
    const result = detectSnapshotConflicts(snap, MASTER_PLAN);
    expect(result).toEqual({ unknownSubjects: [], unknownClassNames: [], orphanedCount: 0 });
  });

  it('detects unknown subject', () => {
    const snap = makeSnap([
      { teacherId: 't1', className: '5а', subject: 'Физика', hoursPerWeek: 3 },
    ]);
    const result = detectSnapshotConflicts(snap, MASTER_PLAN);
    expect(result.unknownSubjects).toEqual(['Физика']);
    expect(result.unknownClassNames).toEqual([]);
    expect(result.orphanedCount).toBe(1);
  });

  it('detects unknown className', () => {
    const snap = makeSnap([
      { teacherId: 't1', className: '7в', subject: 'Математика', hoursPerWeek: 4 },
    ]);
    const result = detectSnapshotConflicts(snap, MASTER_PLAN);
    expect(result.unknownSubjects).toEqual([]);
    expect(result.unknownClassNames).toEqual(['7в']);
    expect(result.orphanedCount).toBe(1);
  });

  it('counts once when both subject and className are unknown', () => {
    const snap = makeSnap([
      { teacherId: 't1', className: '7в', subject: 'Физика', hoursPerWeek: 3 },
    ]);
    const result = detectSnapshotConflicts(snap, MASTER_PLAN);
    expect(result.unknownSubjects).toEqual(['Физика']);
    expect(result.unknownClassNames).toEqual(['7в']);
    expect(result.orphanedCount).toBe(1);
  });

  it('deduplicates the same unknown subject across multiple assignments', () => {
    const snap = makeSnap([
      { teacherId: 't1', className: '5а', subject: 'Физика', hoursPerWeek: 3 },
      { teacherId: 't2', className: '5б', subject: 'Физика', hoursPerWeek: 3 },
    ]);
    const result = detectSnapshotConflicts(snap, MASTER_PLAN);
    expect(result.unknownSubjects).toEqual(['Физика']);
    expect(result.orphanedCount).toBe(2);
  });

  it('returns zeros for empty assignments array', () => {
    const snap = makeSnap([]);
    const result = detectSnapshotConflicts(snap, MASTER_PLAN);
    expect(result).toEqual({ unknownSubjects: [], unknownClassNames: [], orphanedCount: 0 });
  });
});

describe('applyDeptSnapshotState (RF-W6)', () => {
  const baseGroup: import('../types').DeptGroup = {
    id: 'math', name: 'Математики',
    tables: [{ id: 'tbl-m', name: 'Математика', subjectFilter: ['Математика'], teacherIds: ['t1'] }],
  };

  const baseState = {
    deptGroups: [baseGroup],
    assignments: [
      { teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 4 },
      { teacherId: 't3', className: '5а', subject: 'Физкультура', hoursPerWeek: 3 },
    ] as import('../types').Assignment[],
    teachers: [
      { id: 't1', name: 'Иванов', initials: 'И.И.', subjects: [] },
    ] as import('../types').RNTeacher[],
  };

  it('replaces group assignments and keeps others', () => {
    const result = applyDeptSnapshotState(
      { groupId: 'math', assignments: [{ teacherId: 't2', className: '5б', subject: 'Математика', hoursPerWeek: 5 }], teachers: [], deptGroup: baseGroup },
      baseState,
    );
    expect(result).not.toBeNull();
    const assignments = result!.assignments!;
    // Old math assignment replaced, PE kept
    expect(assignments.find((a) => a.subject === 'Физкультура')).toBeDefined();
    expect(assignments.find((a) => a.className === '5а' && a.subject === 'Математика')).toBeUndefined();
    expect(assignments.find((a) => a.className === '5б' && a.subject === 'Математика')).toBeDefined();
  });

  it('merges new teachers from snapshot', () => {
    const newTeacher = { id: 't-new', name: 'Новый', initials: 'Н.Н.', subjects: [] };
    const result = applyDeptSnapshotState(
      { groupId: 'math', assignments: [], teachers: [newTeacher], deptGroup: baseGroup },
      baseState,
    );
    expect(result!.teachers!.find((t) => t.id === 't-new')).toBeDefined();
    expect(result!.teachers!.find((t) => t.id === 't1')).toBeDefined(); // existing kept
  });

  it('does not duplicate existing teachers', () => {
    const result = applyDeptSnapshotState(
      { groupId: 'math', assignments: [], teachers: [{ id: 't1', name: 'Иванов', initials: 'И.И.', subjects: [] }], deptGroup: baseGroup },
      baseState,
    );
    expect(result!.teachers!.filter((t) => t.id === 't1')).toHaveLength(1);
  });

  it('returns null for unknown groupId', () => {
    const result = applyDeptSnapshotState(
      { groupId: 'nonexistent', assignments: [], teachers: [], deptGroup: baseGroup },
      baseState,
    );
    expect(result).toBeNull();
  });
});
