import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './store';
import type { RNTeacher, CurriculumPlan } from './types';

const PLAN: CurriculumPlan = {
  classNames: ['5а'],
  grades: [{ grade: 5, subjects: [{ name: 'Математика', shortName: 'Мат', hoursPerClass: { '5а': 5 }, groupSplit: false, part: 'mandatory' as const }] }],
};

const TEACHER: RNTeacher = {
  id: 'teacher-1',
  name: 'Иванов Иван Иванович',
  initials: 'И.И.',
  subjects: ['Математика'],
};

beforeEach(() => {
  useStore.getState().resetAll();
});

describe('setCurriculumPlan', () => {
  it('sets the plan', () => {
    useStore.getState().setCurriculumPlan(PLAN);
    expect(useStore.getState().curriculumPlan).toEqual(PLAN);
  });

  it('З9-BUG-2: normalizes double spaces in subject names', () => {
    const planWithDoubleSpace: CurriculumPlan = {
      classNames: ['5а'],
      grades: [{
        grade: 5,
        subjects: [
          { name: 'Русский  язык', shortName: 'Русский ', hoursPerClass: { '5а': 5 }, groupSplit: false, part: 'mandatory' as const },
          { name: 'Русский язык', shortName: 'Русский', hoursPerClass: { '5а': 5 }, groupSplit: false, part: 'mandatory' as const },
        ],
      }],
    };
    useStore.getState().setCurriculumPlan(planWithDoubleSpace);
    const plan = useStore.getState().curriculumPlan!;
    expect(plan.grades[0].subjects[0].name).toBe('Русский язык');
    expect(plan.grades[0].subjects[0].shortName).toBe('Русский');
    expect(plan.grades[0].subjects[1].name).toBe('Русский язык');
  });
});

describe('setSubjectShortName (З11-5)', () => {
  it('stores a short name mapping without affecting other state', () => {
    useStore.getState().addTeacher({ id: 't1', name: 'Иванов', initials: 'ИИ', subjects: [] });
    useStore.getState().setSubjectShortName('Математика', 'Мат+');
    expect(useStore.getState().subjectShortNames['Математика']).toBe('Мат+');
    expect(useStore.getState().teachers).toHaveLength(1);
  });

  it('applies stored short names when a new plan is loaded', () => {
    useStore.getState().setSubjectShortName('Математика', 'Алг!');
    useStore.getState().setCurriculumPlan(PLAN);
    const plan = useStore.getState().curriculumPlan!;
    expect(plan.grades[0].subjects[0].shortName).toBe('Алг!');
  });

  it('stored short name does not affect unrelated subjects', () => {
    useStore.getState().setSubjectShortName('Физкультура', 'Физ!');
    useStore.getState().setCurriculumPlan(PLAN);
    const plan = useStore.getState().curriculumPlan!;
    const math = plan.grades[0].subjects[0];
    expect(math.name).toBe('Математика');
    expect(math.shortName).toBe('Мат'); // unchanged
  });

  it('З12-3: stored short names survive loading a different file (regression)', () => {
    // Simulate: user stores a short name, then loads a DIFFERENT plan with the same subject
    useStore.getState().setSubjectShortName('Математика', 'Мат↑');
    const differentPlan: CurriculumPlan = {
      classNames: ['6а'],
      grades: [{ grade: 6, subjects: [{ name: 'Математика', shortName: 'Математика', hoursPerClass: { '6а': 4 }, groupSplit: false, part: 'mandatory' as const }] }],
    };
    useStore.getState().setCurriculumPlan(differentPlan);
    const plan = useStore.getState().curriculumPlan!;
    expect(plan.grades[0].subjects[0].shortName).toBe('Мат↑'); // carried over
  });
});

