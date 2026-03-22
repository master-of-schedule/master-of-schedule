import { describe, it, expect } from 'vitest';
import { isTeacherBlocked, computeDeptPlanned, buildWorkloadEntry, visibleClassesForTable } from './assignHelpers';

describe('isTeacherBlocked (З6-5)', () => {
  it('blocks non-split subject when someone else is assigned', () => {
    expect(isTeacherBlocked(1, false, 1, false)).toBe(true);
  });

  it('does not block non-split subject when no one is assigned', () => {
    expect(isTeacherBlocked(0, false, 1, false)).toBe(false);
  });

  it('does not block a teacher who is already assigned to non-split', () => {
    expect(isTeacherBlocked(1, false, 1, true)).toBe(false);
  });

  it('does not block split subject with 2 groups when only 1 teacher assigned', () => {
    expect(isTeacherBlocked(1, true, 2, false)).toBe(false);
  });

  it('blocks split subject with 2 groups when both slots taken by others', () => {
    expect(isTeacherBlocked(2, true, 2, false)).toBe(true);
  });

  it('does not block a teacher already assigned to a full split pair', () => {
    expect(isTeacherBlocked(2, true, 2, true)).toBe(false);
  });

  it('blocks split subject with groupCount=1 when another teacher is assigned', () => {
    expect(isTeacherBlocked(1, true, 1, false)).toBe(true);
  });

  it('does not block when assignedCount is 0 regardless of split', () => {
    expect(isTeacherBlocked(0, true, 2, false)).toBe(false);
  });
});

describe('computeDeptPlanned (З6-7)', () => {
  it('sums hours for non-split subjects without multiplier', () => {
    const result = computeDeptPlanned(
      ['Математика', 'Русский'],
      (s) => (s === 'Математика' ? 5 : 3),
      () => false,
      2,
    );
    expect(result).toBe(8); // 5 + 3
  });

  it('multiplies hours by groupCount for split subjects', () => {
    const result = computeDeptPlanned(
      ['Физкультура'],
      () => 3,
      () => true,
      2,
    );
    expect(result).toBe(6); // 3 × 2
  });

  it('mixes split and non-split subjects correctly', () => {
    const result = computeDeptPlanned(
      ['Математика', 'Физкультура'],
      (s) => (s === 'Математика' ? 5 : 3),
      (s) => s === 'Физкультура',
      2,
    );
    expect(result).toBe(11); // 5 + 3×2
  });

  it('respects groupCount=1 — no multiplier even for split subjects', () => {
    const result = computeDeptPlanned(
      ['Физкультура'],
      () => 3,
      () => true,
      1,
    );
    expect(result).toBe(3); // 3 × 1
  });

  it('returns 0 for empty subject list', () => {
    expect(computeDeptPlanned([], () => 0, () => false, 2)).toBe(0);
  });

  it('skips subjects with 0 hours', () => {
    const result = computeDeptPlanned(
      ['Физкультура', 'ОБЖ'],
      (s) => (s === 'Физкультура' ? 3 : 0),
      () => true,
      2,
    );
    expect(result).toBe(6); // 3×2 + 0×2
  });
});

describe('visibleClassesForTable (З15-2)', () => {
  const upHours = (cn: string, s: string) => {
    const map: Record<string, Record<string, number>> = {
      '7а': { 'Физика': 2, 'Химия': 1 },
      '7б': { 'Физика': 2, 'Химия': 0 },
      '5а': { 'Физика': 0, 'Химия': 0 },
      '10а': { 'Физика': 3, 'Химия': 0 },
    };
    return map[cn]?.[s] ?? 0;
  };
  const classNames = ['5а', '7а', '7б', '10а'];
  const subjects = ['Физика', 'Химия'];

  it('hides classes with no hours for any subject in filtered table', () => {
    const result = visibleClassesForTable(classNames, false, subjects, upHours);
    expect(result).toEqual(['7а', '7б', '10а']); // 5а has 0 for both
  });

  it('shows all classes for catch-all table (empty subjectFilter)', () => {
    const result = visibleClassesForTable(classNames, true, subjects, upHours);
    expect(result).toEqual(classNames);
  });

  it('returns empty array when no class has subjects', () => {
    const result = visibleClassesForTable(['5а'], false, subjects, upHours);
    expect(result).toEqual([]);
  });

  it('includes class if at least one subject has non-zero hours', () => {
    // 7б has Физика=2 but Химия=0 — should still be visible
    const result = visibleClassesForTable(['7б'], false, subjects, upHours);
    expect(result).toEqual(['7б']);
  });

  it('returns all classes when subjectNames is empty (catch-all table)', () => {
    const result = visibleClassesForTable(classNames, true, [], upHours);
    expect(result).toEqual(classNames);
  });
});

