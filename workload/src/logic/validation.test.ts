import { describe, it, expect } from 'vitest';
import { hoursPerClass, requiredHoursForClass, validateWorkload, findDivergentSplitHours } from './validation';
import { computeTeacherTotalHours } from './teacherHours';
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

describe('computeTeacherTotalHours', () => {
  it('sums hours per teacher', () => {
    const assignments: Assignment[] = [
      makeAssignment({ teacherId: 't1', hoursPerWeek: 5 }),
      makeAssignment({ teacherId: 't1', className: '6а', hoursPerWeek: 4 }),
      makeAssignment({ teacherId: 't2', hoursPerWeek: 6 }),
    ];
    expect(computeTeacherTotalHours('t1', assignments)).toBe(9);
    expect(computeTeacherTotalHours('t2', assignments)).toBe(6);
  });

  it('doubles hoursPerWeek when bothGroups=true (RF-W1)', () => {
    // bothGroups=true means the teacher handles both group slots → counts double
    const assignments: Assignment[] = [
      makeAssignment({ teacherId: 't1', hoursPerWeek: 3, bothGroups: true }),
    ];
    expect(computeTeacherTotalHours('t1', assignments)).toBe(6);
  });

  it('does not count homeroom hours (paid separately, З7-2)', () => {
    const result = computeTeacherTotalHours('t1', [makeAssignment({ hoursPerWeek: 5 })]);
    expect(result).toBe(5);
  });
});