describe('bulkSetHomeroomAssignments (З12-2)', () => {
  it('replaces homeroom assignments atomically', () => {
    useStore.getState().setHomeroom('5а', 'teacher-1');
    useStore.getState().setHomeroom('6а', 'teacher-2');
    useStore.getState().bulkSetHomeroomAssignments([{ className: '5а', teacherId: 'teacher-9' }]);
    expect(useStore.getState().homeroomAssignments).toHaveLength(1);
    expect(useStore.getState().homeroomAssignments[0].teacherId).toBe('teacher-9');
  });

  it('З12-2: deleteClass + bulkSetHomeroomAssignments restores full state on undo', () => {
    useStore.getState().setCurriculumPlan(PLAN);
    useStore.getState().setAssignment({ teacherId: 'teacher-1', className: '5а', subject: 'Математика', hoursPerWeek: 5 });
    useStore.getState().setHomeroom('5а', 'teacher-1');
    // snapshot before delete (simulating what ImportPage does before deleteClass)
    const preAssignments = [...useStore.getState().assignments];
    const preHomeroom = [...useStore.getState().homeroomAssignments];
    // delete
    useStore.getState().deleteClass('5а');
    expect(useStore.getState().assignments).toHaveLength(0);
    expect(useStore.getState().homeroomAssignments).toHaveLength(0);
    // undo: restore
    useStore.getState().setCurriculumPlan(PLAN);
    useStore.getState().bulkSetAssignments(preAssignments);
    useStore.getState().bulkSetHomeroomAssignments(preHomeroom);
    expect(useStore.getState().assignments).toHaveLength(1);
    expect(useStore.getState().homeroomAssignments).toHaveLength(1);
    expect(useStore.getState().curriculumPlan?.classNames).toContain('5а');
  });
});

describe('setActiveTab', () => {
  it('switches tabs', () => {
    useStore.getState().setActiveTab('teachers');
    expect(useStore.getState().activeTab).toBe('teachers');
  });
});

describe('teacher actions', () => {
  it('addTeacher adds to list', () => {
    useStore.getState().addTeacher(TEACHER);
    expect(useStore.getState().teachers).toHaveLength(1);
    expect(useStore.getState().teachers[0].name).toBe('Иванов Иван Иванович');
  });

  it('updateTeacher changes only specified fields', () => {
    useStore.getState().addTeacher(TEACHER);
    useStore.getState().updateTeacher('teacher-1', { initials: 'И.И.И.' });
    const t = useStore.getState().teachers[0];
    expect(t.initials).toBe('И.И.И.');
    expect(t.name).toBe('Иванов Иван Иванович');
  });

  it('deleteTeacher removes teacher and their assignments', () => {
    useStore.getState().addTeacher(TEACHER);
    useStore.getState().setAssignment({ teacherId: 'teacher-1', className: '5а', subject: 'Математика', hoursPerWeek: 5 });
    useStore.getState().deleteTeacher('teacher-1');
    expect(useStore.getState().teachers).toHaveLength(0);
    expect(useStore.getState().assignments).toHaveLength(0);
  });

  it('deleteTeacher removes from deptGroup table teacherIds', () => {
    useStore.getState().addTeacher(TEACHER);
    // Add teacher to the first table of 'filo' group
    useStore.getState().updateDeptTable('filo', 'filo-t1', { teacherIds: ['teacher-1'] });
    useStore.getState().deleteTeacher('teacher-1');
    const group = useStore.getState().deptGroups.find((g) => g.id === 'filo');
    expect(group?.tables[0].teacherIds).not.toContain('teacher-1');
  });

  it('deleteTeacher removes homeroom assignment', () => {
    useStore.getState().addTeacher(TEACHER);
    useStore.getState().setHomeroom('5а', 'teacher-1');
    useStore.getState().deleteTeacher('teacher-1');
    expect(useStore.getState().homeroomAssignments).toHaveLength(0);
  });
});

