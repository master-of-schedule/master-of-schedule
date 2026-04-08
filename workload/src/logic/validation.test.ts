import { describe, it, expect } from 'vitest';
import { hoursPerClass, hoursPerTeacher, requiredHoursForClass, validateWorkload } from './validation';
import type { CurriculumPlan, Assignment, HomeroomAssignment, RNTeacher } from '../types';

const PLAN: CurriculumPlan = {
  classNames: ['5а'],
  grades: [
    {
      grade: 5,
      subjects: [
        { name: 'Математика', shortName: 'Мат', hoursPerClass: { '5а': 5 }, groupSplit: false, part: 'mandatory' as const },
        { name: 'Физкультура', shortName: 'Физ-ра', hoursPerClass: { '5а': 3 }, groupSplit: true, part: 'mandatory' as const },
      ],
    },
  ],
};

const TEACHER: RNTeacher = {
  id: 't1',
  name: 'Иванов Иван Иванович',
  initials: 'И.И.',
  subjects: ['Математика'],
};

function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    teacherId: 't1',
    className: '5а',
    subject: 'Математика',
    hoursPerWeek: 5,
    ...overrides,
  };
}

describe('hoursPerClass', () => {
  it('sums hours per class across different subjects', () => {
    const assignments: Assignment[] = [
      makeAssignment({ className: '5а', subject: 'Математика', hoursPerWeek: 5 }),
      makeAssignment({ className: '5а', subject: 'Физкультура', hoursPerWeek: 3 }),
      makeAssignment({ className: '6б', subject: 'Математика', hoursPerWeek: 4 }),
    ];
    const result = hoursPerClass(assignments);
    expect(result['5а']).toBe(8);
    expect(result['6б']).toBe(4);
  });

  it('returns empty object for no assignments', () => {
    expect(hoursPerClass([])).toEqual({});
  });

  it('З17-1: does not double-count groupSplit subjects (two teachers, same class+subject)', () => {
    // groupSplit subject: two teachers each assigned to the same class+subject
    const assignments: Assignment[] = [
      makeAssignment({ className: '5а', subject: 'Английский', teacherId: 't1', hoursPerWeek: 2 }),
      makeAssignment({ className: '5а', subject: 'Английский', teacherId: 't2', hoursPerWeek: 2 }),
      makeAssignment({ className: '5а', subject: 'Математика', teacherId: 't1', hoursPerWeek: 5 }),
    ];
    const result = hoursPerClass(assignments);
    // Should count Английский only once: 2 + 5 = 7, not 2+2+5=9
    expect(result['5а']).toBe(7);
  });

  it('З17-1: bothGroups does not inflate class total (one teacher, both groups)', () => {
    const assignments: Assignment[] = [
      makeAssignment({ className: '5а', subject: 'Физкультура', teacherId: 't1', hoursPerWeek: 3, bothGroups: true }),
      makeAssignment({ className: '5а', subject: 'Математика', teacherId: 't2', hoursPerWeek: 5 }),
    ];
    const result = hoursPerClass(assignments);
    // Class has 3h PE + 5h math = 8h, NOT 6+5=11 (bothGroups is teacher-level, not class-level)
    expect(result['5а']).toBe(8);
  });
});

describe('hoursPerTeacher', () => {
  it('sums hours per teacher', () => {
    const assignments: Assignment[] = [
      makeAssignment({ teacherId: 't1', hoursPerWeek: 5 }),
      makeAssignment({ teacherId: 't1', className: '6а', hoursPerWeek: 4 }),
      makeAssignment({ teacherId: 't2', hoursPerWeek: 6 }),
    ];
    const result = hoursPerTeacher(assignments);
    expect(result['t1']).toBe(9);
    expect(result['t2']).toBe(6);
  });

  it('does not count homeroom hours (paid separately, З7-2)', () => {
    // homeroom parameter removed — З7-2: paid under a different budget line
    const result = hoursPerTeacher([makeAssignment({ hoursPerWeek: 5 })]);
    expect(result['t1']).toBe(5);
  });
});

describe('requiredHoursForClass', () => {
  it('sums all subject hours for a class', () => {
    expect(requiredHoursForClass(PLAN, '5а')).toBe(8); // 5 math + 3 pe
  });

  it('returns 0 for class not in plan', () => {
    expect(requiredHoursForClass(PLAN, '9г')).toBe(0);
  });
});

describe('validateWorkload', () => {
  it('returns no issues for valid assignment', () => {
    const assignments: Assignment[] = [
      makeAssignment({ subject: 'Математика', hoursPerWeek: 5 }),
      makeAssignment({ subject: 'Физкультура', hoursPerWeek: 3 }),
    ];
    const homeroom: HomeroomAssignment[] = [{ className: '5а', teacherId: 't1' }];
    const issues = validateWorkload(PLAN, [TEACHER], assignments, homeroom);
    // Total: 5+3+1=9 < СанПиН 29, all subjects assigned
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(issues.filter((i) => i.message.includes('не назначен'))).toHaveLength(0);
  });

  it('reports СанПиН error when class hours exceed limit', () => {
    // Assign 30 hours to 5а (СанПиН max is 29)
    const assignments: Assignment[] = Array.from({ length: 6 }, (_, i) =>
      makeAssignment({ subject: `Предмет${i}`, hoursPerWeek: 5 }),
    );
    const issues = validateWorkload(PLAN, [TEACHER], assignments, []);
    expect(issues.some((i) => i.severity === 'error' && i.target === '5а')).toBe(true);
  });

  it('reports warning for unassigned subject', () => {
    const issues = validateWorkload(PLAN, [TEACHER], [], []);
    const unassigned = issues.filter((i) => i.message.includes('не назначен'));
    expect(unassigned).toHaveLength(2); // Математика + Физкультура
  });

  it('reports error when teacher exceeds 34h', () => {
    const assignments: Assignment[] = Array.from({ length: 8 }, (_, i) =>
      makeAssignment({ subject: `Предмет${i}`, className: `${i + 5}а`, hoursPerWeek: 5 }),
    );
    const issues = validateWorkload(PLAN, [TEACHER], assignments, []);
    expect(issues.some((i) => i.severity === 'error' && i.target === TEACHER.name)).toBe(true);
  });

  it('З17-1: groupSplit does not cause false СанПиН error', () => {
    // 5а has СанПиН max 29. Assign 28h of various subjects + 3h Физкультура split between 2 teachers.
    // Without dedup: 28 + 3 + 3 = 34 > 29 → false error
    // With dedup: 28 + 3 = 31 > 29 → still over, but correctly
    // Better test: 25h + 3h split = 28 (under 29), should NOT trigger error
    const assignments: Assignment[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeAssignment({ subject: `Предмет${i}`, hoursPerWeek: 5 }),
      ),
      makeAssignment({ subject: 'Физкультура', teacherId: 't1', hoursPerWeek: 3 }),
      makeAssignment({ subject: 'Физкультура', teacherId: 't2', hoursPerWeek: 3 }),
    ];
    // Total without dedup: 25 + 3 + 3 = 31 > 29 → false error
    // Total with dedup: 25 + 3 = 28 < 29 → no error
    const issues = validateWorkload(PLAN, [TEACHER], assignments, []);
    const sanpinErrors = issues.filter((i) => i.severity === 'error' && i.message.includes('СанПиН'));
    expect(sanpinErrors).toHaveLength(0);
  });
});
