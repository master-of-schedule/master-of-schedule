import { describe, it, expect } from 'vitest';
import { mergeTeachers, type MergeInput } from './mergeTeachers';
import type { Assignment, DeptGroup, RNTeacher } from '../types';

function makeTeacher(id: string, name: string, extra: Partial<RNTeacher> = {}): RNTeacher {
  return { id, name, initials: '', subjects: [], ...extra };
}

function baseInput(overrides: Partial<MergeInput> = {}): MergeInput {
  return {
    teachers: [],
    assignments: [],
    homeroomAssignments: [],
    deptGroups: [],
    ...overrides,
  };
}

describe('mergeTeachers — assignments', () => {
  it('re-points removed teacher\'s assignments to kept teacher', () => {
    const input = baseInput({
      teachers: [
        makeTeacher('keep', 'Мартынова Елена Анатольевна'),
        makeTeacher('rm', 'Мартынова Елена Анаольевна'),
      ],
      assignments: [
        { teacherId: 'rm', className: '5а', subject: 'Информатика', hoursPerWeek: 1 },
        { teacherId: 'rm', className: '6б', subject: 'Информатика', hoursPerWeek: 1 },
      ],
    });
    const out = mergeTeachers(input, 'keep', 'rm');
    expect(out.assignments).toHaveLength(2);
    expect(out.assignments.every((a) => a.teacherId === 'keep')).toBe(true);
    expect(out.conflicts).toHaveLength(0);
  });

  it('kept teacher wins when both have assignment on same class+subject', () => {
    const input = baseInput({
      teachers: [
        makeTeacher('keep', 'Мартынова Елена Анатольевна'),
        makeTeacher('rm', 'Мартынова Елена Анаольевна'),
      ],
      assignments: [
        { teacherId: 'keep', className: '5а', subject: 'Информатика', hoursPerWeek: 1 },
        { teacherId: 'rm', className: '5а', subject: 'Информатика', hoursPerWeek: 2 },
      ],
    });
    const out = mergeTeachers(input, 'keep', 'rm');
    expect(out.assignments).toHaveLength(1);
    expect(out.assignments[0].hoursPerWeek).toBe(1); // kept's value
    expect(out.conflicts).toContainEqual(
      expect.objectContaining({ type: 'assignment-duplicate' }),
    );
  });

  it('preserves bothGroups flag during transfer', () => {
    const input = baseInput({
      teachers: [
        makeTeacher('keep', 'A'),
        makeTeacher('rm', 'B'),
      ],
      assignments: [
        { teacherId: 'rm', className: '5а', subject: 'Физра', hoursPerWeek: 2, bothGroups: true },
      ],
    });
    const out = mergeTeachers(input, 'keep', 'rm');
    expect(out.assignments[0]).toEqual({
      teacherId: 'keep', className: '5а', subject: 'Физра', hoursPerWeek: 2, bothGroups: true,
    });
  });

  it('does not touch assignments on unrelated teachers', () => {
    const other: Assignment = { teacherId: 'other', className: '5а', subject: 'Физика', hoursPerWeek: 2 };
    const input = baseInput({
      teachers: [
        makeTeacher('keep', 'A'),
        makeTeacher('rm', 'B'),
        makeTeacher('other', 'C'),
      ],
      assignments: [
        other,
        { teacherId: 'rm', className: '6а', subject: 'Информатика', hoursPerWeek: 1 },
      ],
    });
    const out = mergeTeachers(input, 'keep', 'rm');
    expect(out.assignments).toContainEqual(other);
    expect(out.assignments).toHaveLength(2);
  });
});