describe('deptGroup actions', () => {
  it('addDeptGroup adds to list', () => {
    const initialCount = useStore.getState().deptGroups.length;
    useStore.getState().addDeptGroup({ id: 'test-group', name: 'Тест', tables: [] });
    expect(useStore.getState().deptGroups).toHaveLength(initialCount + 1);
  });

  it('updateDeptGroup modifies only specified group', () => {
    useStore.getState().updateDeptGroup('filo', { name: 'Словесники' });
    const filo = useStore.getState().deptGroups.find((g) => g.id === 'filo');
    expect(filo?.name).toBe('Словесники');
    // Others untouched
    const inya = useStore.getState().deptGroups.find((g) => g.id === 'inya');
    expect(inya?.name).toBe('ИнЯз');
  });

  it('deleteDeptGroup removes it', () => {
    useStore.getState().deleteDeptGroup('elec');
    expect(useStore.getState().deptGroups.find((g) => g.id === 'elec')).toBeUndefined();
  });

  it('moveDeptGroup swaps group up', () => {
    const before = useStore.getState().deptGroups.map((g) => g.id);
    useStore.getState().moveDeptGroup(before[1], 'up');
    const after = useStore.getState().deptGroups.map((g) => g.id);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });

  it('moveDeptGroup swaps group down', () => {
    const before = useStore.getState().deptGroups.map((g) => g.id);
    useStore.getState().moveDeptGroup(before[0], 'down');
    const after = useStore.getState().deptGroups.map((g) => g.id);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });

  it('moveDeptGroup does nothing at top boundary (up)', () => {
    const before = useStore.getState().deptGroups.map((g) => g.id);
    useStore.getState().moveDeptGroup(before[0], 'up');
    const after = useStore.getState().deptGroups.map((g) => g.id);
    expect(after).toEqual(before);
  });

  it('moveDeptGroup does nothing at bottom boundary (down)', () => {
    const groups = useStore.getState().deptGroups;
    const lastId = groups[groups.length - 1].id;
    const before = groups.map((g) => g.id);
    useStore.getState().moveDeptGroup(lastId, 'down');
    const after = useStore.getState().deptGroups.map((g) => g.id);
    expect(after).toEqual(before);
  });

  it('moveDeptGroup does nothing for unknown id', () => {
    const before = useStore.getState().deptGroups.map((g) => g.id);
    useStore.getState().moveDeptGroup('nonexistent', 'up');
    const after = useStore.getState().deptGroups.map((g) => g.id);
    expect(after).toEqual(before);
  });
});

describe('deptTable actions', () => {
  it('addDeptTable adds a table inside the group', () => {
    const before = useStore.getState().deptGroups.find((g) => g.id === 'inya')!.tables.length;
    useStore.getState().addDeptTable('inya', { id: 'inya-t2', name: 'Немецкий', teacherIds: [], subjectFilter: [] });
    const after = useStore.getState().deptGroups.find((g) => g.id === 'inya')!.tables.length;
    expect(after).toBe(before + 1);
  });

  it('updateDeptTable modifies only the specified table', () => {
    useStore.getState().updateDeptTable('hist', 'hist-t1', { name: 'История и культура' });
    const tables = useStore.getState().deptGroups.find((g) => g.id === 'hist')!.tables;
    expect(tables.find((t) => t.id === 'hist-t1')?.name).toBe('История и культура');
    expect(tables.find((t) => t.id === 'hist-t2')?.name).toBe('Обществознание');
  });

  it('deleteDeptTable removes it from the group', () => {
    useStore.getState().deleteDeptTable('hist', 'hist-t2');
    const tables = useStore.getState().deptGroups.find((g) => g.id === 'hist')!.tables;
    expect(tables.find((t) => t.id === 'hist-t2')).toBeUndefined();
    expect(tables.find((t) => t.id === 'hist-t1')).toBeDefined();
  });

  it('moveDeptTable swaps table up', () => {
    const before = useStore.getState().deptGroups.find((g) => g.id === 'hist')!.tables.map((t) => t.id);
    useStore.getState().moveDeptTable('hist', before[1], 'up');
    const after = useStore.getState().deptGroups.find((g) => g.id === 'hist')!.tables.map((t) => t.id);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });

  it('moveDeptTable swaps table down', () => {
    const before = useStore.getState().deptGroups.find((g) => g.id === 'hist')!.tables.map((t) => t.id);
    useStore.getState().moveDeptTable('hist', before[0], 'down');
    const after = useStore.getState().deptGroups.find((g) => g.id === 'hist')!.tables.map((t) => t.id);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });

  it('moveDeptTable does nothing at top boundary (up)', () => {
    const before = useStore.getState().deptGroups.find((g) => g.id === 'hist')!.tables.map((t) => t.id);
    useStore.getState().moveDeptTable('hist', before[0], 'up');
    const after = useStore.getState().deptGroups.find((g) => g.id === 'hist')!.tables.map((t) => t.id);
    expect(after).toEqual(before);
  });

  it('moveDeptTable does nothing at bottom boundary (down)', () => {
    const tables = useStore.getState().deptGroups.find((g) => g.id === 'hist')!.tables;
    const lastId = tables[tables.length - 1].id;
    const before = tables.map((t) => t.id);
    useStore.getState().moveDeptTable('hist', lastId, 'down');
    const after = useStore.getState().deptGroups.find((g) => g.id === 'hist')!.tables.map((t) => t.id);
    expect(after).toEqual(before);
  });
});

