import { describe, it, expect } from 'vitest';
import { groupClassesByGrade, pickFirstEditableClass } from './ClassSelector';

describe('groupClassesByGrade', () => {
  const allClasses = ['1а', '1б', '2а', '5а', '9б', '10а', '10б', '11в'];
  const excluded = ['1а', '1б', '2а'];

  it('places fully excluded grade groups at the bottom', () => {
    const result = groupClassesByGrade(allClasses, excluded);
    const grades = result.map(([grade]) => grade);

    // grades 5, 9, 10, 11 should come before 1 and 2
    expect(grades.indexOf('5')).toBeLessThan(grades.indexOf('1'));
    expect(grades.indexOf('10')).toBeLessThan(grades.indexOf('1'));
    expect(grades.indexOf('5')).toBeLessThan(grades.indexOf('2'));
  });

  it('sorts non-excluded grades numerically ascending', () => {
    const result = groupClassesByGrade(allClasses, excluded);
    const nonExcludedGrades = result
      .filter(([, names]) => names.some(n => !excluded.includes(n)))
      .map(([grade]) => parseInt(grade, 10));
    expect(nonExcludedGrades).toEqual([...nonExcludedGrades].sort((a, b) => a - b));
  });

  it('sorts excluded grades numerically ascending among themselves', () => {
    const result = groupClassesByGrade(allClasses, excluded);
    const excludedGrades = result
      .filter(([, names]) => names.every(n => excluded.includes(n)))
      .map(([grade]) => parseInt(grade, 10));
    expect(excludedGrades).toEqual([1, 2]);
  });

  it('returns all grades when nothing is excluded', () => {
    const result = groupClassesByGrade(allClasses, []);
    const grades = result.map(([grade]) => grade);
    expect(grades).toEqual(['1', '2', '5', '9', '10', '11']);
  });

  it('keeps a grade in normal position if only some of its classes are excluded', () => {
    const result = groupClassesByGrade(['1а', '1б', '5а'], ['1а']);
    const grades = result.map(([grade]) => grade);
    // Grade 1 has one non-excluded class (1б), so it stays at the top
    expect(grades.indexOf('1')).toBeLessThan(grades.indexOf('5'));
  });

  it('regression Z17-5: first result class skips fully-excluded grade even when it is first in DB order', () => {
    // DB order has '1а' first, but grade 1 is fully excluded → first visible class should be '5а'
    const dbOrder = ['1а', '1б', '5а', '10а'];
    const excluded = ['1а', '1б'];
    const result = groupClassesByGrade(dbOrder, excluded);
    const firstClass = result[0]?.[1][0];
    expect(firstClass).toBe('5а');
    expect(firstClass).not.toBe('1а');
  });

  it('sorts classes inside one grade in natural school order', () => {
    const result = groupClassesByGrade(['8-Мк', '8-г', '8-в', '8-а', '8-д'], []);
    expect(result[0][1]).toEqual(['8-а', '8-в', '8-г', '8-д', '8-Мк']);
  });
});

describe('pickFirstEditableClass', () => {
  it('skips partner classes when opening the editor', () => {
    const classes = [
      { id: 'c1', name: '2-а', isPartner: true },
      { id: 'c2', name: '3-а', isPartner: true },
      { id: 'c3', name: '5-а' },
    ];

    expect(pickFirstEditableClass(classes, [])).toBe('5-а');
  });

  it('falls back to partner classes if there are no own classes', () => {
    const classes = [
      { id: 'c1', name: '2-а', isPartner: true },
      { id: 'c2', name: '3-а', isPartner: true },
    ];

    expect(pickFirstEditableClass(classes, [])).toBe('2-а');
  });
});
