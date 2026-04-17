import { describe, it, expect } from 'vitest';
import { buildOfficialReport, schoolYearFromDate } from './officialReport';
import type { Assignment, RNTeacher, HomeroomAssignment, CurriculumPlan, DeptGroup } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTeacher(id: string, name: string): RNTeacher {
  return { id, name, initials: id.toUpperCase(), subjects: [], homeroomClass: undefined };
}

function makeAssignment(
  teacherId: string,
  className: string,
  subject: string,
  hoursPerWeek: number,
): Assignment {
  return { teacherId, className, subject, hoursPerWeek };
}

const BASIC_PLAN: CurriculumPlan = {
  classNames: ['5а', '5б', '7г', '10а', '11а'],
  grades: [
    {
      grade: 5,
      subjects: [
        { name: 'Физика', shortName: '', hoursPerClass: { '5а': 2, '5б': 2 }, groupSplit: false, part: 'mandatory' },
        { name: 'Химия', shortName: '', hoursPerClass: { '5а': 2, '5б': 2 }, groupSplit: false, part: 'mandatory' },
        { name: 'Русский язык', shortName: '', hoursPerClass: { '5а': 4, '5б': 4 }, groupSplit: false, part: 'mandatory' },
        { name: 'Литература', shortName: '', hoursPerClass: { '5а': 2, '5б': 2 }, groupSplit: false, part: 'mandatory' },
      ],
    },
    {
      grade: 7,
      subjects: [
        { name: 'Алгебра', shortName: '', hoursPerClass: { '7г': 3 }, groupSplit: false, part: 'mandatory' },
        { name: 'Геометрия', shortName: '', hoursPerClass: { '7г': 2 }, groupSplit: false, part: 'mandatory' },
        { name: 'Вероятность и статистика', shortName: '', hoursPerClass: { '7г': 1 }, groupSplit: false, part: 'mandatory' },
        { name: 'Физическая культура', shortName: '', hoursPerClass: { '7г': 2 }, groupSplit: true, part: 'mandatory' },
      ],
    },
    {
      grade: 10,
      subjects: [
        { name: 'Физика', shortName: '', hoursPerClass: { '10а': 3 }, groupSplit: false, part: 'mandatory' },
        { name: 'Практикум ЕГЭ по русскому языку', shortName: '', hoursPerClass: { '10а': 1 }, groupSplit: false, part: 'optional' },
      ],
    },
    {
      grade: 11,
      subjects: [
        { name: 'Практикум ЕГЭ по русскому языку', shortName: '', hoursPerClass: { '11а': 1 }, groupSplit: false, part: 'optional' },
      ],
    },
  ],
};

const TEACHERS = [
  makeTeacher('t1', 'Иванова А.В.'),
  makeTeacher('t2', 'Петров С.Н.'),
  makeTeacher('t3', 'Сидорова М.К.'),
];

// ─── schoolYearFromDate ────────────────────────────────────────────────────────

describe('schoolYearFromDate', () => {
  it('calendar year becomes the start of the school year', () => {
    // Workload is always planned for the NEXT year: 2026 → 2026-2027
    expect(schoolYearFromDate('2026-04-17')).toBe('2026-2027');
  });

  it('any month in 2026 → 2026-2027', () => {
    expect(schoolYearFromDate('2026-01-01')).toBe('2026-2027');
    expect(schoolYearFromDate('2026-08-18')).toBe('2026-2027');
    expect(schoolYearFromDate('2026-12-31')).toBe('2026-2027');
  });

  it('2025 → 2025-2026', () => {
    expect(schoolYearFromDate('2025-09-01')).toBe('2025-2026');
  });

  it('returns empty string for empty input', () => {
    expect(schoolYearFromDate('')).toBe('');
  });
});

// ─── Compound group merging ───────────────────────────────────────────────────

