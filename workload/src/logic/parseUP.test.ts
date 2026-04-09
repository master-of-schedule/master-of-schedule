import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseUP, normalizeClassName } from './parseUP';

// Build an in-memory .xlsx File from a 2D array of rows
function makeXlsx(rows: (string | number | null)[][], sheetName = 'Учебный план'): File {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buf], 'test.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// Realistic format matching the school's Книга1.xlsx:
// col[0] = section label (optional), col[1] = grade header or subject name, col[2+] = hours
//
// 5th grade: classes on same row as grade header (Case A)
// 6th grade: classes on separate row below the grade header (Case B)
const MINIMAL_ROWS: (string | number | null)[][] = [
  // Grade 5: classes on same row
  ['', '5 класс', '5а', '5б'],
  ['Обязательная часть', 'Математика', 5, 5],
  ['', 'Физкультура', 3, 3],
  ['', '', 8, 8],                      // итого — skipped (empty col[1])
  ['Школьная часть', '', null, null],  // section divider — skipped (empty col[1])
  ['', 'Информатика', 1, 1],
  // Grade 6: classes on separate row (Case B)
  ['', '6 класс', null, null],
  ['', '', '6а', '6б'],
  ['', 'Русский язык', 4, 4],
];

// ── normalizeClassName ────────────────────────────────────────────────────────

describe('normalizeClassName', () => {
  it('adds dash: "5а" → "5-а"', () => {
    expect(normalizeClassName('5а')).toBe('5-а');
  });

  it('trims whitespace and adds dash: "  5д " → "5-д"', () => {
    expect(normalizeClassName('  5д ')).toBe('5-д');
  });

  it('handles multi-char suffix: "5Мк" → "5-Мк"', () => {
    expect(normalizeClassName('5Мк')).toBe('5-Мк');
  });

  it('does not double-dash: "5-а" stays "5-а"', () => {
    expect(normalizeClassName('5-а')).toBe('5-а');
  });

  it('handles grade 10: "10б" → "10-б"', () => {
    expect(normalizeClassName('10б')).toBe('10-б');
  });

  it('handles trailing space on 2-digit grade: "10б " → "10-б"', () => {
    expect(normalizeClassName('10б ')).toBe('10-б');
  });
});

// ── parseUP ───────────────────────────────────────────────────────────────────

