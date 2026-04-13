/**
 * RF-W12: Golden-output tests for export generator functions.
 *
 * buildOfficialReportHtml — returns an HTML string, fully testable without DOM.
 * buildWordDocument       — returns a docx Document; tested by packing to a buffer.
 */
import { describe, it, expect } from 'vitest';
import { Packer } from 'docx';
import { buildOfficialReportHtml } from './exportPdfReport';
import { buildWordDocument } from './exportWordReport';
import type { OfficialReport } from './officialReport';

function makeReport(overrides: Partial<OfficialReport> = {}): OfficialReport {
  return {
    variantDate: '',
    variantLabel: '',
    schoolYear: '2025-2026',
    subjectGroups: [
      {
        displayName: 'Математика',
        subjects: ['Математика'],
        isCompound: false,
        totalHours: 20,
        hours5to9: 15,
        hours10to11: 5,
        subjectBreakdown: [],
        teachers: [
          {
            teacherName: 'Иванов И.И.',
            homeroomClass: '5А',
            cells5to9: '5А-4, 6А-3',
            cells10to11: '10А-4',
            totalHours: 20,
          },
        ],
      },
    ],
    electives: [],
    summary: {
      mandatory59NoSplit: 100,
      mandatory59Split: 20,
      optional59: 0,
      mandatory1011NoSplit: 80,
      mandatory1011Split: 10,
      optional1011: 0,
      total59: 120,
      total1011: 90,
      grandTotal: 210,
    },
    ...overrides,
  };
}

// ─── buildOfficialReportHtml ──────────────────────────────────────────────────

describe('buildOfficialReportHtml', () => {
  it('returns a non-empty HTML string', () => {
    const html = buildOfficialReportHtml(makeReport());
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(100);
  });

  it('starts with <!DOCTYPE html>', () => {
    expect(buildOfficialReportHtml(makeReport()).trimStart().startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('includes the school year in a title/paragraph', () => {
    const html = buildOfficialReportHtml(makeReport());
    expect(html).toContain('2025-2026');
  });

  it('includes teacher names from the report', () => {
    const html = buildOfficialReportHtml(makeReport());
    expect(html).toContain('Иванов И.И.');
  });

  it('includes subject name from the report', () => {
    const html = buildOfficialReportHtml(makeReport());
    expect(html).toContain('Математика');
  });

  it('includes total hours in the output', () => {
    const html = buildOfficialReportHtml(makeReport());
    expect(html).toContain('210');
  });

  it('escapes HTML special characters in teacher name', () => {
    const report = makeReport();
    report.subjectGroups[0].teachers[0].teacherName = 'O\'Brien <Senior>';
    const html = buildOfficialReportHtml(report);
    expect(html).not.toContain('<Senior>');
    expect(html).toContain('&lt;Senior&gt;');
  });

  it('skips subject groups that have no teachers', () => {
    const report = makeReport();
    report.subjectGroups.push({
      displayName: 'Пустой предмет',
      subjects: ['Пустой предмет'],
      isCompound: false,
      totalHours: 0,
      hours5to9: 0,
      hours10to11: 0,
      subjectBreakdown: [],
      teachers: [],
    });
    const html = buildOfficialReportHtml(report);
    expect(html).not.toContain('Пустой предмет');
  });

  it('includes variant header when variantDate is set', () => {
    const report = makeReport({ variantDate: '2025-08-18', variantLabel: 'первый' });
    const html = buildOfficialReportHtml(report);
    expect(html).toContain('Вариант_');
    expect(html).toContain('первый');
  });

  it('omits variant header when variantDate and variantLabel are empty', () => {
    const html = buildOfficialReportHtml(makeReport({ variantDate: '', variantLabel: '' }));
    expect(html).not.toContain('Вариант_');
  });

  it('includes electives section when report has electives', () => {
    const report = makeReport({
      electives: [
        {
          name: 'Элективный курс по физике',
          totalHours: 18,
          rows: [{ className: '10А', hours: 18, teacherName: 'Петров П.П.' }],
        },
      ],
    });
    const html = buildOfficialReportHtml(report);
    expect(html).toContain('Элективный курс по физике');
    expect(html).toContain('Петров П.П.');
  });

  it('omits electives section when report has no electives', () => {
    const html = buildOfficialReportHtml(makeReport({ electives: [] }));
    expect(html).not.toContain('Элективные курсы 10');
  });

  it('includes compound subject breakdown lines when isCompound=true', () => {
    const report = makeReport();
    report.subjectGroups[0].isCompound = true;
    report.subjectGroups[0].displayName = 'Русский язык, Литература';
    report.subjectGroups[0].subjectBreakdown = [
      { name: 'Русский язык', total: 12, hours5to9: 10, hours10to11: 2 },
      { name: 'Литература', total: 8, hours5to9: 5, hours10to11: 3 },
    ];
    const html = buildOfficialReportHtml(report);
    expect(html).toContain('Русский язык');
    expect(html).toContain('Литература');
  });

  it('includes dept label row when deptLabel is set on a group', () => {
    const report = makeReport();
    report.subjectGroups[0].deptLabel = 'Математики';
    const html = buildOfficialReportHtml(report);
    expect(html).toContain('Математики');
  });
});

// ─── buildWordDocument ────────────────────────────────────────────────────────

describe('buildWordDocument', () => {
  it('produces a Document that packs to a non-empty buffer', async () => {
    const doc = buildWordDocument(makeReport());
    const buffer = await Packer.toBuffer(doc);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it('produces a valid zip-based docx (PK header)', async () => {
    const doc = buildWordDocument(makeReport());
    const buffer = await Packer.toBuffer(doc);
    // .docx files are ZIP archives; ZIP magic number is 0x504B0304
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
  });

  it('handles a report with no subject groups', async () => {
    const doc = buildWordDocument(makeReport({ subjectGroups: [] }));
    const buffer = await Packer.toBuffer(doc);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('handles a report with electives', async () => {
    const report = makeReport({
      electives: [
        {
          name: 'Информатика (электив)',
          totalHours: 34,
          rows: [{ className: '11Б', hours: 34, teacherName: 'Сидоров С.С.' }],
        },
      ],
    });
    const doc = buildWordDocument(report);
    const buffer = await Packer.toBuffer(doc);
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it('handles compound subject groups', async () => {
    const report = makeReport();
    report.subjectGroups[0].isCompound = true;
    report.subjectGroups[0].subjectBreakdown = [
      { name: 'Алгебра', total: 10, hours5to9: 8, hours10to11: 2 },
    ];
    const doc = buildWordDocument(report);
    const buffer = await Packer.toBuffer(doc);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
