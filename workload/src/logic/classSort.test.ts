import { describe, it, expect } from 'vitest';
import { parseClassName, compareClassNames } from './classSort';

describe('parseClassName', () => {
  it('parses "5-а"', () => {
    expect(parseClassName('5-а')).toEqual({ grade: 5, suffix: 'а' });
  });

  it('parses "10-б"', () => {
    expect(parseClassName('10-б')).toEqual({ grade: 10, suffix: 'б' });
  });

  it('parses "5Мк" (no dash)', () => {
    expect(parseClassName('5Мк')).toEqual({ grade: 5, suffix: 'Мк' });
  });

  it('parses "6-Мк" (dash + multi-char suffix)', () => {
    expect(parseClassName('6-Мк')).toEqual({ grade: 6, suffix: 'Мк' });
  });

  it('returns grade 0 for non-numeric', () => {
    expect(parseClassName('abc')).toEqual({ grade: 0, suffix: 'abc' });
  });
});

describe('compareClassNames', () => {
  it('sorts 5 before 10', () => {
    expect(compareClassNames('5-а', '10-а')).toBeLessThan(0);
  });

  it('sorts 10 before 11', () => {
    expect(compareClassNames('10-а', '11-а')).toBeLessThan(0);
  });

  it('sorts by suffix within same grade', () => {
    expect(compareClassNames('5-б', '5-а')).toBeGreaterThan(0);
  });

  it('sorts a full realistic list correctly', () => {
    const classes = ['10-а', '5-б', '11-в', '5-а', '7-в', '10-б', '6-Мк'];
    const sorted = [...classes].sort(compareClassNames);
    expect(sorted).toEqual(['5-а', '5-б', '6-Мк', '7-в', '10-а', '10-б', '11-в']);
  });

  it('equal names return 0', () => {
    expect(compareClassNames('5-а', '5-а')).toBe(0);
  });
});
