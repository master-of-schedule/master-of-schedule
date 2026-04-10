/**
 * Generates the official "Нагрузка учителей" report as a .docx Word document.
 *
 * Uses the `docx` npm package to produce merged cells, yellow shading,
 * two-level header, electives section, and summary totals.
 */

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  ShadingType,
  VerticalAlign,
  AlignmentType,
  BorderStyle,
} from 'docx';
import type { TableVerticalAlign } from 'docx';
import type { OfficialReport, ReportSubjectGroup } from './officialReport';

// ─── Constants ────────────────────────────────────────────────────────────────

const YELLOW = 'FFFF00';
const YELLOW_LIGHT = 'FFFF88';
const GRAY_HEADER = 'D0D0D0';

const CELL_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
};

const DXA = WidthType.DXA;

// Column widths in twips (1440 twips = 1 inch). Total ≈ 12240 (letter - margins)
const COL_WIDTHS = [2600, 2500, 700, 2400, 2200, 700]; // subj, teacher, klruk, 5-9, 10-11, hours

function dxaCell(width: number): { size: number; type: typeof DXA } {
  return { size: width, type: DXA };
}

// ─── Cell builders ────────────────────────────────────────────────────────────

function plainCell(
  text: string,
  opts: {
    width?: number;
    fill?: string;
    bold?: boolean;
    rowSpan?: number;
    colSpan?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    vertAlign?: TableVerticalAlign;
    fontSize?: number;
  } = {},
): TableCell {
  const {
    width,
    fill,
    bold = false,
    rowSpan,
    colSpan,
    align = AlignmentType.LEFT,
    vertAlign = VerticalAlign.TOP as TableVerticalAlign,
    fontSize = 20,
  } = opts;

  return new TableCell({
    ...(rowSpan ? { rowSpan } : {}),
    ...(colSpan ? { columnSpan: colSpan } : {}),
    ...(width ? { width: dxaCell(width) } : {}),
    verticalAlign: vertAlign,
    shading: fill ? { fill, type: ShadingType.SOLID, color: fill } : undefined,
    borders: CELL_BORDER,
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({ text, bold, size: fontSize }),
        ],
      }),
    ],
  });
}

// ─── Subject cell ─────────────────────────────────────────────────────────────

function buildSubjectCell(group: ReportSubjectGroup, rowSpan: number): TableCell {
  const lines: string[] = [];
  lines.push(group.displayName); // bold+underline, handled via firstLineBold
  lines.push(`Всего: ${group.totalHours} ч.`);
  lines.push('Из них:');
  lines.push(`  5–9 кл. — ${group.hours5to9} ч.`);
  lines.push(`  10–11 кл. — ${group.hours10to11} ч.`);

  if (group.isCompound && group.subjectBreakdown.length > 0) {
    for (const bd of group.subjectBreakdown) {
      lines.push(`  ${bd.name} — ${bd.total} ч. (5–9: ${bd.hours5to9}; 10–11: ${bd.hours10to11})`);
    }
  }

  return new TableCell({
    rowSpan,
    width: dxaCell(COL_WIDTHS[0]),
    verticalAlign: VerticalAlign.TOP,
    shading: { fill: YELLOW, type: ShadingType.SOLID, color: YELLOW },
    borders: CELL_BORDER,
    children: lines.map((line, i) =>
      new Paragraph({
        children: [
          new TextRun({
            text: line,
            bold: i === 0,
            underline: i === 0 ? {} : undefined,
            size: 20,
          }),
        ],
      }),
    ),
  });
}

// ─── Header rows ─────────────────────────────────────────────────────────────