describe('mergeTeachers — homeroom assignments', () => {
  it('transfers homeroom from removed to kept', () => {
    const input = baseInput({
      teachers: [
        makeTeacher('keep', 'A'),
        makeTeacher('rm', 'B'),
      ],
      homeroomAssignments: [{ className: '5а', teacherId: 'rm' }],
    });
    const out = mergeTeachers(input, 'keep', 'rm');
    expect(out.homeroomAssignments).toEqual([{ className: '5а', teacherId: 'keep' }]);
    expect(out.conflicts).toHaveLength(0);
  });

  it('warns when kept ends up homeroom for multiple classes', () => {
    const input = baseInput({
      teachers: [
        makeTeacher('keep', 'A', { homeroomClass: '5а' }),
        makeTeacher('rm', 'B', { homeroomClass: '6б' }),
      ],
      homeroomAssignments: [
        { className: '5а', teacherId: 'keep' },
        { className: '6б', teacherId: 'rm' },
      ],
    });
    const out = mergeTeachers(input, 'keep', 'rm');
    expect(out.homeroomAssignments).toHaveLength(2);
    expect(out.homeroomAssignments.every((h) => h.teacherId === 'keep')).toBe(true);
    expect(out.conflicts.some((c) => c.type === 'multiple-homerooms-after-merge')).toBe(true);
  });

  it('drops duplicate homeroom on same class (kept wins)', () => {
    const input = baseInput({
      teachers: [
        makeTeacher('keep', 'A'),
        makeTeacher('rm', 'B'),
      ],
      homeroomAssignments: [
        { className: '5а', teacherId: 'keep' },
        { className: '5а', teacherId: 'rm' }, // impossible by app's 1:1 rule, but defensive
      ],
    });
    const out = mergeTeachers(input, 'keep', 'rm');
    expect(out.homeroomAssignments).toHaveLength(1);
    expect(out.homeroomAssignments[0].teacherId).toBe('keep');
    expect(out.conflicts.some((c) => c.type === 'homeroom-class-conflict')).toBe(true);
  });

  it('flags conflict when both RNTeacher.homeroomClass differ, kept wins', () => {
    const input = baseInput({
      teachers: [
        makeTeacher('keep', 'A', { homeroomClass: '5а' }),
        makeTeacher('rm', 'B', { homeroomClass: '6б' }),
      ],
    });
    const out = mergeTeachers(input, 'keep', 'rm');
    const kept = out.teachers.find((t) => t.id === 'keep')!;
    expect(kept.homeroomClass).toBe('5а');
    expect(out.conflicts.some((c) => c.type === 'homeroom-class-conflict')).toBe(true);
  });

  it('transfers homeroomClass field when kept has none and removed has one', () => {
    const input = baseInput({
      teachers: [
        makeTeacher('keep', 'A'),
        makeTeacher('rm', 'B', { homeroomClass: '5а' }),
      ],
    });
    const out = mergeTeachers(input, 'keep', 'rm');
    const kept = out.teachers.find((t) => t.id === 'keep')!;
    expect(kept.homeroomClass).toBe('5а');
    expect(out.conflicts).toHaveLength(0);
  });
});

describe('mergeTeachers — dept tables', () => {
  it('replaces removed id with kept id in every table', () => {
    const deptGroups: DeptGroup[] = [
      {
        id: 'g1', name: 'Информатика',
        tables: [
          { id: 't1', name: 'Осн', teacherIds: ['other', 'rm'], subjectFilter: ['Информатика'] },
          { id: 't2', name: 'Доп', teacherIds: ['rm'], subjectFilter: [] },
        ],
      },
    ];
    const input = baseInput({
      teachers: [
        makeTeacher('keep', 'A'),
        makeTeacher('rm', 'B'),
        makeTeacher('other', 'C'),
      ],
      deptGroups,
    });
    const out = mergeTeachers(input, 'keep', 'rm');
    expect(out.deptGroups[0].tables[0].teacherIds).toEqual(['other', 'keep']);
    expect(out.deptGroups[0].tables[1].teacherIds).toEqual(['keep']);
  });

  it('dedupes when kept was already in the same table', () => {
    const deptGroups: DeptGroup[] = [
      {
        id: 'g1', name: 'Информатика',
        tables: [
          { id: 't1', name: 'Осн', teacherIds: ['keep', 'rm'], subjectFilter: ['Информатика'] },
        ],
      },
    ];
    const input = baseInput({
      teachers: [
        makeTeacher('keep', 'A'),
        makeTeacher('rm', 'B'),
      ],
      deptGroups,
    });
    const out = mergeTeachers(input, 'keep', 'rm');
    expect(out.deptGroups[0].tables[0].teacherIds).toEqual(['keep']);
  });

  it('does not touch tables that do not contain the removed id', () => {
    const deptGroups: DeptGroup[] = [
      {
        id: 'g1', name: 'Другая кафедра',
        tables: [{ id: 't1', name: 'Стол', teacherIds: ['other'], subjectFilter: [] }],
      },
    ];
    const input = baseInput({
      teachers: [
        makeTeacher('keep', 'A'),
        makeTeacher('rm', 'B'),
        makeTeacher('other', 'C'),
      ],
      deptGroups,
    });
    const out = mergeTeachers(input, 'keep', 'rm');
    expect(out.deptGroups).toEqual(deptGroups);
  });
});