describe('buildOfficialReport — compound groups', () => {
  it('merges Русский язык + Литература into one compound group', () => {
    const assignments: Assignment[] = [
      makeAssignment('t1', '5а', 'Русский язык', 4),
      makeAssignment('t1', '5а', 'Литература', 2),
    ];
    const report = buildOfficialReport(BASIC_PLAN, assignments, TEACHERS, [], '2025-08-18', '');
    const group = report.subjectGroups.find((g) => g.subjects.includes('Русский язык'));
    expect(group).toBeDefined();
    expect(group!.isCompound).toBe(true);
    expect(group!.subjects).toContain('Литература');
    expect(group!.displayName).toBe('Русский язык, Литература');
    expect(group!.totalHours).toBe(6);
  });

  it('merges Алгебра + Геометрия + Вероятность и статистика into one compound group', () => {
    const assignments: Assignment[] = [
      makeAssignment('t2', '7г', 'Алгебра', 3),
      makeAssignment('t2', '7г', 'Геометрия', 2),
      makeAssignment('t2', '7г', 'Вероятность и статистика', 1),
    ];
    const report = buildOfficialReport(BASIC_PLAN, assignments, TEACHERS, [], '2025-08-18', '');
    const group = report.subjectGroups.find((g) => g.subjects.includes('Алгебра'));
    expect(group).toBeDefined();
    expect(group!.isCompound).toBe(true);
    expect(group!.subjects).toHaveLength(3);
    expect(group!.teachers[0].cells5to9).toBe('7-г(3/2/1)');
    expect(group!.teachers[0].totalHours).toBe(6);
  });

  it('startsWith matching: "Вероятность" matches prefix "Вероятность"', () => {
    const assignments: Assignment[] = [
      makeAssignment('t2', '7г', 'Алгебра', 3),
      makeAssignment('t2', '7г', 'Вероятность и статистика', 1),
    ];
    const report = buildOfficialReport(BASIC_PLAN, assignments, TEACHERS, [], '2025-08-18', '');
    const group = report.subjectGroups.find((g) => g.subjects.includes('Алгебра'));
    expect(group!.isCompound).toBe(true);
    expect(group!.subjects).toContain('Вероятность и статистика');
  });

  it('compound subjectBreakdown is populated correctly', () => {
    const assignments: Assignment[] = [
      makeAssignment('t1', '5а', 'Русский язык', 4),
      makeAssignment('t1', '5б', 'Русский язык', 4),
      makeAssignment('t1', '5а', 'Литература', 2),
      makeAssignment('t1', '5б', 'Литература', 2),
    ];
    const report = buildOfficialReport(BASIC_PLAN, assignments, TEACHERS, [], '2025-08-18', '');
    const group = report.subjectGroups.find((g) => g.subjects.includes('Русский язык'))!;
    const bd = group.subjectBreakdown;
    expect(bd).toHaveLength(2);
    const ruz = bd.find((b) => b.name === 'Русский язык')!;
    expect(ruz.total).toBe(8);
    expect(ruz.hours5to9).toBe(8);
  });
});

// ─── Subject ordering ─────────────────────────────────────────────────────────

describe('buildOfficialReport — subject ordering', () => {
  it('Физика appears before Химия', () => {
    const assignments: Assignment[] = [
      makeAssignment('t1', '5а', 'Химия', 2),
      makeAssignment('t2', '5а', 'Физика', 2),
    ];
    const report = buildOfficialReport(BASIC_PLAN, assignments, TEACHERS, [], '2025-08-18', '');
    const fizIdx = report.subjectGroups.findIndex((g) => g.displayName === 'Физика');
    const himIdx = report.subjectGroups.findIndex((g) => g.displayName === 'Химия');
    expect(fizIdx).toBeGreaterThanOrEqual(0);
    expect(himIdx).toBeGreaterThan(fizIdx);
  });

  it('unknown subject appended at end', () => {
    const assignments: Assignment[] = [
      makeAssignment('t1', '5а', 'Химия', 2),
      makeAssignment('t2', '5а', 'Неизвестный предмет XYZ', 3),
    ];
    const customPlan: CurriculumPlan = {
      classNames: ['5а'],
      grades: [{
        grade: 5,
        subjects: [
          { name: 'Химия', shortName: '', hoursPerClass: { '5а': 2 }, groupSplit: false, part: 'mandatory' },
          { name: 'Неизвестный предмет XYZ', shortName: '', hoursPerClass: { '5а': 3 }, groupSplit: false, part: 'mandatory' },
        ],
      }],
    };
    const report = buildOfficialReport(customPlan, assignments, TEACHERS, [], '2025-08-18', '');
    const lastIdx = report.subjectGroups.length - 1;
    expect(report.subjectGroups[lastIdx].displayName).toBe('Неизвестный предмет XYZ');
  });

  it('Разговоры о важном appears last among mandatory subjects', () => {
    const assignments: Assignment[] = [
      makeAssignment('t1', '5а', 'Физика', 2),
    ];
    const homeroom: HomeroomAssignment[] = [{ className: '5а', teacherId: 't2' }];
    const report = buildOfficialReport(BASIC_PLAN, assignments, TEACHERS, homeroom, '2025-08-18', '');
    const razgIdx = report.subjectGroups.findIndex((g) => g.displayName === 'Разговоры о важном');
    const fizIdx = report.subjectGroups.findIndex((g) => g.displayName === 'Физика');
    expect(razgIdx).toBeGreaterThan(fizIdx);
  });
});

