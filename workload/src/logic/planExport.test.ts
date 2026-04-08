import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildPlanWorkbook } from './planExport';
import type { CurriculumPlan } from '../types';

const PLAN: CurriculumPlan = {
  classNames: ['5-а', '5-б', '10-а'],
  grades: [
    {
      grade: 5,
      subjects: [
        { name: 'Математика', shortName: 'Мат', hoursPerClass: { '5-а': 5, '5-б': 5 }, groupSplit: false, part: 'mandatory' as const },
        { name: 'Физкультура', shortName: 'Физ-ра', hoursPerClass: { '5-а': 3, '5-б': 3 }, groupSplit: true, part: 'mandatory' as const },
        { name: 'Электив', shortName: 'Эл', hoursPerClass: { '5-а': 1, '5-б': 0 }, groupSplit: false, part: 'optional' as const },
      ],
    },
    {
      grade: 10,
      subjects: [
        { name: 'Алгебра', shortName: 'Алг', hoursPerClass: { '10-а': 4 }, groupSplit: false, part: 'mandatory' as const },
      ],
    },
  ],
};

describe('buildPlanWorkbook', () => {
  it('creates one sheet per grade', () => {
    const wb = buildPlanWorkbook(PLAN);
    expect(wb.SheetNames).toEqual(['5 класс', '10 класс']);
  });

  it('sheet contains header, subject rows, and totals', () => {
    const wb = buildPlanWorkbook(PLAN);
    const ws = wb.Sheets['5 класс'];
    const data = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1 });

    // Header
    expect(data[0]).toEqual(['Часть', 'Предмет', '5-а', '5-б']);

    // Математика row
    expect(data[1]).toEqual(['Обязательная часть', 'Математика', 5, 5]);

    // Физкультура row
    expect(data[2]).toEqual(['Обязательная часть', 'Физкультура', 3, 3]);

    // Электив row (optional part)
    expect(data[3]).toEqual(['Школьная часть', 'Электив', 1, 0]);

    // Totals row
    expect(data[4]).toEqual(['', 'Итого', 9, 8]);
  });

  it('only includes classes relevant to the grade', () => {
    const wb = buildPlanWorkbook(PLAN);
    const ws = wb.Sheets['10 класс'];
    const data = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1 });

    // Only 10-а, not 5-а or 5-б
    expect(data[0]).toEqual(['Часть', 'Предмет', '10-а']);
    expect(data[1]).toEqual(['Обязательная часть', 'Алгебра', 4]);
    expect(data[2]).toEqual(['', 'Итого', 4]);
  });

  it('sorts classes within a grade', () => {
    const plan: CurriculumPlan = {
      classNames: ['5-в', '5-а', '5-б'],
      grades: [{
        grade: 5,
        subjects: [
          { name: 'Математика', shortName: 'Мат', hoursPerClass: { '5-в': 5, '5-а': 5, '5-б': 5 }, groupSplit: false, part: 'mandatory' as const },
        ],
      }],
    };
    const wb = buildPlanWorkbook(plan);
    const ws = wb.Sheets['5 класс'];
    const data = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1 });
    expect(data[0]).toEqual(['Часть', 'Предмет', '5-а', '5-б', '5-в']);
  });
});