describe('buildWorkloadEntry (З12-4, З12-5)', () => {
  // Helpers for tests
  const hours: Record<string, number> = {};
  const bothGroups: Record<string, boolean> = {};

  function makeHelpers(data: Array<{ s: string; h: number; bg?: boolean }>) {
    const hMap: Record<string, number> = {};
    const bgMap: Record<string, boolean> = {};
    for (const { s, h, bg } of data) {
      hMap[s] = h;
      if (bg) bgMap[s] = true;
    }
    return {
      getHours: (_tid: string, _cn: string, s: string) =>
        s in hMap ? hMap[s] : undefined,
      getBoth: (_tid: string, _cn: string, s: string) => bgMap[s] ?? false,
    };
  }

  void hours; void bothGroups; // suppress unused-variable lint

  it('З12-4: omits zero-hour subjects in multi-subject table', () => {
    const { getHours, getBoth } = makeHelpers([
      { s: 'Математика', h: 5 },
      { s: 'Алгебра', h: 0 },
      { s: 'Геометрия', h: 1 },
    ]);
    const result = buildWorkloadEntry('t1', '5-а', ['Математика', 'Алгебра', 'Геометрия'], getHours, getBoth);
    expect(result).toBe('5-а(5/1)'); // only non-zero values
  });

  it('З12-4: single-subject with no zeros shows just class name', () => {
    const { getHours, getBoth } = makeHelpers([{ s: 'Математика', h: 5 }]);
    const result = buildWorkloadEntry('t1', '5-а', ['Математика'], getHours, getBoth);
    expect(result).toBe('5-а');
  });

  it('З12-5: adds ×2 when bothGroups is true (single subject)', () => {
    const { getHours, getBoth } = makeHelpers([{ s: 'Информатика', h: 1, bg: true }]);
    const result = buildWorkloadEntry('t1', '5-а', ['Информатика'], getHours, getBoth);
    expect(result).toBe('5-а×2');
  });

  it('З12-5: adds ×2 when bothGroups is true (multi-subject)', () => {
    const { getHours, getBoth } = makeHelpers([
      { s: 'Информатика', h: 1, bg: true },
      { s: 'Другой', h: 2 },
    ]);
    const result = buildWorkloadEntry('t1', '5-а', ['Информатика', 'Другой'], getHours, getBoth);
    expect(result).toBe('5-а(1/2)×2');
  });

  it('returns null when teacher has no assignments in the class', () => {
    const { getHours, getBoth } = makeHelpers([]);
    const result = buildWorkloadEntry('t1', '5-а', ['Математика'], getHours, getBoth);
    expect(result).toBeNull();
  });

  it('regression: old format 5-а(5/0/1/0/0/0) becomes 5-а(5/1)', () => {
    const { getHours, getBoth } = makeHelpers([
      { s: 'Мат5', h: 5 },
      { s: 'Мат6', h: 0 },
      { s: 'Алг7', h: 1 },
      { s: 'Гео7', h: 0 },
      { s: 'Алг8', h: 0 },
      { s: 'Гео8', h: 0 },
    ]);
    const subjects = ['Мат5', 'Мат6', 'Алг7', 'Гео7', 'Алг8', 'Гео8'];
    const result = buildWorkloadEntry('t1', '5-а', subjects, getHours, getBoth);
    expect(result).toBe('5-а(5/1)');
  });
});