describe('setGroupNameOverride (З6-9)', () => {
  it('stores a group name override on the plan', () => {
    useStore.getState().setCurriculumPlan(PLAN);
    useStore.getState().setGroupNameOverride('5а', 'Математика', ['Гр А', 'Гр Б']);
    const overrides = useStore.getState().curriculumPlan?.groupNameOverrides;
    expect(overrides?.['5а']?.['Математика']).toEqual(['Гр А', 'Гр Б']);
  });

  it('does not affect other class overrides', () => {
    useStore.getState().setCurriculumPlan(PLAN);
    useStore.getState().setGroupNameOverride('5а', 'Математика', ['А', 'Б']);
    useStore.getState().setGroupNameOverride('6б', 'Физкультура', ['Д', 'М']);
    const overrides = useStore.getState().curriculumPlan?.groupNameOverrides;
    expect(overrides?.['5а']?.['Математика']).toEqual(['А', 'Б']);
    expect(overrides?.['6б']?.['Физкультура']).toEqual(['Д', 'М']);
  });

  it('does nothing when no plan is loaded', () => {
    useStore.getState().setGroupNameOverride('5а', 'Математика', ['А', 'Б']);
    expect(useStore.getState().curriculumPlan).toBeNull();
  });

  it('allows overwriting an existing override', () => {
    useStore.getState().setCurriculumPlan(PLAN);
    useStore.getState().setGroupNameOverride('5а', 'Математика', ['А', 'Б']);
    useStore.getState().setGroupNameOverride('5а', 'Математика', ['X', 'Y']);
    const overrides = useStore.getState().curriculumPlan?.groupNameOverrides;
    expect(overrides?.['5а']?.['Математика']).toEqual(['X', 'Y']);
  });
});

describe('assignment actions', () => {
  it('setAssignment adds a new assignment', () => {
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 5 });
    expect(useStore.getState().assignments).toHaveLength(1);
  });

  it('setAssignment replaces existing same key', () => {
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 5 });
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 4 });
    expect(useStore.getState().assignments).toHaveLength(1);
    expect(useStore.getState().assignments[0].hoursPerWeek).toBe(4);
  });

  it('removeAssignment removes matching entry', () => {
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 5 });
    useStore.getState().removeAssignment('t1', '5а', 'Математика');
    expect(useStore.getState().assignments).toHaveLength(0);
  });

  it('removeAssignment does not affect other assignments', () => {
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 5 });
    useStore.getState().setAssignment({ teacherId: 't2', className: '5а', subject: 'Физкультура', hoursPerWeek: 3 });
    useStore.getState().removeAssignment('t1', '5а', 'Математика');
    expect(useStore.getState().assignments).toHaveLength(1);
    expect(useStore.getState().assignments[0].subject).toBe('Физкультура');
  });
});