describe('mergeTeachers — teacher record', () => {
  it('removes the removed teacher from the teachers array', () => {
    const input = baseInput({
      teachers: [
        makeTeacher('keep', 'A'),
        makeTeacher('rm', 'B'),
        makeTeacher('other', 'C'),
      ],
    });
    const out = mergeTeachers(input, 'keep', 'rm');
    expect(out.teachers.map((t) => t.id).sort()).toEqual(['keep', 'other']);
  });

  it('merges subjects as a union, preserving kept order', () => {
    const input = baseInput({
      teachers: [
        makeTeacher('keep', 'A', { subjects: ['Математика', 'Физика'] }),
        makeTeacher('rm', 'B', { subjects: ['Физика', 'Информатика'] }),
      ],
    });
    const out = mergeTeachers(input, 'keep', 'rm');
    const kept = out.teachers.find((t) => t.id === 'keep')!;
    expect(kept.subjects).toEqual(['Математика', 'Физика', 'Информатика']);
  });

  it('uses kept defaultRoom, falls back to removed when kept has none', () => {
    const withKept = mergeTeachers(baseInput({
      teachers: [
        makeTeacher('keep', 'A', { defaultRoom: '201' }),
        makeTeacher('rm', 'B', { defaultRoom: '305' }),
      ],
    }), 'keep', 'rm');
    expect(withKept.teachers.find((t) => t.id === 'keep')!.defaultRoom).toBe('201');

    const fallback = mergeTeachers(baseInput({
      teachers: [
        makeTeacher('keep', 'A'),
        makeTeacher('rm', 'B', { defaultRoom: '305' }),
      ],
    }), 'keep', 'rm');
    expect(fallback.teachers.find((t) => t.id === 'keep')!.defaultRoom).toBe('305');
  });
});

describe('mergeTeachers — edge cases', () => {
  it('returns input + conflict when keepId === removeId', () => {
    const input = baseInput({
      teachers: [makeTeacher('same', 'A')],
    });
    const out = mergeTeachers(input, 'same', 'same');
    expect(out.teachers).toEqual(input.teachers);
    expect(out.conflicts).toHaveLength(1);
  });

  it('returns input + conflict when a teacher id is missing', () => {
    const input = baseInput({ teachers: [makeTeacher('a', 'A')] });
    const out = mergeTeachers(input, 'a', 'b');
    expect(out.teachers).toEqual(input.teachers);
    expect(out.conflicts).toHaveLength(1);
  });
});

describe('mergeTeachers — full scenario (stakeholder case)', () => {
  it('Мартынова merge: assignments + dept + homeroom all migrate', () => {
    const input = baseInput({
      teachers: [
        makeTeacher('keep', 'Мартынова Елена Анатольевна', { homeroomClass: '7а' }),
        makeTeacher('rm', 'Мартынова Елена Анаольевна'),
        makeTeacher('other', 'Иванов С.Н.'),
      ],
      assignments: [
        { teacherId: 'rm', className: '5а', subject: 'Информатика', hoursPerWeek: 1, bothGroups: true },
        { teacherId: 'rm', className: '7а', subject: 'Информатика', hoursPerWeek: 1 },
        { teacherId: 'other', className: '5а', subject: 'Физика', hoursPerWeek: 2 },
      ],
      homeroomAssignments: [{ className: '7а', teacherId: 'keep' }],
      deptGroups: [
        {
          id: 'g1', name: 'ИнфоТехно',
          tables: [
            { id: 't1', name: 'Информатика', teacherIds: ['rm', 'other'], subjectFilter: ['Информатика'] },
          ],
        },
      ],
    });
    const out = mergeTeachers(input, 'keep', 'rm');

    expect(out.teachers.map((t) => t.id).sort()).toEqual(['keep', 'other']);
    expect(out.assignments.filter((a) => a.teacherId === 'rm')).toHaveLength(0);
    expect(out.assignments.filter((a) => a.teacherId === 'keep')).toHaveLength(2);
    expect(out.deptGroups[0].tables[0].teacherIds).toEqual(['keep', 'other']);
    expect(out.homeroomAssignments).toEqual([{ className: '7а', teacherId: 'keep' }]);
    expect(out.conflicts).toHaveLength(0);

    // bothGroups preserved on transfer
    const info5a = out.assignments.find((a) => a.className === '5а' && a.subject === 'Информатика')!;
    expect(info5a.bothGroups).toBe(true);
  });
});