describe('parseUP', () => {
  it('parses two grade blocks from minimal sheet', async () => {
    const plan = await parseUP(makeXlsx(MINIMAL_ROWS));
    expect(plan.grades).toHaveLength(2);
    expect(plan.grades[0].grade).toBe(5);
    expect(plan.grades[1].grade).toBe(6);
  });

  it('collects all class names across grades, normalised', async () => {
    const plan = await parseUP(makeXlsx(MINIMAL_ROWS));
    expect(plan.classNames).toEqual(['5-а', '5-б', '6-а', '6-б']);
  });

  it('normalises class names with trailing whitespace', async () => {
    const rows: (string | number | null)[][] = [
      ['', '5 класс', '  5а ', '5б '],
      ['', 'Математика', 5, 5],
    ];
    const plan = await parseUP(makeXlsx(rows));
    expect(plan.classNames).toEqual(['5-а', '5-б']);
  });

  it('handles Case B: classes on separate row below grade header', async () => {
    const rows: (string | number | null)[][] = [
      ['', '6 класс', null, null],
      ['', '', '6а', '6б'],
      ['', 'Русский язык', 4, 4],
    ];
    const plan = await parseUP(makeXlsx(rows));
    expect(plan.grades).toHaveLength(1);
    expect(plan.grades[0].grade).toBe(6);
    expect(plan.classNames).toEqual(['6-а', '6-б']);
    expect(plan.grades[0].subjects[0].hoursPerClass['6-а']).toBe(4);
  });

  it('extracts subject rows with correct hours (normalised class names)', async () => {
    const plan = await parseUP(makeXlsx(MINIMAL_ROWS));
    const grade5 = plan.grades[0];
    expect(grade5.subjects.length).toBeGreaterThanOrEqual(2);
    const math = grade5.subjects.find((s) => s.name === 'Математика');
    expect(math).toBeDefined();
    expect(math!.hoursPerClass['5-а']).toBe(5);
    expect(math!.hoursPerClass['5-б']).toBe(5);
  });

  it('skips summary rows (empty col[1])', async () => {
    const plan = await parseUP(makeXlsx(MINIMAL_ROWS));
    const grade5 = plan.grades[0];
    expect(grade5.subjects.map((s) => s.name)).not.toContain('');
  });

  it('skips section divider rows (Обязательная часть / Школьная часть in col[0], col[1] empty)', async () => {
    const plan = await parseUP(makeXlsx(MINIMAL_ROWS));
    const names = plan.grades[0].subjects.map((s) => s.name);
    expect(names).not.toContain('Обязательная часть');
    expect(names).not.toContain('Школьная часть');
  });

  it('includes subjects from Школьная часть (same as Обязательная часть)', async () => {
    const plan = await parseUP(makeXlsx(MINIMAL_ROWS));
    const names = plan.grades[0].subjects.map((s) => s.name);
    expect(names).toContain('Информатика');
  });

  it('auto-detects groupSplit for Физкультура', async () => {
    const plan = await parseUP(makeXlsx(MINIMAL_ROWS));
    const pe = plan.grades[0].subjects.find((s) => s.name === 'Физкультура');
    expect(pe!.groupSplit).toBe(true);
  });

  it('auto-detects groupSplit for Физическая культура', async () => {
    const rows: (string | number | null)[][] = [
      ['', '5 класс', '5а', '5б'],
      ['', 'Физическая культура', 2, 2],
    ];
    const plan = await parseUP(makeXlsx(rows));
    expect(plan.grades[0].subjects[0].groupSplit).toBe(true);
  });

  it('does not set groupSplit for Математика', async () => {
    const plan = await parseUP(makeXlsx(MINIMAL_ROWS));
    const math = plan.grades[0].subjects.find((s) => s.name === 'Математика');
    expect(math!.groupSplit).toBe(false);
  });

  it('derives a short name', async () => {
    const plan = await parseUP(makeXlsx(MINIMAL_ROWS));
    const math = plan.grades[0].subjects.find((s) => s.name === 'Математика');
    expect(math!.shortName).toBe('Мат');
  });

  it('parses grade 6 subjects with grade-6 class names', async () => {
    const plan = await parseUP(makeXlsx(MINIMAL_ROWS));
    const grade6 = plan.grades[1];
    expect(grade6.subjects).toHaveLength(1);
    expect(grade6.subjects[0].name).toBe('Русский язык');
    expect(grade6.subjects[0].hoursPerClass['6-а']).toBe(4);
  });

  it('skips subjects with zero hours in all classes', async () => {
    const rows: (string | number | null)[][] = [
      ['', '5 класс', '5а', '5б'],
      ['', 'Математика', 5, 5],
      ['', 'Пустой предмет', 0, 0],
    ];
    const plan = await parseUP(makeXlsx(rows));
    expect(plan.grades[0].subjects.map((s) => s.name)).not.toContain('Пустой предмет');
  });

  it('handles subject with hours only in some classes (elective)', async () => {
    const rows: (string | number | null)[][] = [
      ['', '5 класс', '5а', '5б', '5в'],
      ['', 'Электив', null, 2, null],
    ];
    const plan = await parseUP(makeXlsx(rows));
    const elec = plan.grades[0].subjects.find((s) => s.name === 'Электив');
    expect(elec).toBeDefined();
    expect(elec!.hoursPerClass['5-а']).toBeUndefined();
    expect(elec!.hoursPerClass['5-б']).toBe(2);
    expect(elec!.hoursPerClass['5-в']).toBeUndefined();
  });

  it('works with sheet named something other than "Учебный план" (uses first sheet)', async () => {
    const plan = await parseUP(makeXlsx(MINIMAL_ROWS, 'Другой лист'));
    expect(plan.grades).toHaveLength(2);
  });

  it('finds "Учебный план" sheet when multiple sheets present', async () => {
    const ws1 = XLSX.utils.aoa_to_sheet([['junk']]);
    const ws2 = XLSX.utils.aoa_to_sheet(MINIMAL_ROWS);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Другой');
    XLSX.utils.book_append_sheet(wb, ws2, 'Учебный план');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const file = new File([buf], 'test.xlsx');
    const plan = await parseUP(file);
    expect(plan.grades).toHaveLength(2);
  });

  it('throws when no grade headers found', async () => {
    const rows: (string | number | null)[][] = [
      ['', 'Математика', 5, 5],
      ['', 'Физкультура', 3, 3],
    ];
    await expect(parseUP(makeXlsx(rows))).rejects.toThrow();
  });

  it('Case B: collects classes from multiple rows (З3-13 regression)', async () => {
    // Real Книга1.xlsx sometimes lists 6th-grade classes across two rows
    const rows: (string | number | null)[][] = [
      ['', '6 класс', null, null, null, null, null],
      ['', '', '6а', null, '6в', '6г', null],   // row 1: some classes
      ['', '', null, '6б', null, null, '6д'],    // row 2: remaining classes
      ['', 'Русский язык', 4, 4, 4, 4, 4],
    ];
    const plan = await parseUP(makeXlsx(rows));
    expect(plan.classNames).toEqual(['6-а', '6-б', '6-в', '6-г', '6-д']); // sorted
    const subj = plan.grades[0].subjects[0];
    expect(subj.hoursPerClass['6-а']).toBe(4);
    expect(subj.hoursPerClass['6-б']).toBe(4);
    expect(subj.hoursPerClass['6-д']).toBe(4);
  });

  it('classNames are sorted numerically by grade even when file has them in non-sequential order', async () => {
    const rows: (string | number | null)[][] = [
      ['', '10 класс', '10а', '10б'],
      ['', 'Алгебра', 3, 3],
      ['', '5 класс', '5б', '5а'],
      ['', 'Математика', 5, 5],
    ];
    const plan = await parseUP(makeXlsx(rows));
    expect(plan.classNames).toEqual(['5-а', '5-б', '10-а', '10-б']);
  });

  it('З3-5: captures expectedTotals from итого row', async () => {
    const rows: (string | number | null)[][] = [
      ['', '5 класс', '5а', '5б'],
      ['', 'Математика', 5, 5],
      ['', 'Физкультура', 3, 3],
      ['', '', 8, 8],  // итого row
    ];
    const plan = await parseUP(makeXlsx(rows));
    expect(plan.grades[0].expectedTotals).toEqual({ '5-а': 8, '5-б': 8 });
  });

  it('З3-5: no expectedTotals when no итого row present', async () => {
    const rows: (string | number | null)[][] = [
      ['', '5 класс', '5а', '5б'],
      ['', 'Математика', 5, 5],
    ];
    const plan = await parseUP(makeXlsx(rows));
    expect(plan.grades[0].expectedTotals).toBeUndefined();
  });

  it('З3-5: picks grand total (largest sum) when multiple candidate rows', async () => {
    const rows: (string | number | null)[][] = [
      ['', '5 класс', '5а', '5б'],
      ['Обязательная', 'Математика', 5, 5],
      ['', '', 5, 5],     // sub-total
      ['Школьная', 'Информатика', 1, 1],
      ['', '', 6, 6],     // grand total
    ];
    const plan = await parseUP(makeXlsx(rows));
    expect(plan.grades[0].expectedTotals).toEqual({ '5-а': 6, '5-б': 6 });
  });

  it('throws when grade blocks found but no class names anywhere', async () => {
    const rows: (string | number | null)[][] = [
      ['', '5 класс', null, null],
      ['', 'нет классов тут'],
    ];
    await expect(parseUP(makeXlsx(rows))).rejects.toThrow();
  });

  // З11-1: part field detection
  it('assigns part=mandatory to subjects before the optional section header', async () => {
    const plan = await parseUP(makeXlsx(MINIMAL_ROWS));
    const grade5 = plan.grades[0];
    const math = grade5.subjects.find((s) => s.name === 'Математика');
    const pe = grade5.subjects.find((s) => s.name === 'Физкультура');
    expect(math!.part).toBe('mandatory');
    expect(pe!.part).toBe('mandatory');
  });

  it('assigns part=optional to subjects after the Школьная часть header', async () => {
    const plan = await parseUP(makeXlsx(MINIMAL_ROWS));
    const grade5 = plan.grades[0];
    const inf = grade5.subjects.find((s) => s.name === 'Информатика');
    expect(inf!.part).toBe('optional');
  });

  it('resets part to mandatory at the start of each grade block', async () => {
    const plan = await parseUP(makeXlsx(MINIMAL_ROWS));
    const grade6 = plan.grades[1];
    expect(grade6.subjects[0].part).toBe('mandatory');
  });

  it('assigns part=mandatory when no section headers present', async () => {
    const rows: (string | number | null)[][] = [
      ['', '5 класс', '5а'],
      ['', 'Математика', 5],
      ['', 'Физкультура', 3],
    ];
    const plan = await parseUP(makeXlsx(rows));
    for (const s of plan.grades[0].subjects) {
      expect(s.part).toBe('mandatory');
    }
  });

  it('supports same subject name in both mandatory and optional sections', async () => {
    const rows: (string | number | null)[][] = [
      ['', '5 класс', '5а'],
      ['Обязательная часть', 'Математика', 3],
      ['Школьная часть', '', null],
      ['', 'Математика', 1],
    ];
    const plan = await parseUP(makeXlsx(rows));
    const grade5 = plan.grades[0];
    const subjects = grade5.subjects.filter((s) => s.name === 'Математика');
    expect(subjects).toHaveLength(2);
    const mandatory = subjects.find((s) => s.part === 'mandatory');
    const optional = subjects.find((s) => s.part === 'optional');
    expect(mandatory!.hoursPerClass['5-а']).toBe(3);
    expect(optional!.hoursPerClass['5-а']).toBe(1);
  });

  it('parses realistic multi-grade file similar to Книга1.xlsx', async () => {
    const rows: (string | number | null)[][] = [
      // 5th grade: classes on same row
      ['', '5 класс', '5а', '5б', '5в', null, null],
      ['Обязательная часть', 'Русский язык', 5, 5, 5, null, null],
      ['', 'Математика', 5, 5, 5, null, null],
      ['', '', 10, 10, 10, null, null],          // итого — skipped
      ['Школьная часть', '', null, null, null, null, null],
      ['', 'Математический практикум', 1, 1, null, null, null],
      // 6th grade: classes on separate row
      ['', '6 класс', null, null, null, null, null],
      ['', '', null, null, null, '6а', '6б'],
      ['', 'Русский язык', null, null, null, 6, 6],
      ['', 'Математика', null, null, null, 5, 5],
    ];
    const plan = await parseUP(makeXlsx(rows));
    expect(plan.grades).toHaveLength(2);
    expect(plan.classNames).toEqual(['5-а', '5-б', '5-в', '6-а', '6-б']);
    expect(plan.grades[0].subjects.map((s) => s.name)).toContain('Математический практикум');
    expect(plan.grades[1].subjects[0].hoursPerClass['6-а']).toBe(6);
  });
});
