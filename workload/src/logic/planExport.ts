/**
 * Export the current curriculum plan (учебный план) as an xlsx file.
 * One sheet per grade block, subjects as rows, classes as columns.
 */

import * as XLSX from 'xlsx';
import type { CurriculumPlan } from '../types';
import { compareClassNames } from './classSort';

export function buildPlanWorkbook(plan: CurriculumPlan): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  for (const grade of plan.grades) {
    // Collect class names for this grade and sort them
    const classNames = plan.classNames
      .filter((cn) => grade.subjects.some((s) => (s.hoursPerClass[cn] ?? 0) > 0))
      .sort(compareClassNames);

    if (classNames.length === 0) continue;

    const rows: (string | number)[][] = [];

    // Header row: ["Часть", "Предмет", class1, class2, ...]
    rows.push(['Часть', 'Предмет', ...classNames]);

    // Subject rows
    for (const subject of grade.subjects) {
      const sectionLabel = subject.part === 'optional' ? 'Школьная часть' : 'Обязательная часть';
      const hours = classNames.map((cn) => subject.hoursPerClass[cn] ?? 0);
      rows.push([sectionLabel, subject.name, ...hours]);
    }

    // Totals row
    const totals = classNames.map((cn) =>
      grade.subjects.reduce((sum, s) => sum + (s.hoursPerClass[cn] ?? 0), 0),
    );
    rows.push(['', 'Итого', ...totals]);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Column widths
    ws['!cols'] = [
      { wch: 20 }, // section
      { wch: 45 }, // subject name
      ...classNames.map(() => ({ wch: 6 })),
    ];

    XLSX.utils.book_append_sheet(wb, ws, `${grade.grade} класс`);
  }

  return wb;
}

export function downloadPlanXlsx(plan: CurriculumPlan): void {
  const wb = buildPlanWorkbook(plan);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'учебный_план.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