describe('homeroom actions', () => {
  it('setHomeroom sets assignment', () => {
    useStore.getState().setHomeroom('5а', 't1');
    expect(useStore.getState().homeroomAssignments).toHaveLength(1);
    expect(useStore.getState().homeroomAssignments[0]).toEqual({ className: '5а', teacherId: 't1' });
  });

  it('setHomeroom replaces existing assignment for same class', () => {
    useStore.getState().setHomeroom('5а', 't1');
    useStore.getState().setHomeroom('5а', 't2');
    expect(useStore.getState().homeroomAssignments).toHaveLength(1);
    expect(useStore.getState().homeroomAssignments[0].teacherId).toBe('t2');
  });

  it('removeHomeroom removes the class', () => {
    useStore.getState().setHomeroom('5а', 't1');
    useStore.getState().removeHomeroom('5а');
    expect(useStore.getState().homeroomAssignments).toHaveLength(0);
  });
});

const MULTI_PLAN: CurriculumPlan = {
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

describe('pruneOrphanedAssignments (MU-3)', () => {
  it('removes assignments whose subject is not in keepSubjects', () => {
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 4 });
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Химия', hoursPerWeek: 2 });
    useStore.getState().pruneOrphanedAssignments(['Математика']);
    const subjects = useStore.getState().assignments.map((a) => a.subject);
    expect(subjects).toEqual(['Математика']);
  });

  it('keeps all assignments when all subjects are in keep list', () => {
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 4 });
    useStore.getState().pruneOrphanedAssignments(['Математика', 'Физкультура']);
    expect(useStore.getState().assignments).toHaveLength(1);
  });

  it('removes all assignments when keep list is empty', () => {
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 4 });
    useStore.getState().pruneOrphanedAssignments([]);
    expect(useStore.getState().assignments).toHaveLength(0);
  });

  it('does not affect teachers or other state', () => {
    useStore.getState().addTeacher({ id: 't1', name: 'Иванов', initials: 'ИИ', subjects: [] });
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Химия', hoursPerWeek: 2 });
    useStore.getState().pruneOrphanedAssignments([]);
    expect(useStore.getState().teachers).toHaveLength(1);
  });
});

describe('deleteClass (З7-1а)', () => {
  it('removes class from classNames', () => {
    useStore.getState().setCurriculumPlan(MULTI_PLAN);
    useStore.getState().deleteClass('5б');
    expect(useStore.getState().curriculumPlan?.classNames).toEqual(['5а']);
  });

  it('removes class from subject hoursPerClass', () => {
    useStore.getState().setCurriculumPlan(MULTI_PLAN);
    useStore.getState().deleteClass('5б');
    const subj = useStore.getState().curriculumPlan?.grades[0].subjects[0];
    expect(subj?.hoursPerClass).toEqual({ '5а': 4 });
    expect(subj?.hoursPerClass).not.toHaveProperty('5б');
  });

  it('removes assignments for the deleted class', () => {
    useStore.getState().setCurriculumPlan(MULTI_PLAN);
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 4 });
    useStore.getState().setAssignment({ teacherId: 't1', className: '5б', subject: 'Математика', hoursPerWeek: 4 });
    useStore.getState().deleteClass('5б');
    const classes = useStore.getState().assignments.map((a) => a.className);
    expect(classes).toEqual(['5а']);
  });

  it('removes homeroom assignment for the deleted class', () => {
    useStore.getState().setCurriculumPlan(MULTI_PLAN);
    useStore.getState().setHomeroom('5а', 't1');
    useStore.getState().setHomeroom('5б', 't2');
    useStore.getState().deleteClass('5б');
    const classes = useStore.getState().homeroomAssignments.map((h) => h.className);
    expect(classes).toEqual(['5а']);
  });

  it('does nothing when no plan is loaded', () => {
    useStore.getState().deleteClass('5а');
    expect(useStore.getState().curriculumPlan).toBeNull();
  });

  it('does not affect teachers or deptGroups', () => {
    useStore.getState().setCurriculumPlan(MULTI_PLAN);
    useStore.getState().addTeacher({ id: 't1', name: 'Иванов', initials: 'ИИ', subjects: [] });
    useStore.getState().deleteClass('5б');
    expect(useStore.getState().teachers).toHaveLength(1);
    expect(useStore.getState().deptGroups.length).toBeGreaterThan(0);
  });
});

