/**
 * Tests for partner availability logic functions
 */

import { describe, it, expect } from 'vitest';
import {
  generatePartnerAvailability,
  parsePartnerFile,
  computeMatchedTeachers,
  buildPartnerBusySet,
} from './partner';
import type { Schedule } from '@/types';
import type { PartnerAvailabilityFile } from '@/types/partner';

// Test schedule with two teachers across multiple classes
function createTestSchedule(): Schedule {
  return {
    '10а': {
      'Пн': {
        1: { lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Математика', teacher: 'Иванова Т.С.', room: '201' }] },
        2: { lessons: [{ id: 'l2', requirementId: 'r2', subject: 'Физика', teacher: 'Петрова А.П.', teacher2: 'Сидорова Е.В.', room: '301' }] },
      },
      'Вт': {
        3: { lessons: [{ id: 'l3', requirementId: 'r3', subject: 'Алгебра', teacher: 'Иванова Т.С.', room: '201' }] },
      },
    },
    '10б': {
      'Пн': {
        2: { lessons: [{ id: 'l4', requirementId: 'r4', subject: 'Химия', teacher: 'Козлова М.И.', room: '105' }] },
      },
      'Ср': {
        1: { lessons: [{ id: 'l5', requirementId: 'r5', subject: 'Биология', teacher: 'Петрова А.П.', room: '301' }] },
      },
    },
  };
}

describe('generatePartnerAvailability', () => {
  it('collects slots for teacher in multiple slots', () => {
    const schedule = createTestSchedule();
    const result = generatePartnerAvailability(schedule, { name: 'Тест', type: 'template' });

    expect(result.formatVersion).toBe('1');
    expect(result.versionName).toBe('Тест');
    expect(result.versionType).toBe('template');

    // Иванова: Пн/1, Вт/3
    expect(result.slots['Иванова Т.С.']).toHaveLength(2);
    expect(result.slots['Иванова Т.С.']).toContainEqual({ day: 'Пн', lesson: 1 });
    expect(result.slots['Иванова Т.С.']).toContainEqual({ day: 'Вт', lesson: 3 });
  });

  it('captures teacher2 slots', () => {
    const schedule = createTestSchedule();
    const result = generatePartnerAvailability(schedule, { name: 'Тест', type: 'template' });

    // Сидорова is teacher2 on Пн/2
    expect(result.slots['Сидорова Е.В.']).toBeDefined();
    expect(result.slots['Сидорова Е.В.']).toContainEqual({ day: 'Пн', lesson: 2 });
  });

  it('deduplicates same teacher+slot across multiple classes', () => {
    // Петрова is at Пн/2 in 10а and Пн/2 in another class — wait, in fixture: Петрова is at 10а/Пн/2 and 10б/Ср/1
    // Let's create a schedule where same teacher appears in 2 classes at same slot (conflict, but should deduplicate)
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Математика', teacher: 'Иванова Т.С.', room: '201' }] },
        },
      },
      '10б': {
        'Пн': {
          1: { lessons: [{ id: 'l2', requirementId: 'r2', subject: 'Алгебра', teacher: 'Иванова Т.С.', room: '202' }] },
        },
      },
    };
    const result = generatePartnerAvailability(schedule, { name: 'Тест', type: 'template' });
    // Slot Пн/1 should appear only once even though teacher in 2 classes at that time
    const ivanovaSlots = result.slots['Иванова Т.С.'];
    const pn1Count = ivanovaSlots.filter(s => s.day === 'Пн' && s.lesson === 1).length;
    expect(pn1Count).toBe(1);
  });

  it('returns empty slots for empty schedule', () => {
    const result = generatePartnerAvailability({}, { name: 'Пусто', type: 'technical' });
    expect(result.slots).toEqual({});
  });

  it('sets mondayDate for weekly versions', () => {
    const mondayDate = new Date('2026-03-03');
    const result = generatePartnerAvailability({}, { name: 'Неделя', type: 'weekly', mondayDate });
    expect(result.mondayDate).toBe('2026-03-03');
  });

  it('omits mondayDate when not provided', () => {
    const result = generatePartnerAvailability({}, { name: 'Шаблон', type: 'template' });
    expect(result.mondayDate).toBeUndefined();
  });

  it('excludes partner class lessons when excludeClasses option is set', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Физика', teacher: 'Петрова А.П.', room: '101' }] },
        },
      },
      '9п': { // partner class
        'Пн': {
          1: { lessons: [{ id: 'l2', requirementId: 'r2', subject: 'Химия', teacher: 'Козлова М.И.', room: '102' }] },
        },
      },
    };
    const result = generatePartnerAvailability(
      schedule,
      { name: 'Тест', type: 'template' },
      { excludeClasses: new Set(['9п']) }
    );
    expect(result.slots['Петрова А.П.']).toBeDefined();
    expect(result.slots['Козлова М.И.']).toBeUndefined();
  });
});

