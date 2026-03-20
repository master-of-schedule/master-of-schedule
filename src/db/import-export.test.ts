/**
 * Tests for import/export functionality
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelWorkbook, parseExportData, getExportSummary, CURRENT_SCHEMA_VERSION, type ExportData } from './import-export';

// Helper to create a minimal valid export data object
function createExportData(overrides: Partial<ExportData> = {}): ExportData {
  return {
    version: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    teachers: [],
    rooms: [],
    classes: [],
    groups: [],
    lessonRequirements: [],
    scheduleVersions: [],
    ...overrides,
  };
}

// Helper to create a workbook from data
function createWorkbook(sheets: Record<string, unknown[][]>): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  for (const [sheetName, data] of Object.entries(sheets)) {
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }

  return workbook;
}

describe('parseExcelWorkbook', () => {
  it('should parse teachers sheet with new format', () => {
    const workbook = createWorkbook({
      'Учителя': [
        ['Фамилия И.О.', 'Запреты', 'Предметы', 'Телефон'],
        ['Иванова Т.С.', 'Вт: 1-8', 'Русский, Литература', '+7-999-111-22-33'],
        ['Петрова А.П.', 'Ср: 1, Пт:1', '', ''],
        ['Швецова Е.П.', '', 'Физика', ''],
      ],
    });

    const result = parseExcelWorkbook(workbook);

    expect(result.teachers).toHaveLength(3);

    expect(result.teachers[0].name).toBe('Иванова Т.С.');
    expect(result.teachers[0].bans).toEqual({ 'Вт': [1, 2, 3, 4, 5, 6, 7, 8] });
    expect(result.teachers[0].subjects).toEqual(['Русский', 'Литература']);
    expect(result.teachers[0].phone).toBe('+7-999-111-22-33');

    expect(result.teachers[1].name).toBe('Петрова А.П.');
    expect(result.teachers[1].bans).toEqual({ 'Ср': [1], 'Пт': [1] });
    expect(result.teachers[1].subjects).toEqual([]);

    expect(result.teachers[2].name).toBe('Швецова Е.П.');
    expect(result.teachers[2].bans).toEqual({});
    expect(result.teachers[2].subjects).toEqual(['Физика']);
    expect(result.teachers[2].phone).toBeUndefined();
  });

  it('should parse rooms sheet', () => {
    const workbook = createWorkbook({
      'Кабинеты': [
        ['Имя для составителя', 'Для расписания', 'Вместимость (детей)', 'Несколько классов (Число)'],
        ['101 Мастерская', '-101-', 15, null],
        ['Спортзал', '-СЗ-', 60, 2],
      ],
    });

    const result = parseExcelWorkbook(workbook);

    expect(result.rooms).toHaveLength(2);

    expect(result.rooms[0].fullName).toBe('101 Мастерская');
    expect(result.rooms[0].shortName).toBe('-101-');
    expect(result.rooms[0].capacity).toBe(15);
    expect(result.rooms[0].multiClass).toBeUndefined();

    expect(result.rooms[1].fullName).toBe('Спортзал');
    expect(result.rooms[1].shortName).toBe('-СЗ-');
    expect(result.rooms[1].capacity).toBe(60);
    expect(result.rooms[1].multiClass).toBe(2);
  });

  it('should parse classes sheet', () => {
    const workbook = createWorkbook({
      'Классы': [
        ['Класс', 'Число детей'],
        ['5а', 28],
        ['5б', 26],
      ],
    });

    const result = parseExcelWorkbook(workbook);

    expect(result.classes).toHaveLength(2);
    expect(result.classes[0].name).toBe('5а');
    expect(result.classes[0].studentCount).toBe(28);
    expect(result.classes[1].name).toBe('5б');
    expect(result.classes[1].studentCount).toBe(26);
  });

  it('should parse class lessons sheet', () => {
    const workbook = createWorkbook({
      'Классные занятия': [
        ['Класс', 'Предмет', 'Учитель', 'Занятий в неделю'],
        ['5а', 'Математика', 'Иванова М.А.', 5],
        ['5а', 'Русский язык', 'Петров С.В.', 4],
      ],
    });

    const result = parseExcelWorkbook(workbook);

    expect(result.lessonRequirements).toHaveLength(2);

    expect(result.lessonRequirements[0].type).toBe('class');
    expect(result.lessonRequirements[0].classOrGroup).toBe('5а');
    expect(result.lessonRequirements[0].subject).toBe('Математика');
    expect(result.lessonRequirements[0].teacher).toBe('Иванова М.А.');
    expect(result.lessonRequirements[0].countPerWeek).toBe(5);
  });

  it('should parse group lessons sheet', () => {
    const workbook = createWorkbook({
      'Групповые занятия': [
        ['Группа', 'Предмет', 'Учитель', 'Занятий в неделю', 'Параллельная группа', 'Класс'],
        ['5а (д)', 'Труд', 'Полуэктова И.И.', 2, '5а (м)', '5а'],
        ['5а (м)', 'Труд', 'Лактионов П.П.', 2, '5а (д)', '5а'],
      ],
    });

    const result = parseExcelWorkbook(workbook);

    // Should create groups
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].name).toBe('5а (д)');
    expect(result.groups[0].className).toBe('5а');
    expect(result.groups[0].parallelGroup).toBe('5а (м)');

    // Should create lesson requirements
    expect(result.lessonRequirements).toHaveLength(2);
    expect(result.lessonRequirements[0].type).toBe('group');
    expect(result.lessonRequirements[0].classOrGroup).toBe('5а (д)');
    expect(result.lessonRequirements[0].parallelGroup).toBe('5а (м)');
    expect(result.lessonRequirements[0].className).toBe('5а');
  });

  it('should parse complete file with all sheets', () => {
    const workbook = createWorkbook({
      'Учителя': [
        ['Фамилия И.О.', 'Запреты', 'Предметы', 'Телефон'],
        ['Иванова М.А.', '', 'Математика', ''],
        ['Петров С.В.', 'Вт: 1-3', 'Русский язык, Литература', ''],
      ],
      'Кабинеты': [
        ['Имя для составителя', 'Для расписания', 'Вместимость (детей)', 'Несколько классов (Число)'],
        ['401 Математика', '-401-', 30, null],
      ],
      'Классы': [
        ['Класс', 'Число детей'],
        ['5а', 28],
      ],
      'Классные занятия': [
        ['Класс', 'Предмет', 'Учитель', 'Занятий в неделю'],
        ['5а', 'Математика', 'Иванова М.А.', 5],
      ],
      'Групповые занятия': [
        ['Группа', 'Предмет', 'Учитель', 'Занятий в неделю', 'Параллельная группа', 'Класс'],
        ['5а (д)', 'Труд', 'Полуэктова И.И.', 2, '5а (м)', '5а'],
      ],
    });

    const result = parseExcelWorkbook(workbook);

    expect(result.teachers).toHaveLength(2);
    expect(result.rooms).toHaveLength(1);
    expect(result.classes).toHaveLength(1);
    expect(result.groups).toHaveLength(1);
    expect(result.lessonRequirements).toHaveLength(2); // 1 class + 1 group
  });

  it('should skip rows with missing required fields', () => {
    const workbook = createWorkbook({
      'Учителя': [
        ['Фамилия И.О.', 'Запреты', 'Предметы', 'Телефон'],
        ['Иванова М.А.', '', 'Математика', ''],
        ['', '', '', ''], // Empty row - should be skipped
        ['Петров С.В.', '', '', ''],
      ],
      'Классные занятия': [
        ['Класс', 'Предмет', 'Учитель', 'Занятий в неделю'],
        ['5а', 'Математика', 'Иванова М.А.', 5],
        ['', 'Физика', 'Петров', 3], // Missing class - should be skipped
        ['5б', '', 'Иванов', 2], // Missing subject - should be skipped
        ['5в', 'История', '', 4], // Missing teacher - should be skipped
        ['5г', 'Химия', 'Сидоров', 0], // Zero count - should be skipped
      ],
    });

    const result = parseExcelWorkbook(workbook);

    expect(result.teachers).toHaveLength(2); // Empty name row skipped
    expect(result.lessonRequirements).toHaveLength(1); // Only valid row
  });

  it('should handle empty workbook', () => {
    const workbook = createWorkbook({});

    const result = parseExcelWorkbook(workbook);

    expect(result.teachers).toHaveLength(0);
    expect(result.rooms).toHaveLength(0);
    expect(result.classes).toHaveLength(0);
    expect(result.groups).toHaveLength(0);
    expect(result.lessonRequirements).toHaveLength(0);
  });

  it('should auto-add classes referenced by group lessons but missing from Классы sheet', () => {
    const workbook = createWorkbook({
      'Классы': [
        ['Класс', 'Число детей'],
        ['5а', 28],
      ],
      'Групповые занятия': [
        ['Группа', 'Предмет', 'Учитель', 'Занятий в неделю', 'Параллельная группа', 'Класс'],
        ['5а (д)', 'Труд', 'Иванова И.И.', 2, '', '5а'],
        ['3в (1)', 'Англ. яз.', 'Петрова А.А.', 3, '', '3в'],
        ['3в (2)', 'Англ. яз.', 'Сидорова С.С.', 3, '', '3в'],
      ],
    });

    const result = parseExcelWorkbook(workbook);

    // 5а exists in Классы sheet, 3в does not - should be auto-added
    expect(result.classes).toHaveLength(2);
    expect(result.classes.map(c => c.name)).toContain('5а');
    expect(result.classes.map(c => c.name)).toContain('3в');
  });

  it('should handle sheets with only headers', () => {
    const workbook = createWorkbook({
      'Учителя': [
        ['Фамилия И.О.', 'Запреты', 'Предметы', 'Телефон'],
      ],
      'Классы': [
        ['Класс', 'Число детей'],
      ],
    });

    const result = parseExcelWorkbook(workbook);

    expect(result.teachers).toHaveLength(0);
    expect(result.classes).toHaveLength(0);
  });

  it('auto-generates teachers from lesson list when Учителя sheet is absent — Z32-2', () => {
    const workbook = createWorkbook({
      'Список занятий': [
        ['Класс', 'Предмет', 'Учитель', 'Занятий в неделю'],
        ['5а', 'Математика', 'Иванова И.И.', 4],
        ['5а', 'Русский', 'Петрова А.А.', 3],
        ['5б', 'Математика', 'Иванова И.И.', 4], // same teacher, same subject — no dups
        ['5б', 'История', 'Петрова А.А.', 2],    // same teacher, new subject
      ],
    });

    const result = parseExcelWorkbook(workbook);

    expect(result.teachers).toHaveLength(2);

    const ivanova = result.teachers.find(t => t.name === 'Иванова И.И.');
    expect(ivanova).toBeDefined();
    expect(ivanova!.subjects).toEqual(['Математика']);
    expect(ivanova!.bans).toEqual({});

    const petrova = result.teachers.find(t => t.name === 'Петрова А.А.');
    expect(petrova).toBeDefined();
    expect(petrova!.subjects).toContain('Русский');
    expect(petrova!.subjects).toContain('История');
    expect(petrova!.bans).toEqual({});
  });

  it('does NOT auto-generate teachers when Учителя sheet has data — Z32-2', () => {
    const workbook = createWorkbook({
      'Учителя': [
        ['Фамилия И.О.', 'Запреты', 'Предметы'],
        ['Сидорова С.С.', '', 'Физика'],
      ],
      'Список занятий': [
        ['Класс', 'Предмет', 'Учитель', 'Занятий в неделю'],
        ['5а', 'Математика', 'Иванова И.И.', 4],
      ],
    });

    const result = parseExcelWorkbook(workbook);

    // Only the explicitly listed teacher; auto-generation skipped
    expect(result.teachers).toHaveLength(1);
    expect(result.teachers[0].name).toBe('Сидорова С.С.');
  });
});

describe('parseExportData', () => {
  it('should parse valid export data', () => {
    const data = createExportData({
      teachers: [{ id: '1', name: 'Иванова Т.С.', bans: {}, subjects: [] }],
    });
    const json = JSON.stringify(data);

    const result = parseExportData(json);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.teachers).toHaveLength(1);
  });

  it('should throw on invalid JSON', () => {
    expect(() => parseExportData('not json')).toThrow('повреждён');
  });

  it('should throw on missing version field', () => {
    const json = JSON.stringify({ teachers: [] });
    expect(() => parseExportData(json)).toThrow('отсутствует версия');
  });

  it('should throw on newer version', () => {
    const data = createExportData({ version: '99.0' });
    const json = JSON.stringify(data);
    expect(() => parseExportData(json)).toThrow('более новой версии');
  });

  it('should throw on unknown old version with no migration', () => {
    const data = createExportData({ version: '1.0' });
    const json = JSON.stringify(data);
    expect(() => parseExportData(json)).toThrow('Не удалось обновить');
  });

  it('should accept current version', () => {
    const data = createExportData();
    const json = JSON.stringify(data);
    const result = parseExportData(json);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('should migrate 3.0 data through all versions to current', () => {
    const data = {
      version: '3.0',
      exportedAt: new Date().toISOString(),
      teachers: [],
      rooms: [],
      classes: [],
      groups: [],
      lessonRequirements: [],
      scheduleVersions: [
        { id: '1', name: 'v1', type: 'technical', createdAt: new Date(), schedule: {}, substitutions: [] },
      ],
    };
    const json = JSON.stringify(data);

    const result = parseExportData(json);
    expect(result.version).toBe('3.8');
    expect(result.scheduleVersions[0].temporaryLessons).toEqual([]);
  });

  it('should migrate 3.6 data to current version', () => {
    const data = {
      version: '3.6',
      exportedAt: new Date().toISOString(),
      teachers: [],
      rooms: [],
      classes: [],
      groups: [],
      lessonRequirements: [],
      scheduleVersions: [],
    };
    const json = JSON.stringify(data);

    const result = parseExportData(json);
    expect(result.version).toBe('3.8');
  });

  it('should preserve gapExcludedClasses through 3.7→3.8 migration', () => {
    const data = {
      version: '3.7',
      exportedAt: new Date().toISOString(),
      teachers: [],
      rooms: [],
      classes: [],
      groups: [],
      lessonRequirements: [],
      scheduleVersions: [],
      settings: { gapExcludedClasses: ['1а', '1б'] },
    };
    const json = JSON.stringify(data);

    const result = parseExportData(json);
    expect(result.version).toBe('3.8');
    expect(result.settings?.gapExcludedClasses).toEqual(['1а', '1б']);
  });

  it('should migrate 3.7 data with acknowledgedConflictKeys absent → undefined', () => {
    const data = {
      version: '3.7',
      exportedAt: new Date().toISOString(),
      teachers: [],
      rooms: [],
      classes: [],
      groups: [],
      lessonRequirements: [],
      scheduleVersions: [
        { id: '1', name: 'v1', type: 'technical', createdAt: new Date(), schedule: {}, substitutions: [] },
      ],
    };
    const json = JSON.stringify(data);

    const result = parseExportData(json);
    expect(result.version).toBe('3.8');
    // acknowledgedConflictKeys is optional — absent in old data is fine
    expect(result.scheduleVersions[0].acknowledgedConflictKeys).toBeUndefined();
  });
});

describe('getExportSummary', () => {
  it('should return correct counts', () => {
    const data = createExportData({
      teachers: [
        { id: '1', name: 'A', bans: {}, subjects: [] },
        { id: '2', name: 'B', bans: {}, subjects: [] },
      ],
      rooms: [{ id: '1', fullName: 'R1', shortName: '-R1-' }],
      classes: [{ id: '1', name: '5а' }],
      groups: [],
      lessonRequirements: [
        { id: '1', type: 'class', classOrGroup: '5а', subject: 'Математика', teacher: 'A', countPerWeek: 3 },
      ],
      scheduleVersions: [
        { id: '1', name: 'v1', type: 'technical', createdAt: new Date(), schedule: {}, substitutions: [] },
      ] as ExportData['scheduleVersions'],
    });

    const summary = getExportSummary(data);
    expect(summary.teacherCount).toBe(2);
    expect(summary.roomCount).toBe(1);
    expect(summary.classCount).toBe(1);
    expect(summary.groupCount).toBe(0);
    expect(summary.requirementCount).toBe(1);
    expect(summary.versionCount).toBe(1);
  });

  it('should handle empty data', () => {
    const data = createExportData();
    const summary = getExportSummary(data);
    expect(summary.teacherCount).toBe(0);
    expect(summary.roomCount).toBe(0);
    expect(summary.versionCount).toBe(0);
  });
});

// ─── DI-1: Import deduplication ───────────────────────────────────────────────

describe('parseExcelWorkbook — deduplication (DI-1)', () => {
  it('skips duplicate teacher names — keeps first occurrence', () => {
    const workbook = createWorkbook({
      'Учителя': [
        ['Фамилия И.О.', 'Запреты', 'Предметы'],
        ['Иванова Т.С.', '', 'Математика'],
        ['Петрова А.П.', '', 'История'],
        ['Иванова Т.С.', 'Пн: 1-8', 'Физика'], // duplicate — should be skipped
      ],
    });

    const result = parseExcelWorkbook(workbook);

    expect(result.teachers).toHaveLength(2);
    expect(result.teachers.map(t => t.name)).toEqual(['Иванова Т.С.', 'Петрова А.П.']);
    // First occurrence wins — subjects from row 1
    expect(result.teachers[0].subjects).toEqual(['Математика']);
    // The third row's bans should NOT appear
    expect(result.teachers[0].bans).toEqual({});
  });

  it('skips duplicate room shortNames — keeps first occurrence', () => {
    const workbook = createWorkbook({
      'Кабинеты': [
        ['Имя для составителя', 'Для расписания', 'Вместимость (детей)'],
        ['114 Математика', '-114-', 30],
        ['Спортзал', '-СЗ-', 60],
        ['114 Физика', '-114-', 25], // duplicate shortName — should be skipped
      ],
    });

    const result = parseExcelWorkbook(workbook);

    expect(result.rooms).toHaveLength(2);
    expect(result.rooms.map(r => r.shortName)).toEqual(['-114-', '-СЗ-']);
    expect(result.rooms[0].fullName).toBe('114 Математика'); // first wins
    expect(result.rooms[0].capacity).toBe(30);
  });

  it('skips duplicate class names — keeps first occurrence', () => {
    const workbook = createWorkbook({
      'Классы': [
        ['Класс', 'Число детей'],
        ['10а', 28],
        ['10б', 26],
        ['10а', 30], // duplicate — should be skipped
      ],
    });

    const result = parseExcelWorkbook(workbook);

    expect(result.classes).toHaveLength(2);
    expect(result.classes.map(c => c.name)).toEqual(['10а', '10б']);
    expect(result.classes[0].studentCount).toBe(28); // first wins
  });

  it('handles all unique entries without skipping any', () => {
    const workbook = createWorkbook({
      'Учителя': [
        ['Фамилия И.О.'],
        ['Иванова Т.С.'],
        ['Петрова А.П.'],
        ['Козлов И.И.'],
      ],
    });

    const result = parseExcelWorkbook(workbook);
    expect(result.teachers).toHaveLength(3);
  });
});