describe('findDivergentSplitHours', () => {
  it('RF-W4: detects divergent hoursPerWeek between split halves', () => {
    const assignments: Assignment[] = [
      makeAssignment({ subject: 'Физкультура', teacherId: 't1', hoursPerWeek: 3 }),
      makeAssignment({ subject: 'Физкультура', teacherId: 't2', hoursPerWeek: 2 }),
    ];
    const result = findDivergentSplitHours(assignments);
    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe('Физкультура');
    expect(result[0].hours).toEqual(expect.arrayContaining([3, 2]));
  });

  it('RF-W4: returns nothing when halves agree', () => {
    const assignments: Assignment[] = [
      makeAssignment({ subject: 'Физкультура', teacherId: 't1', hoursPerWeek: 3 }),
      makeAssignment({ subject: 'Физкультура', teacherId: 't2', hoursPerWeek: 3 }),
    ];
    expect(findDivergentSplitHours(assignments)).toHaveLength(0);
  });

  it('RF-W4: single assignment is never divergent', () => {
    expect(findDivergentSplitHours([makeAssignment()])).toHaveLength(0);
  });

  it('RF-W4: validateWorkload surfaces divergent split hours as warning', () => {
    const assignments: Assignment[] = [
      makeAssignment({ subject: 'Физкультура', teacherId: 't1', hoursPerWeek: 3 }),
      makeAssignment({ subject: 'Физкультура', teacherId: 't2', hoursPerWeek: 2 }),
      makeAssignment({ subject: 'Математика', teacherId: 't1', hoursPerWeek: 5 }),
    ];
    const issues = validateWorkload(PLAN, [TEACHER], assignments, []);
    const divergent = issues.filter((i) => i.message.includes('расходятся'));
    expect(divergent).toHaveLength(1);
    expect(divergent[0].message).toContain('Физкультура');
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
    // Total: 5+3=8 < СанПиН 29 (homeroom/Разговоры не входит в лимит), all subjects assigned
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

  it('З18-3: warns when subject has more teachers assigned than planned', () => {
    // Математика is non-split (1 slot planned), assign 2 teachers
    const assignments: Assignment[] = [
      makeAssignment({ subject: 'Математика', teacherId: 't1', hoursPerWeek: 5 }),
      makeAssignment({ subject: 'Математика', teacherId: 't2', hoursPerWeek: 5 }),
      makeAssignment({ subject: 'Физкультура', teacherId: 't1', hoursPerWeek: 3 }),
      makeAssignment({ subject: 'Физкультура', teacherId: 't2', hoursPerWeek: 3 }),
    ];
    const issues = validateWorkload(PLAN, [TEACHER], assignments, []);
    const overAssigned = issues.filter((i) => i.message.includes('назначено учителей'));
    // Математика: 2 assigned, 1 planned → warning. Физкультура: 2 assigned, 2 planned (groupSplit) → ok
    expect(overAssigned).toHaveLength(1);
    expect(overAssigned[0].message).toContain('Математика');
  });

  it('З18-3: no warning when groupSplit has correct number of teachers', () => {
    const assignments: Assignment[] = [
      makeAssignment({ subject: 'Математика', teacherId: 't1', hoursPerWeek: 5 }),
      makeAssignment({ subject: 'Физкультура', teacherId: 't1', hoursPerWeek: 3 }),
      makeAssignment({ subject: 'Физкультура', teacherId: 't2', hoursPerWeek: 3 }),
    ];
    const issues = validateWorkload(PLAN, [TEACHER], assignments, []);
    const overAssigned = issues.filter((i) => i.message.includes('назначено учителей'));
    expect(overAssigned).toHaveLength(0);
  });

  it('З18-3: bothGroups=true counts as 2 slots', () => {
    const assignments: Assignment[] = [
      makeAssignment({ subject: 'Математика', hoursPerWeek: 5 }),
      makeAssignment({ subject: 'Физкультура', hoursPerWeek: 3, bothGroups: true }),
    ];
    const issues = validateWorkload(PLAN, [TEACHER], assignments, []);
    const overAssigned = issues.filter((i) => i.message.includes('назначено учителей'));
    expect(overAssigned).toHaveLength(0);
  });

  it('RF-W1: bothGroups=true is counted as double hours in teacher overload check', () => {
    // Teacher with bothGroups=true on 18h subject effectively works 36h > 34h limit.
    // Old hoursPerTeacher counted 18h (no flag). computeTeacherTotalHours counts 36h (flag fires).
    const assignments: Assignment[] = [
      makeAssignment({ subject: 'Физкультура', hoursPerWeek: 18, bothGroups: true }),
    ];
    const issues = validateWorkload(PLAN, [TEACHER], assignments, []);
    const overload = issues.filter((i) => i.severity === 'error' && i.target === TEACHER.name);
    expect(overload).toHaveLength(1);
    expect(overload[0].message).toContain('36');
  });

  it('RF-W3: warns when groupSplit subject has only 1 teacher (no bothGroups)', () => {
    // Физкультура is groupSplit=true (2 slots expected). Assign only 1 teacher without bothGroups.
    // validateWorkload should emit a "not enough teachers" warning.
    const assignments: Assignment[] = [
      makeAssignment({ subject: 'Физкультура', teacherId: 't1', hoursPerWeek: 3 }),
      makeAssignment({ subject: 'Математика', teacherId: 't1', hoursPerWeek: 5 }),
    ];
    const issues = validateWorkload(PLAN, [TEACHER], assignments, []);
    const missingPartner = issues.filter((i) => i.message.includes('не хватает учителей'));
    expect(missingPartner).toHaveLength(1);
    expect(missingPartner[0].message).toContain('Физкультура');
  });

  it('RF-W3: no missing-partner warning when bothGroups=true covers both slots', () => {
    const assignments: Assignment[] = [
      makeAssignment({ subject: 'Физкультура', hoursPerWeek: 3, bothGroups: true }),
      makeAssignment({ subject: 'Математика', hoursPerWeek: 5 }),
    ];
    const issues = validateWorkload(PLAN, [TEACHER], assignments, []);
    const missingPartner = issues.filter((i) => i.message.includes('не хватает учителей'));
    expect(missingPartner).toHaveLength(0);
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

  it('homeroom assignment does not contribute to SanPiN class total', () => {
    // 5а UP is exactly at the SanPiN limit (5+3+... = 29). Adding a homeroom assignment
    // must NOT push the class over the limit.
    const assignments: Assignment[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeAssignment({ subject: `Предмет${i}`, hoursPerWeek: 5 }),
      ),
      makeAssignment({ subject: 'Физкультура', hoursPerWeek: 4 }),
    ]; // total = 29 (exactly at limit)
    const homeroom: HomeroomAssignment[] = [{ className: '5а', teacherId: 't1' }];
    const issues = validateWorkload(PLAN, [TEACHER], assignments, homeroom);
    // homeroom must NOT push total to 30 and trigger a false SanPiN error
    expect(issues.filter((i) => i.severity === 'error' && i.message.includes('СанПиН'))).toHaveLength(0);
  });

  it('SanPiN overload error includes subject breakdown in detail field', () => {
    // 30 hours total — over the 29 limit for grade 5
    const assignments: Assignment[] = [
      makeAssignment({ subject: 'Математика', hoursPerWeek: 6 }),
      makeAssignment({ subject: 'Физкультура', hoursPerWeek: 5 }),
      makeAssignment({ subject: 'Русский язык', hoursPerWeek: 5 }),
      makeAssignment({ subject: 'История', hoursPerWeek: 5 }),
      makeAssignment({ subject: 'Биология', hoursPerWeek: 5 }),
      makeAssignment({ subject: 'Химия', hoursPerWeek: 4 }),
    ]; // total = 30
    const issues = validateWorkload(PLAN, [TEACHER], assignments, []);
    const sanpinError = issues.find((i) => i.severity === 'error' && i.message.includes('СанПиН'));
    expect(sanpinError).toBeDefined();
    expect(sanpinError!.detail).toBeDefined();
    expect(sanpinError!.detail).toContain('Математика 6ч');
    // Subjects should be sorted descending by hours (6ч before 5ч)
    const detailText = sanpinError!.detail!;
    expect(detailText.indexOf('Математика 6ч')).toBeLessThan(detailText.indexOf('Химия 4ч'));
  });
});