describe('parsePartnerFile', () => {
  const validFile: PartnerAvailabilityFile = {
    formatVersion: '1',
    exportedAt: new Date().toISOString(),
    versionType: 'template',
    versionName: 'Тест',
    slots: { 'Иванова Т.С.': [{ day: 'Пн', lesson: 1 }] },
  };

  it('parses valid JSON', () => {
    const result = parsePartnerFile(JSON.stringify(validFile));
    expect(result.formatVersion).toBe('1');
    expect(result.versionName).toBe('Тест');
  });

  it('throws on invalid JSON', () => {
    expect(() => parsePartnerFile('not json')).toThrow('корректным JSON');
  });

  it('throws when formatVersion is missing', () => {
    const bad = { ...validFile };
    delete (bad as Record<string, unknown>).formatVersion;
    expect(() => parsePartnerFile(JSON.stringify(bad))).toThrow('отсутствует formatVersion');
  });

  it('throws when formatVersion is unknown', () => {
    const bad = { ...validFile, formatVersion: '2' };
    expect(() => parsePartnerFile(JSON.stringify(bad))).toThrow('Неподдерживаемая версия формата');
  });

  it('throws when slots is missing', () => {
    const bad = { ...validFile };
    delete (bad as Record<string, unknown>).slots;
    expect(() => parsePartnerFile(JSON.stringify(bad))).toThrow('slots');
  });
});

describe('computeMatchedTeachers', () => {
  it('returns intersection of partner and our teachers', () => {
    const partnerSlots = { 'Иванова Т.С.': [], 'Козлова М.И.': [] };
    const ours = ['Иванова Т.С.', 'Петрова А.П.'];
    const result = computeMatchedTeachers(partnerSlots, ours);
    expect(result.size).toBe(1);
    expect(result.has('Иванова Т.С.')).toBe(true);
    expect(result.has('Петрова А.П.')).toBe(false);
  });

  it('returns empty set when partner slots is empty', () => {
    const result = computeMatchedTeachers({}, ['Иванова Т.С.']);
    expect(result.size).toBe(0);
  });

  it('returns empty set when no overlap', () => {
    const result = computeMatchedTeachers({ 'Козлова М.И.': [] }, ['Иванова Т.С.']);
    expect(result.size).toBe(0);
  });
});

describe('buildPartnerBusySet', () => {
  const file: PartnerAvailabilityFile = {
    formatVersion: '1',
    exportedAt: '',
    versionType: 'template',
    versionName: 'Тест',
    slots: {
      'Иванова Т.С.': [
        { day: 'Ср', lesson: 3 },
        { day: 'Пт', lesson: 5 },
      ],
      'Козлова М.И.': [
        { day: 'Пн', lesson: 1 },
      ],
    },
  };

  it('builds correct key format "teacherName|day|lesson"', () => {
    const matched = new Set(['Иванова Т.С.']);
    const result = buildPartnerBusySet(file, matched);
    expect(result.has('Иванова Т.С.|Ср|3')).toBe(true);
    expect(result.has('Иванова Т.С.|Пт|5')).toBe(true);
  });

  it('excludes non-matched teachers', () => {
    const matched = new Set(['Иванова Т.С.']);
    const result = buildPartnerBusySet(file, matched);
    expect(result.has('Козлова М.И.|Пн|1')).toBe(false);
  });

  it('includes all matched teachers', () => {
    const matched = new Set(['Иванова Т.С.', 'Козлова М.И.']);
    const result = buildPartnerBusySet(file, matched);
    expect(result.has('Козлова М.И.|Пн|1')).toBe(true);
    expect(result.size).toBe(3);
  });

  it('returns empty set when matchedTeachers is empty', () => {
    const result = buildPartnerBusySet(file, new Set());
    expect(result.size).toBe(0);
  });
});
