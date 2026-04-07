/**
 * Generates a blank UP (учебный план) xlsx template matching the format
 * expected by parseUP.ts — so the stakeholder can fill it in and import it.
 *
 * Format:
 *   Sheet: "Учебный план"
 *   Per grade block:
 *     Row 1: ["", "X класс", "Xа", "Xб", "Xв"]   ← grade header + class names
 *     Row 2: ["Обяз.", "Предмет 1", 4, 4, 4]       ← subject rows
 *     Row 3: ["Обяз.", "Предмет 2", 3, 3, 3]
 *     Row 4: ["Школ.", "Электив", 1, 0, 2]
 *     Row 5: ["", "Итого", formula, formula, formula]  ← blank separator
 *     (blank row between grade blocks)
 */

import * as XLSX from 'xlsx';

const EXAMPLE_GRADES = [
  {
    grade: 5,
    classes: ['5-а', '5-б', '5-в'],
    subjects: [
      { section: 'Обязательная часть', name: 'Русский язык', hours: [5, 5, 5] },
      { section: 'Обязательная часть', name: 'Литература', hours: [3, 3, 3] },
      { section: 'Обязательная часть', name: 'Иностранный язык (английский язык)', hours: [2, 2, 2] },
      { section: 'Обязательная часть', name: 'Математика', hours: [5, 5, 5] },
      { section: 'Обязательная часть', name: 'История', hours: [2, 2, 2] },
      { section: 'Обязательная часть', name: 'Обществознание', hours: [1, 1, 1] },
      { section: 'Обязательная часть', name: 'Биология', hours: [1, 1, 1] },
      { section: 'Обязательная часть', name: 'Физическая культура', hours: [2, 2, 2] },
      { section: 'Обязательная часть', name: 'Труд (технология)', hours: [2, 2, 2] },
      { section: 'Школьная часть', name: 'Электив / курс по выбору', hours: [1, 0, 2] },
    ],
  },
  {
    grade: 6,
    classes: ['6-а', '6-б', '6-в'],
    subjects: [
      { section: 'Обязательная часть', name: 'Русский язык', hours: [5, 5, 5] },
      { section: 'Обязательная часть', name: 'Литература', hours: [3, 3, 3] },
      { section: 'Обязательная часть', name: 'Иностранный язык (английский язык)', hours: [3, 3, 3] },
      { section: 'Обязательная часть', name: 'Математика', hours: [5, 5, 5] },
      { section: 'Обязательная часть', name: 'Физическая культура', hours: [2, 2, 2] },
      { section: 'Школьная часть', name: 'Электив / курс по выбору', hours: [1, 0, 0] },
    ],
  },
];

const INSTRUCTION_ROWS = [
  ['ИНСТРУКЦИЯ ПО ЗАПОЛНЕНИЮ'],
  [''],
  ['1. Не меняйте название листа «Учебный план».'],
  ['2. Каждый блок начинается со строки «X класс» в столбце B (столбец A — номер, можно оставить пустым).'],
  ['3. Имена классов — в той же строке что «X класс», начиная со столбца C.'],
  ['4. Предметы — в следующих строках: столбец A — раздел («Обязательная часть» / «Школьная часть»), B — название предмета, C и далее — часы.'],
  ['5. Строки с пустым столбцом B (итого, разделители) — игнорируются при импорте.'],
  ['6. Между блоками оставьте одну пустую строку.'],
  ['7. Сохраните файл как .xlsx и загрузите в Редактор нагрузки на вкладке «Учебный план».'],
  [''],
  ['Пример структуры смотрите на листе «Учебный план» ниже.'],
];

export function downloadUPTemplate(): void {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Инструкция ────────────────────────────────────────────────────
  const instrWs = XLSX.utils.aoa_to_sheet(INSTRUCTION_ROWS);
  instrWs['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, instrWs, 'Инструкция');

  // ── Sheet 2: Учебный план (example data) ──────────────────────────────────
  const rows: (string | number)[][] = [];

  for (const { grade, classes, subjects } of EXAMPLE_GRADES) {
    // Grade header row: ["", "X класс", "Xа", "Xб", ...]
    rows.push(['', `${grade} класс`, ...classes]);

    for (const { section, name, hours } of subjects) {
      rows.push([section, name, ...hours]);
    }

    // Totals row placeholder
    const totalHours = classes.map((_, ci) =>
      subjects.reduce((sum, s) => sum + (s.hours[ci] ?? 0), 0),
    );
    rows.push(['', 'Итого', ...totalHours]);

    // Blank row between grade blocks
    rows.push([]);
  }

  const planWs = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  const maxClassCount = Math.max(...EXAMPLE_GRADES.map((g) => g.classes.length));
  planWs['!cols'] = [
    { wch: 20 }, // A: section
    { wch: 45 }, // B: subject name
    ...Array.from({ length: maxClassCount }, () => ({ wch: 6 })),
  ];

  XLSX.utils.book_append_sheet(wb, planWs, 'Учебный план');

  // ── Download ───────────────────────────────────────────────────────────────
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'шаблон_учебного_плана.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