function buildHeaderRows(): TableRow[] {
  // Row 1: Subject (rowspan 2) | Teacher (rowspan 2) | Кл.рук (rowspan 2) | "Классы, кол-во часов" (colspan 2) | Часов (rowspan 2)
  const row1 = new TableRow({
    children: [
      plainCell('Предмет\nОбщее к-во часов', { width: COL_WIDTHS[0], fill: GRAY_HEADER, bold: true, rowSpan: 2, vertAlign: VerticalAlign.CENTER, align: AlignmentType.CENTER }),
      plainCell('Учитель', { width: COL_WIDTHS[1], fill: GRAY_HEADER, bold: true, rowSpan: 2, vertAlign: VerticalAlign.CENTER, align: AlignmentType.CENTER }),
      plainCell('Кл.\nрук.', { width: COL_WIDTHS[2], fill: GRAY_HEADER, bold: true, rowSpan: 2, vertAlign: VerticalAlign.CENTER, align: AlignmentType.CENTER }),
      plainCell('Классы, количество часов', { width: COL_WIDTHS[3] + COL_WIDTHS[4], fill: GRAY_HEADER, bold: true, colSpan: 2, vertAlign: VerticalAlign.CENTER, align: AlignmentType.CENTER }),
      plainCell('Часов', { width: COL_WIDTHS[5], fill: GRAY_HEADER, bold: true, rowSpan: 2, vertAlign: VerticalAlign.CENTER, align: AlignmentType.CENTER }),
    ],
  });

  // Row 2: 5–9 | 10–11
  const row2 = new TableRow({
    children: [
      plainCell('5–9', { width: COL_WIDTHS[3], fill: GRAY_HEADER, bold: true, align: AlignmentType.CENTER }),
      plainCell('10–11', { width: COL_WIDTHS[4], fill: GRAY_HEADER, bold: true, align: AlignmentType.CENTER }),
    ],
  });

  return [row1, row2];
}

// ─── Data rows ────────────────────────────────────────────────────────────────

function buildDeptHeaderRow(label: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 6,
        shading: { fill: 'C6EFCE', type: ShadingType.SOLID, color: 'C6EFCE' },
        borders: CELL_BORDER,
        children: [
          new Paragraph({
            children: [new TextRun({ text: label, bold: true, size: 22 })],
          }),
        ],
      }),
    ],
  });
}

function buildGroupRows(group: ReportSubjectGroup): TableRow[] {
  const rows: TableRow[] = [];
  const rs = group.teachers.length;

  group.teachers.forEach((t, i) => {
    const cells: TableCell[] = [];

    if (i === 0) {
      cells.push(buildSubjectCell(group, rs));
    }

    cells.push(
      plainCell(t.teacherName, { width: COL_WIDTHS[1] }),
      plainCell(t.homeroomClass ?? '', { width: COL_WIDTHS[2], align: AlignmentType.CENTER }),
      plainCell(t.cells5to9, { width: COL_WIDTHS[3] }),
      plainCell(t.cells10to11, { width: COL_WIDTHS[4] }),
      plainCell(String(t.totalHours), { width: COL_WIDTHS[5], align: AlignmentType.CENTER }),
    );

    rows.push(new TableRow({ children: cells }));
  });

  return rows;
}

// ─── Electives ────────────────────────────────────────────────────────────────

function buildElectivesSection(report: OfficialReport): (Paragraph | Table)[] {
  if (report.electives.length === 0) return [];

  const result: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: 'Элективные курсы 10–11 классы', bold: true, size: 24 })],
      spacing: { before: 240, after: 120 },
    }),
  ];

  const rows: TableRow[] = [];
  for (const course of report.electives) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 6,
            shading: { fill: 'F0F0F0', type: ShadingType.SOLID, color: 'F0F0F0' },
            borders: CELL_BORDER,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `${course.name} — ${course.totalHours} ч.`, bold: true, size: 20 }),
                ],
              }),
            ],
          }),
        ],
      }),
    );

    for (const row of course.rows) {
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 3,
              borders: CELL_BORDER,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: `   ${row.className} (${row.hours} ч.)`, size: 20 })],
                }),
              ],
            }),
            new TableCell({
              columnSpan: 3,
              borders: CELL_BORDER,
              children: [new Paragraph({ children: [new TextRun({ text: row.teacherName, size: 20 })] })],
            }),
          ],
        }),
      );
    }
  }

  result.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  return result;
}

