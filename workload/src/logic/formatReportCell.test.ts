import { describe, it, expect } from 'vitest';
import { gradeFromClassName, formatSimpleClasses, formatCompoundClasses } from './formatReportCell';

describe('gradeFromClassName', () => {
  it('extracts single-digit grade', () => {
    expect(gradeFromClassName('5а')).toBe(5);
    expect(gradeFromClassName('9г')).toBe(9);
  });

  it('extracts two-digit grade', () => {
    expect(gradeFromClassName('10б')).toBe(10);
    expect(gradeFromClassName('11в')).toBe(11);
  });

  it('handles suffix with multiple letters', () => {
    expect(gradeFromClassName('5мк')).toBe(5);
    expect(gradeFromClassName('7мк')).toBe(7);
  });

  it('returns 0 for non-numeric class names', () => {
    expect(gradeFromClassName('мк')).toBe(0);
  });
});

describe('formatSimpleClasses', () => {
  it('returns empty string when no entries match range', () => {
    const entries = [{ className: '10а', hours: 3 }];
    expect(formatSimpleClasses(entries, '5-9')).toBe('');
  });

  it('single class: individual notation', () => {
    const entries = [{ className: '7б', hours: 3 }];
    expect(formatSimpleClasses(entries, '5-9')).toBe('7-б(3)');
  });

  it('multiple classes same grade same hours: compact notation', () => {
    const entries = [
      { className: '5а', hours: 2 },
      { className: '5б', hours: 2 },
      { className: '5в', hours: 2 },
      { className: '5г', hours: 2 },
    ];
    expect(formatSimpleClasses(entries, '5-9')).toBe('5-а,б,в,г(8)');
  });

  it('multiple classes same grade different hours: individual notation', () => {
    const entries = [
      { className: '6а', hours: 3 },
      { className: '6б', hours: 2 },
    ];
    expect(formatSimpleClasses(entries, '5-9')).toBe('6-а(3), 6-б(2)');
  });

  it('multiple grades: sorted ascending, compact per grade', () => {
    const entries = [
      { className: '7а', hours: 3 },
      { className: '5а', hours: 2 },
      { className: '5б', hours: 2 },
    ];
    expect(formatSimpleClasses(entries, '5-9')).toBe('5-а,б(4), 7-а(3)');
  });

  it('grade range filter: excludes 10-11 from 5-9 range', () => {
    const entries = [
      { className: '9а', hours: 3 },
      { className: '10а', hours: 3 },
    ];
    expect(formatSimpleClasses(entries, '5-9')).toBe('9-а(3)');
  });

  it('grade range filter: only 10-11 from 10-11 range', () => {
    const entries = [
      { className: '9а', hours: 3 },
      { className: '10а', hours: 2 },
      { className: '11а', hours: 2 },
    ];
    // Grades 10 and 11 are different grades — no compaction across grades
    expect(formatSimpleClasses(entries, '10-11')).toBe('10-а(2), 11-а(2)');
  });

  it('handles мк suffix', () => {
    const entries = [{ className: '5мк', hours: 4 }];
    expect(formatSimpleClasses(entries, '5-9')).toBe('5-мк(4)');
  });

  // З23-2: class names already in "5-а" form must not render as "5--а"
  it('handles class names with existing dash: single class', () => {
    const entries = [{ className: '5-а', hours: 3 }];
    expect(formatSimpleClasses(entries, '5-9')).toBe('5-а(3)');
  });

  it('handles class names with existing dash: compact notation', () => {
    const entries = [
      { className: '5-а', hours: 2 },
      { className: '5-б', hours: 2 },
      { className: '5-в', hours: 2 },
    ];
    expect(formatSimpleClasses(entries, '5-9')).toBe('5-а,б,в(6)');
  });

  it('handles class names with existing dash: 10-11 range', () => {
    const entries = [
      { className: '10-а', hours: 3 },
      { className: '11-б', hours: 3 },
    ];
    expect(formatSimpleClasses(entries, '10-11')).toBe('10-а(3), 11-б(3)');
  });

  it('handles class names with existing dash: мк suffix', () => {
    const entries = [{ className: '5-мк', hours: 4 }];
    expect(formatSimpleClasses(entries, '5-9')).toBe('5-мк(4)');
  });

  it('Физкультура pattern: 7 classes across 3 grades', () => {
    const entries = [
      { className: '5а', hours: 2 }, { className: '5б', hours: 2 },
      { className: '7а', hours: 2 }, { className: '7б', hours: 2 }, { className: '7г', hours: 2 },
      { className: '8а', hours: 2 }, { className: '8б', hours: 2 },
    ];
    expect(formatSimpleClasses(entries, '5-9')).toBe('5-а,б(4), 7-а,б,г(6), 8-а,б(4)');
  });
});

describe('formatCompoundClasses', () => {
  it('returns empty string when no entries match range', () => {
    const entries = [{ className: '10а', hoursPerSubject: [3, 2] }];
    expect(formatCompoundClasses(entries, '5-9')).toBe('');
  });

  it('single class with two sub-subjects', () => {
    const entries = [{ className: '7г', hoursPerSubject: [3, 2] }];
    expect(formatCompoundClasses(entries, '5-9')).toBe('7-г(3/2)');
  });

  it('single class with three sub-subjects', () => {
    const entries = [{ className: '9в', hoursPerSubject: [3, 2, 1] }];
    expect(formatCompoundClasses(entries, '5-9')).toBe('9-в(3/2/1)');
  });

  it('multiple classes: no compaction, always individual', () => {
    const entries = [
      { className: '7а', hoursPerSubject: [3, 2] },
      { className: '7б', hoursPerSubject: [3, 2] },
    ];
    // NO compact for compound — each class stays individual
    expect(formatCompoundClasses(entries, '5-9')).toBe('7-а(3/2), 7-б(3/2)');
  });

  it('mixed grades: sorted ascending', () => {
    const entries = [
      { className: '9а', hoursPerSubject: [3, 3] },
      { className: '5мк', hoursPerSubject: [4, 2] },
    ];
    expect(formatCompoundClasses(entries, '5-9')).toBe('5-мк(4/2), 9-а(3/3)');
  });

  it('10-11 range filter', () => {
    const entries = [
      { className: '9а', hoursPerSubject: [3, 2] },
      { className: '10в', hoursPerSubject: [2, 3] },
      { className: '11в', hoursPerSubject: [2, 3] },
    ];
    expect(formatCompoundClasses(entries, '10-11')).toBe('10-в(2/3), 11-в(2/3)');
  });

  // З23-2: class names already in "7-г" form must not render as "7--г"
  it('handles class names with existing dash', () => {
    const entries = [
      { className: '7-г', hoursPerSubject: [3, 2, 1] },
      { className: '5-мк', hoursPerSubject: [4, 2] },
    ];
    expect(formatCompoundClasses(entries, '5-9')).toBe('5-мк(4/2), 7-г(3/2/1)');
  });
});