describe('applyDeptSnapshot (MU-2)', () => {
  // Helper: build a minimal snapshot payload for the 'filo' group
  function makeFiloSnapshot(overrides: { teachers?: RNTeacher[]; teacherIds?: string[] } = {}) {
    const filoGroup = useStore.getState().deptGroups.find((g) => g.id === 'filo')!;
    const deptGroup = {
      ...filoGroup,
      tables: filoGroup.tables.map((t) =>
        t.id === 'filo-t1' ? { ...t, teacherIds: overrides.teacherIds ?? t.teacherIds } : t,
      ),
    };
    return { groupId: 'filo', assignments: [], teachers: overrides.teachers ?? [], deptGroup };
  }

  it('replaces assignments for group subjects and adds snapshot assignments', () => {
    // Set up filo group to have Математика in its subject filter
    useStore.getState().updateDeptTable('filo', 'filo-t1', { subjectFilter: ['Математика'] });
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 4 });
    useStore.getState().setAssignment({ teacherId: 't2', className: '5а', subject: 'Химия', hoursPerWeek: 2 });

    const newAssignments = [{ teacherId: 't3', className: '5а', subject: 'Математика', hoursPerWeek: 5 }];
    useStore.getState().applyDeptSnapshot({ ...makeFiloSnapshot(), assignments: newAssignments });

    const result = useStore.getState().assignments;
    // Математика replaced, Химия kept
    expect(result.find((a) => a.subject === 'Математика')?.teacherId).toBe('t3');
    expect(result.find((a) => a.subject === 'Химия')).toBeDefined();
    expect(result).toHaveLength(2);
  });

  it('does not affect assignments for other groups', () => {
    useStore.getState().updateDeptTable('filo', 'filo-t1', { subjectFilter: ['Математика'] });
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Физкультура', hoursPerWeek: 3 });

    useStore.getState().applyDeptSnapshot(makeFiloSnapshot());

    expect(useStore.getState().assignments.find((a) => a.subject === 'Физкультура')).toBeDefined();
  });

  it('does nothing when groupId is unknown', () => {
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 4 });
    const filoGroup = useStore.getState().deptGroups.find((g) => g.id === 'filo')!;
    useStore.getState().applyDeptSnapshot({ groupId: 'nonexistent', assignments: [], teachers: [], deptGroup: filoGroup });
    expect(useStore.getState().assignments).toHaveLength(1);
  });

  it('З16-4: new teacher from snapshot is added to master teacher list', () => {
    const newTeacher: RNTeacher = { id: 'dept-new', name: 'Петрова', initials: 'П.П.', subjects: ['Математика'] };
    useStore.getState().updateDeptTable('filo', 'filo-t1', { subjectFilter: ['Математика'], teacherIds: ['dept-new'] });

    useStore.getState().applyDeptSnapshot(makeFiloSnapshot({ teachers: [newTeacher], teacherIds: ['dept-new'] }));

    const teachers = useStore.getState().teachers;
    expect(teachers.find((t) => t.id === 'dept-new')).toBeDefined();
    expect(teachers.find((t) => t.id === 'dept-new')?.name).toBe('Петрова');
  });

  it('З16-4: existing teacher in snapshot is not duplicated', () => {
    const existing: RNTeacher = { id: 'existing-1', name: 'Иванов', initials: 'И.И.', subjects: ['Математика'] };
    useStore.getState().addTeacher(existing);

    useStore.getState().applyDeptSnapshot(makeFiloSnapshot({ teachers: [existing] }));

    const teachers = useStore.getState().teachers.filter((t) => t.id === 'existing-1');
    expect(teachers).toHaveLength(1);
  });

  it('З16-4: deptGroup is replaced with snapshot version (updated teacherIds)', () => {
    const newTeacher: RNTeacher = { id: 'dept-added', name: 'Сидорова', initials: 'С.С.', subjects: ['Математика'] };
    useStore.getState().updateDeptTable('filo', 'filo-t1', { subjectFilter: ['Математика'] });

    const filoGroup = useStore.getState().deptGroups.find((g) => g.id === 'filo')!;
    const updatedGroup = {
      ...filoGroup,
      tables: filoGroup.tables.map((t) =>
        t.id === 'filo-t1' ? { ...t, teacherIds: [...t.teacherIds, 'dept-added'] } : t,
      ),
    };
    useStore.getState().applyDeptSnapshot({ groupId: 'filo', assignments: [], teachers: [newTeacher], deptGroup: updatedGroup });

    const filo = useStore.getState().deptGroups.find((g) => g.id === 'filo')!;
    expect(filo.tables.find((t) => t.id === 'filo-t1')?.teacherIds).toContain('dept-added');
  });

  it('З17-3: new teacher from кафедра snapshot appears in assignments and teachers after import', () => {
    // Simulate: завуч has existing data (no chem assignments).
    // Кафедра sends snapshot with a NEW teacher + her assignments.
    const chemGroup = useStore.getState().deptGroups.find((g) => g.id === 'chembio')!;
    // Give chem group a subject filter
    useStore.getState().updateDeptTable('chembio', chemGroup.tables[0].id, { subjectFilter: ['Биология'] });

    // Pre-existing assignment for a DIFFERENT subject (not chem)
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 5 });

    // Build snap from кафедра: new teacher + assignments
    const newTeacher: RNTeacher = { id: 'new-bio', name: 'Новикова А.В.', initials: 'А.В.', subjects: ['Биология'] };
    const snapAssignments = [
      { teacherId: 'new-bio', className: '5а', subject: 'Биология', hoursPerWeek: 2 },
      { teacherId: 'new-bio', className: '6а', subject: 'Биология', hoursPerWeek: 2 },
    ];
    const updatedChemGroup = useStore.getState().deptGroups.find((g) => g.id === 'chembio')!;
    const snapDeptGroup = {
      ...updatedChemGroup,
      tables: updatedChemGroup.tables.map((t, i) =>
        i === 0 ? { ...t, teacherIds: ['new-bio'] } : t,
      ),
    };

    useStore.getState().applyDeptSnapshot({
      groupId: 'chembio',
      assignments: snapAssignments,
      teachers: [newTeacher],
      deptGroup: snapDeptGroup,
    });

    const s = useStore.getState();
    // New teacher must be in teachers
    expect(s.teachers.find((t) => t.id === 'new-bio')).toBeDefined();
    // Her assignments must be present
    const newTeacherAssignments = s.assignments.filter((a) => a.teacherId === 'new-bio');
    expect(newTeacherAssignments).toHaveLength(2);
    // Pre-existing non-chem assignment must survive
    expect(s.assignments.find((a) => a.subject === 'Математика')).toBeDefined();
    // Total: 1 (Мат) + 2 (Био) = 3
    expect(s.assignments).toHaveLength(3);
  });
});

