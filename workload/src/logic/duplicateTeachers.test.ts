import { describe, it, expect } from 'vitest';
import { levenshtein, normalizeTeacherName, findDuplicateTeachers } from './duplicateTeachers';
import type { RNTeacher } from '../types';

function makeTeacher(id: string, name: string): RNTeacher {
  return { id, name, initials: '', subjects: [] };
}

describe('levenshtein', () => {
  it('equal strings → 0', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('empty strings', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('', 'xyz')).toBe(3);
  });

  it('single substitution', () => {
    expect(levenshtein('kitten', 'sitten')).toBe(1);
  });

  it('single insertion/deletion', () => {
    expect(levenshtein('abc', 'abcd')).toBe(1);
    expect(levenshtein('abcd', 'abc')).toBe(1);
  });

  it('classic kitten → sitting', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('early-exit respects maxDistance', () => {
    // actual distance is 3, but asking for max 2 should return something > 2
    const d = levenshtein('kitten', 'sitting', 2);
    expect(d).toBeGreaterThan(2);
  });

  it('handles Cyrillic', () => {
    expect(levenshtein('Анатольевна', 'Анаольевна')).toBe(1);
    expect(levenshtein('мартынова', 'мартынова')).toBe(0);
  });
});

describe('normalizeTeacherName', () => {
  it('lowercases and trims', () => {
    expect(normalizeTeacherName('  Мартынова Елена  ')).toBe('мартынова елена');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeTeacherName('Мартынова   Елена')).toBe('мартынова елена');
  });

  it('replaces ё with е', () => {
    expect(normalizeTeacherName('Фёдорова')).toBe('федорова');
  });

  it('unifies dash variants', () => {
    expect(normalizeTeacherName('Иванов–Петров')).toBe('иванов-петров');
    expect(normalizeTeacherName('Иванов—Петров')).toBe('иванов-петров');
  });
});

describe('findDuplicateTeachers', () => {
  it('flags single-letter typo in patronymic (Мартынова case)', () => {
    const teachers: RNTeacher[] = [
      makeTeacher('t1', 'Мартынова Елена Анатольевна'),
      makeTeacher('t2', 'Мартынова Елена Анаольевна'),
    ];
    const pairs = findDuplicateTeachers(teachers);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a.id).toBe('t1');
    expect(pairs[0].b.id).toBe('t2');
    expect(pairs[0].distance).toBe(1);
  });

  it('flags exact duplicate names with different ids (distance 0)', () => {
    const teachers: RNTeacher[] = [
      makeTeacher('t1', 'Иванова Ольга Петровна'),
      makeTeacher('t2', 'Иванова Ольга Петровна'),
    ];
    const pairs = findDuplicateTeachers(teachers);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].distance).toBe(0);
  });

  it('flags case-only differences', () => {
    const teachers: RNTeacher[] = [
      makeTeacher('t1', 'иванова ольга петровна'),
      makeTeacher('t2', 'ИВАНОВА Ольга Петровна'),
    ];
    const pairs = findDuplicateTeachers(teachers);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].distance).toBe(0);
  });

  it('flags whitespace-only differences', () => {
    const teachers: RNTeacher[] = [
      makeTeacher('t1', 'Иванова Ольга Петровна'),
      makeTeacher('t2', '  Иванова   Ольга Петровна  '),
    ];
    const pairs = findDuplicateTeachers(teachers);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].distance).toBe(0);
  });

  it('flags ё/е variants', () => {
    const teachers: RNTeacher[] = [
      makeTeacher('t1', 'Фёдорова Анна Сергеевна'),
      makeTeacher('t2', 'Федорова Анна Сергеевна'),
    ];
    const pairs = findDuplicateTeachers(teachers);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].distance).toBe(0);
  });

  it('does NOT flag unrelated names', () => {
    const teachers: RNTeacher[] = [
      makeTeacher('t1', 'Иванова Ольга Петровна'),
      makeTeacher('t2', 'Петров Семён Николаевич'),
      makeTeacher('t3', 'Сидорова Мария Константиновна'),
    ];
    expect(findDuplicateTeachers(teachers)).toHaveLength(0);
  });

  it('does NOT flag names that differ by > 2 edits', () => {
    const teachers: RNTeacher[] = [
      makeTeacher('t1', 'Иванова Ольга'),
      makeTeacher('t2', 'Иванова Анна'), // Ольга → Анна = 4 edits
    ];
    expect(findDuplicateTeachers(teachers)).toHaveLength(0);
  });

  it('returns multiple pairs when several near-duplicates exist', () => {
    const teachers: RNTeacher[] = [
      makeTeacher('t1', 'Иванова Ольга Петровна'),
      makeTeacher('t2', 'Иванова Ольга Петровна'), // dup of t1
      makeTeacher('t3', 'Петров Семён Николаевич'),
      makeTeacher('t4', 'Петров Семен Николаевич'), // dup of t3 (ё→е)
    ];
    const pairs = findDuplicateTeachers(teachers);
    expect(pairs).toHaveLength(2);
  });

  it('returns empty array for empty input and single-teacher input', () => {
    expect(findDuplicateTeachers([])).toEqual([]);
    expect(findDuplicateTeachers([makeTeacher('t1', 'Одинокий А.А.')])).toEqual([]);
  });

  it('within a pair, a has the smaller id', () => {
    const teachers: RNTeacher[] = [
      makeTeacher('tzz', 'Иванова Ольга Петровна'),
      makeTeacher('taa', 'Иванова Ольга Петровна'),
    ];
    const pairs = findDuplicateTeachers(teachers);
    expect(pairs[0].a.id).toBe('taa');
    expect(pairs[0].b.id).toBe('tzz');
  });

  it('deterministic across input-order permutations', () => {
    const [a, b, c] = [
      makeTeacher('t1', 'Иванова Ольга Петровна'),
      makeTeacher('t2', 'Иванова Ольга Петровна'),
      makeTeacher('t3', 'Петров Семён Николаевич'),
    ];
    const p1 = findDuplicateTeachers([a, b, c]);
    const p2 = findDuplicateTeachers([c, b, a]);
    const p3 = findDuplicateTeachers([b, c, a]);
    expect(p1).toEqual(p2);
    expect(p2).toEqual(p3);
  });
});
