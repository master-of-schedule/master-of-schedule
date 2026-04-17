import { describe, it, expect } from 'vitest';
import { buildVacancySummary, isVacancyTeacher } from './vacancySummary';
import type { RNTeacher, Assignment, DeptGroup } from '../types';

function makeTeacher(id: string, name: string): RNTeacher {
  return { id, name, initials: name.slice(0, 3), subjects: [] };
}

function makeAssignment(teacherId: string, className: string, subject: string, hours = 2): Assignment {
  return { teacherId, className, subject, hoursPerWeek: hours };
}

const CHEM_BIO_GEO_GROUP: DeptGroup = {
  id: 'g1',
  name: 'ХимБиоГео',
  tables: [
    { id: 't1', name: 'Химия',    teacherIds: ['real1'],     subjectFilter: ['Химия'] },
    { id: 't2', name: 'Биология', teacherIds: ['real2'],     subjectFilter: ['Биология'] },
    { id: 't3', name: 'География',teacherIds: ['vacGeo'],    subjectFilter: ['География'] },
  ],
};

const MATH_GROUP: DeptGroup = {
  id: 'g2',
  name: 'Математики',
  tables: [
    { id: 't4', name: 'Математика', teacherIds: ['vacMath1', 'vacMath2', 'real3'], subjectFilter: ['Математика', 'Алгебра', 'Геометрия'] },
  ],
};

describe('isVacancyTeacher', () => {
  it('returns true for names containing вакансия (case-insensitive)', () => {
    expect(isVacancyTeacher('Вакансия')).toBe(true);
    expect(isVacancyTeacher('вакансия')).toBe(true);
    expect(isVacancyTeacher('ВАКАНСИЯ')).toBe(true);
    expect(isVacancyTeacher('Вакансия Г.')).toBe(true);
  });

  it('returns false for normal teacher names', () => {
    expect(isVacancyTeacher('Иванов Иван Иванович')).toBe(false);
    expect(isVacancyTeacher('')).toBe(false);
  });
});

describe('buildVacancySummary', () => {
  it('returns empty when no vacancy teachers exist', () => {
    const teachers = [makeTeacher('real1', 'Иванов И.И.')];
    const assignments = [makeAssignment('real1', '8а', 'Химия')];
    expect(buildVacancySummary(teachers, assignments, [CHEM_BIO_GEO_GROUP])).toHaveLength(0);
  });

  it('returns empty when vacancy teacher has no assignments', () => {
    const teachers = [makeTeacher('vacGeo', 'Вакансия Г.')];
    expect(buildVacancySummary(teachers, [], [CHEM_BIO_GEO_GROUP])).toHaveLength(0);
  });

  it('З21-5: groups by table name, not by dept group', () => {
    const teachers = [
      makeTeacher('vacGeo', 'Вакансия Г.'),
      makeTeacher('real1',  'Иванов И.И.'),
    ];
    const assignments = [
      makeAssignment('vacGeo', '8а', 'География', 2),
      makeAssignment('vacGeo', '9б', 'География', 2),
      makeAssignment('real1',  '8а', 'Химия', 3),
    ];
    const result = buildVacancySummary(teachers, assignments, [CHEM_BIO_GEO_GROUP]);
    // Should show "География", NOT "ХимБиоГео"
    expect(result).toHaveLength(1);
    expect(result[0].tableName).toBe('География');
    expect(result[0].teachers[0].teacherName).toBe('Вакансия Г.');
    expect(result[0].teachers[0].totalHours).toBe(4);
  });

  it('omits tables where no vacancy teacher is a member', () => {
    const teachers = [makeTeacher('vacGeo', 'Вакансия Г.')];
    const assignments = [makeAssignment('vacGeo', '8а', 'География', 10)];
    const result = buildVacancySummary(teachers, assignments, [CHEM_BIO_GEO_GROUP]);
    // Only "География" table — Химия and Биология have no vacancy teachers
    expect(result).toHaveLength(1);
    expect(result[0].tableName).toBe('География');
  });

  it('multiple vacancy teachers in same table', () => {
    const teachers = [
      makeTeacher('vacMath1', 'Вакансия М.'),
      makeTeacher('vacMath2', 'Вакансия Н.'),
      makeTeacher('real3', 'Петров П.П.'),
    ];
    const assignments = [
      makeAssignment('vacMath1', '8а', 'Алгебра', 4),
      makeAssignment('vacMath2', '9б', 'Геометрия', 3),
      makeAssignment('real3', '7в', 'Математика', 5),
    ];
    const result = buildVacancySummary(teachers, assignments, [MATH_GROUP]);
    expect(result).toHaveLength(1);
    expect(result[0].tableName).toBe('Математика');
    expect(result[0].teachers).toHaveLength(2);
    // sorted by name
    expect(result[0].teachers[0].teacherName).toBe('Вакансия М.');
    expect(result[0].teachers[1].teacherName).toBe('Вакансия Н.');
  });

  it('vacancy teachers across multiple tables in different groups', () => {
    const teachers = [
      makeTeacher('vacGeo',   'Вакансия Г.'),
      makeTeacher('vacMath1', 'Вакансия М.'),
    ];
    const assignments = [
      makeAssignment('vacGeo',   '8а', 'География', 2),
      makeAssignment('vacMath1', '8а', 'Алгебра',   4),
    ];
    const result = buildVacancySummary(teachers, assignments, [CHEM_BIO_GEO_GROUP, MATH_GROUP]);
    expect(result).toHaveLength(2);
    expect(result[0].tableName).toBe('География');
    expect(result[1].tableName).toBe('Математика');
  });

  it('bothGroups=true doubles the hours', () => {
    const teachers = [makeTeacher('v1', 'Вакансия')];
    const assignments: Assignment[] = [
      { teacherId: 'v1', className: '5а', subject: 'Физкультура', hoursPerWeek: 3, bothGroups: true },
    ];
    const group: DeptGroup = {
      id: 'gp', name: 'Физкультура',
      tables: [{ id: 'tp', name: 'Физкультура', teacherIds: ['v1'], subjectFilter: [] }],
    };
    const result = buildVacancySummary(teachers, assignments, [group]);
    expect(result[0].teachers[0].totalHours).toBe(6);
  });
});