describe('bootstrapFromDeptSnapshot', () => {
  it('З9-BUG-1a: initializes full state from a dept snapshot on a blank machine', () => {
    const deptGroup = { id: 'filo', name: 'Филологи', tables: [{ id: 'filo-t1', name: 'Филологи', teacherIds: ['t1'], subjectFilter: ['Математика'] }] };
    useStore.getState().bootstrapFromDeptSnapshot({
      plan: PLAN,
      teachers: [TEACHER],
      deptGroup,
      assignments: [{ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 5 }],
    });
    const s = useStore.getState();
    expect(s.curriculumPlan?.grades[0].subjects[0].name).toBe('Математика');
    expect(s.teachers).toHaveLength(1);
    expect(s.deptGroups).toHaveLength(1);
    expect(s.deptGroups[0].id).toBe('filo');
    expect(s.assignments).toHaveLength(1);
    expect(s.homeroomAssignments).toHaveLength(0);
  });
});

describe('loadFullState', () => {
  it('З9-BUG-1b: replaces all state with data from a backup file', () => {
    useStore.getState().addTeacher(TEACHER);
    useStore.getState().loadFullState({
      curriculumPlan: PLAN,
      teachers: [],
      deptGroups: [],
      assignments: [],
      homeroomAssignments: [],
    });
    const s = useStore.getState();
    expect(s.curriculumPlan).not.toBeNull();
    expect(s.teachers).toHaveLength(0);
    expect(s.deptGroups.length).toBeGreaterThan(0); // falls back to DEFAULT_DEPT_GROUPS
  });
});

