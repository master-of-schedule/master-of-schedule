import { describe, it, expect } from 'vitest';
import { buildVacancySummary, isVacancyTeacher } from './vacancySummary';
import type { RNTeacher, Assignment, DeptGroup } from '../types';

function makeTeacher(id: string, name: string): RNTeacher {
  return { id, name, initials: name.slice(0, 3), subjects: [] };
}

function makeAssignment(teacherId: string, className: string, subject: string, hours = 2): Assignment {
  return { teacherId, className, subject, hoursPerWeek: hours };
}

const MATH_GROUP: DeptGroup = {
  id: 'g1',
  name: 'Математики',
  tables: [
    {
      id: 't1',
      name: 'Математика',
      teacherIds: ['vacancy1', 'real1'],
      subjectFilter: ['Математика'],
    },
  ],
};

const LANG_GROUP: DeptGroup = {
  id: 'g2',
  name: 'Языки',
  tables: [
    {
      id: 't2',
      name: 'Русский',
      teacherIds: ['real2'],
      subjectFilter: ['Русский язык'],
    },
  ],
};

describe('isVacancyTeacher', () => {
  it('returns true for names containing вакансия (case-insensitive)', () => {
    expect(isVacancyTeacher('Вакансия')).toBe(true);
    expect(isVacancyTeacher('вакансия')).toBe(true);
    expect(isVacancyTeacher('ВАКАНСИЯ')).toBe(true);
    expect(isVacancyTeacher('Вакансия (математики)')).toBe(true);
  });

  it('returns false for normal teacher names', () => {
    expect(isVacancyTeacher('Иванов Иван Иванович')).toBe(false);
    expect(isVacancyTeacher('')).toBe(false);
  });
});

describe('buildVacancySummary', () => {
  it('returns empty when no vacancy teachers exist', () => {
    const teachers = [makeTeacher('real1', 'Иванов И.И.')];
    const assignments = [makeAssignment('real1', '5а', 'Математика')];
    expect(buildVacancySummary(teachers, assignments, [MATH_GROUP])).toHaveLength(0);
  });

  it('returns empty when vacancy teacher has no assignments', () => {
    const teachers = [makeTeacher('vacancy1', 'Вакансия')];
    expect(buildVacancySummary(teachers, [], [MATH_GROUP])).toHaveLength(0);
  });

  it('З21-5: groups by DeptGroup with teacher name and total hours', () => {
    const teachers = [
      makeTeacher('vacancy1', 'Вакансия М.'),
      makeTeacher('real1', 'Иванов И.И.'),
    ];
    const assignments = [
      makeAssignment('vacancy1', '5а', 'Математика', 5),
      makeAssignment('vacancy1', '5б', 'Математика', 5),
      makeAssignment('vacancy1', '6а', 'Алгебра', 4),
      makeAssignment('real1', '6а', 'Математика', 5),
    ];
    const result = buildVacancySummary(teachers, assignments, [MATH_GROUP]);
    expect(result).toHaveLength(1);
    expect(result[0].groupName).toBe('Математики');
    expect(result[0].teachers).toHaveLength(1);
    expect(result[0].teachers[0].teacherName).toBe('Вакансия М.');
    expect(result[0].teachers[0].totalHours).toBe(14); // 5+5+4
  });

  it('omits groups where no vacancy teacher is a member', () => {
    const teachers = [makeTeacher('vacancy1', 'Вакансия')];
    const assignments = [makeAssignment('vacancy1', '5а', 'Математика', 5)];
    // vacancy1 is only in MATH_GROUP, not LANG_GROUP
    const result = buildVacancySummary(teachers, assignments, [MATH_GROUP, LANG_GROUP]);
    expect(result).toHaveLength(1);
    expect(result[0].groupName).toBe('Математики');
  });

  it('bothGroups=true doubles the hours', () => {
    const teachers = [makeTeacher('v1', 'Вакансия')];
    const assignments: Assignment[] = [
      { teacherId: 'v1', className: '5а', subject: 'Физкультура', hoursPerWeek: 3, bothGroups: true },
    ];
    const group: DeptGroup = {
      id: 'gp',
      name: 'Физкультура',
      tables: [{ id: 'tp', name: 'Физкультура', teacherIds: ['v1'], subjectFilter: [] }],
    };
    const result = buildVacancySummary(teachers, assignments, [group]);
    expect(result[0].teachers[0].totalHours).toBe(6); // 3 × 2
  });

  it('multiple vacancy teachers in same group', () => {
    const multiGroup: DeptGroup = {
      id: 'gm',
      name: 'Математики',
      tables: [{
        id: 'tm',
        name: 'Математика',
        teacherIds: ['v1', 'v2'],
        subjectFilter: [],
      }],
    };
    const teachers = [
      makeTeacher('v1', 'Вакансия М.'),
      makeTeacher('v2', 'Вакансия Н.'),
    ];
    const assignments = [
      makeAssignment('v1', '8а', 'Алгебра', 4),
      makeAssignment('v2', '9б', 'Геометрия', 3),
    ];
    const result = buildVacancySummary(teachers, assignments, [multiGroup]);
    expect(result[0].teachers).toHaveLength(2);
    expect(result[0].teachers[0].teacherName).toBe('Вакансия М.');
    expect(result[0].teachers[0].totalHours).toBe(4);
    expect(result[0].teachers[1].teacherName).toBe('Вакансия Н.');
    expect(result[0].teachers[1].totalHours).toBe(3);
  });
});