// ─── Summary section ──────────────────────────────────────────────────────────

function buildSummaryTable(report: OfficialReport): Table {
  const s = report.summary;

  function sumRow(label: string, value: number, fill?: string): TableRow {
    return new TableRow({
      children: [
        new TableCell({
          columnSpan: 5,
          shading: fill ? { fill, type: ShadingType.SOLID, color: fill } : undefined,
          borders: CELL_BORDER,
          children: [new Paragraph({ children: [new TextRun({ text: label, size: 20 })] })],
        }),
        new TableCell({
          shading: fill ? { fill, type: ShadingType.SOLID, color: fill } : undefined,
          borders: CELL_BORDER,
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: `${value} ч.`, bold: !!fill, size: 20 })],
            }),
          ],
        }),
      ],
    });
  }

  const summaryRows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 6,
          shading: { fill: YELLOW, type: ShadingType.SOLID, color: YELLOW },
          borders: CELL_BORDER,
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Всего на учебные предметы:', bold: true, size: 22 })],
            }),
          ],
        }),
      ],
    }),
    sumRow('1. По учебным планам 5–9 кл. в обязательной части (без деления на группы)', s.mandatory59NoSplit),
    sumRow('2. + при делении на группы', s.mandatory59Split),
    ...(s.optional59 > 0
      ? [sumRow('3. В части, формируемой участниками (5–9 кл.)', s.optional59)]
      : []),
    sumRow('Общее количество часов в основном корпусе по ООО', s.total59, YELLOW_LIGHT),
    sumRow('4. По учебным планам 10–11 кл. (без деления на группы)', s.mandatory1011NoSplit),
    sumRow('5. + при делении на группы', s.mandatory1011Split),
    ...(s.optional1011 > 0
      ? [sumRow('6. Элективные курсы (10–11 кл.)', s.optional1011)]
      : []),
    sumRow('Общее количество часов по СОО', s.total1011, YELLOW_LIGHT),
    sumRow('Общее количество часов в 5–11 классах', s.grandTotal, YELLOW),
  ];

  return new Table({ rows: summaryRows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

// ─── Main builder ─────────────────────────────────────────────────────────────

function formatVariantText(date: string, label: string): string {
  if (!date) return label ? `Вариант_ ${label}` : '';
  const d = new Date(date);
  const formatted = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return label ? `Вариант_ ${formatted} — ${label}` : `Вариант_ ${formatted}`;
}

export async function downloadWordReport(report: OfficialReport): Promise<void> {
  const mainTableRows: TableRow[] = [
    ...buildHeaderRows(),
    ...report.subjectGroups.flatMap((g) => [
      ...(g.deptLabel ? [buildDeptHeaderRow(g.deptLabel)] : []),
      ...buildGroupRows(g),
    ]),
  ];

  const mainTable = new Table({
    rows: mainTableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });

  const variantText = formatVariantText(report.variantDate, report.variantLabel);

  const sections = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'Нагрузка учителей основной общей и средней общей школы',
          bold: true,
          size: 26,
        }),
      ],
      spacing: { after: 60 },
    }),
    ...(report.schoolYear
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `на ${report.schoolYear} учебный год`, size: 24 })],
            spacing: { after: 40 },
          }),
        ]
      : []),
    ...(variantText
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: variantText, size: 24 })],
            spacing: { after: 120 },
          }),
        ]
      : []),
    mainTable,
    ...buildElectivesSection(report),
    new Paragraph({ children: [], spacing: { before: 240 } }),
    buildSummaryTable(report),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 900, right: 720 },
          },
        },
        children: sections,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const yearPart = report.schoolYear ? `_${report.schoolYear}` : '';
  a.href = url;
  a.download = `нагрузка_учителей${yearPart}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