describe('resetAll', () => {
  it('clears all state back to initial', () => {
    useStore.getState().setCurriculumPlan(PLAN);
    useStore.getState().addTeacher(TEACHER);
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Мат', hoursPerWeek: 5 });
    useStore.getState().resetAll();
    const s = useStore.getState();
    expect(s.curriculumPlan).toBeNull();
    expect(s.teachers).toHaveLength(0);
    expect(s.assignments).toHaveLength(0);
    expect(s.homeroomAssignments).toHaveLength(0);
    expect(s.deptGroups.length).toBeGreaterThan(0); // defaults restored
  });
});

describe('bulkSetAssignments — З9-3а undo/redo', () => {
  it('replaces the entire assignments array', () => {
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 5 });
    useStore.getState().setAssignment({ teacherId: 't2', className: '5б', subject: 'Физика', hoursPerWeek: 3 });
    expect(useStore.getState().assignments).toHaveLength(2);

    const snapshot = [{ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 5 }];
    useStore.getState().bulkSetAssignments(snapshot);

    expect(useStore.getState().assignments).toHaveLength(1);
    expect(useStore.getState().assignments[0].teacherId).toBe('t1');
  });

  it('restores to empty array', () => {
    useStore.getState().setAssignment({ teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 5 });
    useStore.getState().bulkSetAssignments([]);
    expect(useStore.getState().assignments).toHaveLength(0);
  });
});

// Regression: AssignPage undo bugs fixed in feature/assign-undo-fix
describe('assign-undo regression', () => {
  beforeEach(() => {
    useStore.setState({ assignments: [], teachers: [], deptGroups: [] });
  });

  // Verifies the store primitives used by the fixed handleAssignAllClasses:
  // snapshot via bulkSetAssignments(current) → batch rawSetAssignment calls → undo via bulkSetAssignments(snapshot)
  // This is the pattern after the stale-ref fix: one history snapshot, then raw assigns.
  it('batch-assign then undo restores exactly the pre-batch state', () => {
    const a1 = { teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 5 };
    const a2 = { teacherId: 't1', className: '5б', subject: 'Математика', hoursPerWeek: 5 };
    const a3 = { teacherId: 't1', className: '5в', subject: 'Математика', hoursPerWeek: 5 };

    // Simulate: one existing assignment before batch
    useStore.getState().setAssignment(a1);
    const preLoopSnapshot = [...useStore.getState().assignments]; // [a1]

    // Batch: assign to 5б and 5в (raw store calls, no history push per call)
    useStore.getState().setAssignment(a2);
    useStore.getState().setAssignment(a3);
    expect(useStore.getState().assignments).toHaveLength(3);

    // Undo: restore the single pre-loop snapshot
    useStore.getState().bulkSetAssignments(preLoopSnapshot);
    expect(useStore.getState().assignments).toHaveLength(1);
    expect(useStore.getState().assignments[0].className).toBe('5а');
  });

  // Verifies that removing an assignment and then undoing (bulkSetAssignments) restores it correctly
  it('single remove then undo brings the assignment back', () => {
    const a = { teacherId: 't1', className: '5а', subject: 'Математика', hoursPerWeek: 5 };
    useStore.getState().setAssignment(a);
    const snapshot = [...useStore.getState().assignments]; // [a]

    useStore.getState().removeAssignment('t1', '5а', 'Математика');
    expect(useStore.getState().assignments).toHaveLength(0);

    useStore.getState().bulkSetAssignments(snapshot);
    expect(useStore.getState().assignments).toHaveLength(1);
    expect(useStore.getState().assignments[0].teacherId).toBe('t1');
  });
});