// ─── Electives ────────────────────────────────────────────────────────────────

describe('buildOfficialReport — electives', () => {
  it('optional subject in grade 10 goes to electives, not main table', () => {
    const assignments: Assignment[] = [
      makeAssignment('t1', '10а', 'Практикум ЕГЭ по русскому языку', 1),
    ];
    const report = buildOfficialReport(BASIC_PLAN, assignments, TEACHERS, [], '2025-08-18', '');
    expect(report.electives).toHaveLength(1);
    expect(report.electives[0].name).toBe('Практикум ЕГЭ по русскому языку');
    // Should NOT be in main subjectGroups
    const inMain = report.subjectGroups.find((g) =>
      g.subjects.includes('Практикум ЕГЭ по русскому языку'),
    );
    expect(inMain).toBeUndefined();
  });

  it('elective totalHours sums across classes', () => {
    const assignments: Assignment[] = [
      makeAssignment('t1', '10а', 'Практикум ЕГЭ по русскому языку', 1),
      makeAssignment('t2', '11а', 'Практикум ЕГЭ по русскому языку', 1),
    ];
    const report = buildOfficialReport(BASIC_PLAN, assignments, TEACHERS, [], '2025-08-18', '');
    expect(report.electives[0].totalHours).toBe(2);
    expect(report.electives[0].rows).toHaveLength(2);
  });

  it('mandatory subject in grade 10 stays in main table', () => {
    const assignments: Assignment[] = [
      makeAssignment('t1', '10а', 'Физика', 3),
    ];
    const report = buildOfficialReport(BASIC_PLAN, assignments, TEACHERS, [], '2025-08-18', '');
    expect(report.electives).toHaveLength(0);
    const inMain = report.subjectGroups.find((g) => g.subjects.includes('Физика'));
    expect(inMain).toBeDefined();
    expect(inMain!.teachers[0].cells10to11).toBe('10-а(3)');
  });
});

// ─── Summary ──────────────────────────────────────────────────────────────────

describe('buildOfficialReport — summary', () => {
  it('mandatory non-split 5-9 counted in mandatory59NoSplit', () => {
    const assignments: Assignment[] = [
      makeAssignment('t1', '5а', 'Физика', 2), // mandatory, non-split grade 5
    ];
    const report = buildOfficialReport(BASIC_PLAN, assignments, TEACHERS, [], '2025-08-18', '');
    expect(report.summary.mandatory59NoSplit).toBe(2);
    expect(report.summary.mandatory59Split).toBe(0);
  });

  it('mandatory split subject counted in mandatory59Split', () => {
    const assignments: Assignment[] = [
      makeAssignment('t1', '7г', 'Физическая культура', 2),
      makeAssignment('t2', '7г', 'Физическая культура', 2),
    ];
    const report = buildOfficialReport(BASIC_PLAN, assignments, TEACHERS, [], '2025-08-18', '');
    expect(report.summary.mandatory59Split).toBe(4);
    expect(report.summary.mandatory59NoSplit).toBe(0);
  });

  it('grandTotal = total59 + total1011', () => {
    const assignments: Assignment[] = [
      makeAssignment('t1', '5а', 'Физика', 2),
      makeAssignment('t1', '10а', 'Физика', 3),
    ];
    const report = buildOfficialReport(BASIC_PLAN, assignments, TEACHERS, [], '2025-08-18', '');
    expect(report.summary.grandTotal).toBe(
      report.summary.total59 + report.summary.total1011,
    );
  });

  it('Разговоры о важном adds to summary totals', () => {
    const homeroom: HomeroomAssignment[] = [
      { className: '5а', teacherId: 't1' },
      { className: '5б', teacherId: 't2' },
    ];
    const report = buildOfficialReport(BASIC_PLAN, [], TEACHERS, homeroom, '2025-08-18', '');
    expect(report.summary.mandatory59NoSplit).toBe(2); // 2 × 1h
    expect(report.summary.grandTotal).toBe(2);
  });
});

// ─── Variant fields ───────────────────────────────────────────────────────────

