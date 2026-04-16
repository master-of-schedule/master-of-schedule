import { describe, it, expect } from 'vitest';
import { buildVacancySummary, isVacancyTeacher } from './vacancySummary';
import type { RNTeacher, Assignment, DeptGroup } from '../types';

function makeTeacher(id: string, name: string): RNTeacher {
  return { id, name, initials: name.slice(0, 3), subjects: [] };
}

function makeAssignment(teacherId: string, className: string, subject: string): Assignment {
  return { teacherId, className, subject, hoursPerWeek: 2 };
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

  it('З21-5: groups vacancy assignments by DeptGroup and DeptTable', () => {
    const teachers = [
      makeTeacher('vacancy1', 'Вакансия (математики)'),
      makeTeacher('real1', 'Иванов И.И.'),
    ];
    const assignments = [
      makeAssignment('vacancy1', '5а', 'Математика'),
      makeAssignment('vacancy1', '5б', 'Математика'),
      makeAssignment('real1', '6а', 'Математика'),
    ];
    const result = buildVacancySummary(teachers, assignments, [MATH_GROUP]);
    expect(result).toHaveLength(1);
    expect(result[0].groupName).toBe('Математики');
    expect(result[0].tables).toHaveLength(1);
    expect(result[0].tables[0].tableName).toBe('Математика');
    expect(result[0].tables[0].items).toHaveLength(1);
    expect(result[0].tables[0].items[0].subject).toBe('Математика');
    expect(result[0].tables[0].items[0].classNames).toEqual(['5а', '5б']);
    expect(result[0].tables[0].items[0].teacherName).toBe('Вакансия (математики)');
  });

  it('omits groups where no vacancy teacher is in the tables', () => {
    const teachers = [makeTeacher('vacancy1', 'Вакансия')];
    const assignments = [makeAssignment('vacancy1', '5а', 'Математика')];
    // vacancy1 is only in MATH_GROUP.t1, not in LANG_GROUP.t2
    const result = buildVacancySummary(teachers, assignments, [MATH_GROUP, LANG_GROUP]);
    expect(result).toHaveLength(1);
    expect(result[0].groupName).toBe('Математики');
  });

  it('collects multiple subjects in one table', () => {
    const multiTable: DeptGroup = {
      id: 'gm',
      name: 'Разное',
      tables: [{
        id: 'tm',
        name: 'Общие предметы',
        teacherIds: ['vacancy1'],
        subjectFilter: [],
      }],
    };
    const teachers = [makeTeacher('vacancy1', 'Вакансия')];
    const assignments = [
      makeAssignment('vacancy1', '5а', 'Биология'),
      makeAssignment('vacancy1', '6а', 'Химия'),
    ];
    const result = buildVacancySummary(teachers, assignments, [multiTable]);
    expect(result[0].tables[0].items).toHaveLength(2);
    // items sorted by subject name
    expect(result[0].tables[0].items[0].subject).toBe('Биология');
    expect(result[0].tables[0].items[1].subject).toBe('Химия');
  });

  it('classNames within each item are sorted', () => {
    const teachers = [makeTeacher('v1', 'Вакансия')];
    const assignments = [
      makeAssignment('v1', '7в', 'История'),
      makeAssignment('v1', '5а', 'История'),
      makeAssignment('v1', '6б', 'История'),
    ];
    const group: DeptGroup = {
      id: 'gh',
      name: 'Историки',
      tables: [{ id: 'th', name: 'История', teacherIds: ['v1'], subjectFilter: ['История'] }],
    };
    const result = buildVacancySummary(teachers, assignments, [group]);
    expect(result[0].tables[0].items[0].classNames).toEqual(['5а', '6б', '7в']);
  });
});