describe('buildOfficialReport — variant and schoolYear', () => {
  it('stores variantDate and variantLabel', () => {
    const report = buildOfficialReport(BASIC_PLAN, [], TEACHERS, [], '2025-08-18', 'первый');
    expect(report.variantDate).toBe('2025-08-18');
    expect(report.variantLabel).toBe('первый');
  });

  it('auto-computes schoolYear', () => {
    const report = buildOfficialReport(BASIC_PLAN, [], TEACHERS, [], '2025-08-18', '');
    expect(report.schoolYear).toBe('2025-2026');
  });
});

// ─── Dept-based ordering ──────────────────────────────────────────────────────

describe('buildOfficialReport — dept ordering', () => {
  const plan: CurriculumPlan = {
    classNames: ['5а'],
    grades: [{
      grade: 5,
      subjects: [
        { name: 'Физика', shortName: '', hoursPerClass: { '5а': 2 }, groupSplit: false, part: 'mandatory' },
        { name: 'Химия', shortName: '', hoursPerClass: { '5а': 2 }, groupSplit: false, part: 'mandatory' },
        { name: 'Русский язык', shortName: '', hoursPerClass: { '5а': 4 }, groupSplit: false, part: 'mandatory' },
      ],
    }],
  };

  const assignments: Assignment[] = [
    makeAssignment('t1', '5а', 'Физика', 2),
    makeAssignment('t2', '5а', 'Химия', 2),
    makeAssignment('t3', '5а', 'Русский язык', 4),
  ];

  const deptGroups: DeptGroup[] = [
    {
      id: 'g1', name: 'Физики',
      tables: [{ id: 't1', name: 'Физика', teacherIds: ['t1'], subjectFilter: ['Физика'] }],
    },
    {
      id: 'g2', name: 'Химики',
      tables: [{ id: 't2', name: 'Химия', teacherIds: ['t2'], subjectFilter: ['Химия'] }],
    },
    {
      id: 'g3', name: 'Филологи',
      tables: [{ id: 't3', name: 'Русский', teacherIds: ['t3'], subjectFilter: ['Русский язык'] }],
    },
  ];

  it('orders subjects by dept group index, not ФОП order', () => {
    const report = buildOfficialReport(plan, assignments, TEACHERS, [], '2025-08-18', '', deptGroups);
    const names = report.subjectGroups.map((g) => g.displayName);
    expect(names).toEqual(['Физика', 'Химия', 'Русский язык']);
  });

  it('sets deptLabel on the first subject group of each dept section', () => {
    const report = buildOfficialReport(plan, assignments, TEACHERS, [], '2025-08-18', '', deptGroups);
    const labels = report.subjectGroups.map((g) => g.deptLabel ?? null);
    expect(labels).toEqual(['Физики', 'Химики', 'Филологи']);
  });

  it('does not set deptLabel when no deptGroups provided', () => {
    const report = buildOfficialReport(plan, assignments, TEACHERS, [], '2025-08-18', '');
    expect(report.subjectGroups.every((g) => !g.deptLabel)).toBe(true);
  });

  it('unmatched subjects go last, no deptLabel', () => {
    const partialDepts: DeptGroup[] = [
      {
        id: 'g1', name: 'Физики',
        tables: [{ id: 't1', name: 'Физика', teacherIds: ['t1'], subjectFilter: ['Физика'] }],
      },
    ];
    const report = buildOfficialReport(plan, assignments, TEACHERS, [], '2025-08-18', '', partialDepts);
    const names = report.subjectGroups.map((g) => g.displayName);
    expect(names[0]).toBe('Физика');
    const unmatched = report.subjectGroups.filter((g) => !g.deptLabel);
    expect(unmatched.map((g) => g.displayName)).toContain('Химия');
    expect(unmatched.map((g) => g.displayName)).toContain('Русский язык');
  });

  it('two tables in same dept: only first subject gets deptLabel', () => {
    const twoTableDept: DeptGroup[] = [
      {
        id: 'g1', name: 'Естественные науки',
        tables: [
          { id: 't1', name: 'Физика', teacherIds: ['t1'], subjectFilter: ['Физика'] },
          { id: 't2', name: 'Химия', teacherIds: ['t2'], subjectFilter: ['Химия'] },
        ],
      },
    ];
    const report = buildOfficialReport(plan, assignments, TEACHERS, [], '2025-08-18', '', twoTableDept);
    const labeled = report.subjectGroups.filter((g) => g.deptLabel);
    expect(labeled).toHaveLength(1);
    expect(labeled[0].deptLabel).toBe('Естественные науки');
    const names = report.subjectGroups.slice(0, 2).map((g) => g.displayName);
    expect(names).toContain('Физика');
    expect(names).toContain('Химия');
  });
});
