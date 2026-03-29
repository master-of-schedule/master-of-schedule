/**
 * Tests for export-image-data.ts — pure data builder helpers
 * (Previously private; now exported for direct testing)
 */

import { describe, it, expect } from 'vitest';
import { isSlotChangedForExport, formatCellLessons, getTeacherChangesOnDay, getTeacherImageData, getChangedClassesData, getAbsentTeachersData, getReplacementEntries } from './export-image-data';
import type { ScheduledLesson, Schedule, Teacher } from '@/types';

// ─── Fixtures ─────────────────────────────────────────────────

const createLesson = (overrides: Partial<ScheduledLesson> = {}): ScheduledLesson => ({
  id: 'l-1',
  requirementId: 'r-1',
  subject: 'Математика',
  teacher: 'Иванова Т.С.',
  room: '-114-',
  ...overrides,
});

// ─── isSlotChangedForExport ────────────────────────────────────

describe('isSlotChangedForExport', () => {
  it('returns false when current and template are identical', () => {
    const lesson = createLesson();
    expect(isSlotChangedForExport([lesson], [lesson])).toBe(false);
  });

  it('returns true when subject differs', () => {
    const template = [createLesson({ subject: 'Физика' })];
    const current = [createLesson({ subject: 'Химия' })];
    expect(isSlotChangedForExport(current, template)).toBe(true);
  });

  it('returns true when teacher differs', () => {
    const template = [createLesson({ teacher: 'Иванова Т.С.' })];
    const current = [createLesson({ teacher: 'Петрова А.П.' })];
    expect(isSlotChangedForExport(current, template)).toBe(true);
  });

  it('returns true when room-only change (same teacher + subject, different room)', () => {
    const template = [createLesson({ room: '-114-' })];
    const current = [createLesson({ room: '-201-' })];
    expect(isSlotChangedForExport(current, template)).toBe(true);
  });

  it('returns true when current is empty but template has lessons (removed lesson)', () => {
    expect(isSlotChangedForExport([], [createLesson()])).toBe(true);
  });

  it('returns true when current has lesson but template is empty (added lesson)', () => {
    expect(isSlotChangedForExport([createLesson()], [])).toBe(true);
  });

  it('returns false when both are empty', () => {
    expect(isSlotChangedForExport([], [])).toBe(false);
  });
});

// ─── formatCellLessons ────────────────────────────────────────

describe('formatCellLessons', () => {
  it('returns empty string for empty array', () => {
    expect(formatCellLessons([])).toBe('');
  });

  it('formats single lesson: subject teacher room', () => {
    const lesson = createLesson({ subject: 'Физика', teacher: 'Петрова А.П.', room: '-201-' });
    expect(formatCellLessons([lesson])).toBe('Физика Петрова А.П. -201-');
  });

  it('includes group index when lesson has group', () => {
    const lesson = createLesson({ subject: 'Английский', teacher: 'Лихачева В.Е.', group: '10а(д)' });
    expect(formatCellLessons([lesson])).toContain('(д)');
  });

  it('formats teacher2 as "teacher / teacher2"', () => {
    const lesson = createLesson({
      subject: 'Физкультура',
      teacher: 'Козлов И.И.',
      teacher2: 'Смирнов А.Н.',
      room: 'зал',
    });
    expect(formatCellLessons([lesson])).toBe('Физкультура Козлов И.И. / Смирнов А.Н. -зал-');
  });

  it('joins multiple lessons with newline', () => {
    const lesson1 = createLesson({ id: 'l-1', subject: 'Физика', teacher: 'Петрова А.П.', group: '10а(д)' });
    const lesson2 = createLesson({ id: 'l-2', subject: 'Английский', teacher: 'Лихачева В.Е.', group: '10а(а)' });
    const result = formatCellLessons([lesson1, lesson2]);
    expect(result).toContain('\n');
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
  });
});

// ─── getTeacherChangesOnDay — cancelled lesson detection ───────

describe('getTeacherChangesOnDay — isCancelled', () => {
  const makeLesson = (overrides: Partial<ScheduledLesson> = {}): ScheduledLesson => ({
    id: 'l-1', requirementId: 'r-1',
    subject: 'Математика', teacher: 'Иванова Т.С.', room: '-114-',
    ...overrides,
  });

  const makeSchedule = (className: string, day: string, lessonNum: number, lessons: ScheduledLesson[]): Schedule => ({
    [className]: { [day]: { [lessonNum]: { lessons } } },
  } as unknown as Schedule);

  it('marks isCancelled=true when lesson is removed from weekly schedule', () => {
    const template = makeSchedule('5а', 'Пн', 1, [makeLesson()]);
    const weekly: Schedule = {}; // lesson removed entirely

    const result = getTeacherChangesOnDay(weekly, template, {}, ['Иванова Т.С.'], 'Пн' as never);

    expect(result).toHaveLength(1);
    expect(result[0].teacher).toBe('Иванова Т.С.');
    expect(result[0].changes[0].isCancelled).toBe(true);
    expect(result[0].changes[0].subject).toBe('Математика');
    expect(result[0].changes[0].lessonNum).toBe(1);
  });

  it('marks isCancelled=true when slot replaced by different teacher', () => {
    const template = makeSchedule('5а', 'Пн', 1, [makeLesson({ teacher: 'Иванова Т.С.' })]);
    const weekly = makeSchedule('5а', 'Пн', 1, [makeLesson({ teacher: 'Петрова А.П.' })]);

    const result = getTeacherChangesOnDay(weekly, template, {}, ['Иванова Т.С.'], 'Пн' as never);

    expect(result).toHaveLength(1);
    expect(result[0].changes[0].isCancelled).toBe(true);
  });

  it('does NOT mark isCancelled for a room-only change (teacher still has the lesson)', () => {
    const template = makeSchedule('5а', 'Пн', 1, [makeLesson({ room: '-114-' })]);
    const weekly = makeSchedule('5а', 'Пн', 1, [makeLesson({ room: '-201-' })]);
    // teacher map shows Иванова at this slot
    const teacherMap = { 'Иванова Т.С.': { 'Пн': { 1: [{ className: '5а', lesson: makeLesson({ room: '-201-' }) }] } } };

    const result = getTeacherChangesOnDay(weekly, template, teacherMap as never, ['Иванова Т.С.'], 'Пн' as never);

    expect(result).toHaveLength(1);
    expect(result[0].changes[0].isCancelled).toBeUndefined();
  });

  it('returns empty array when teacher has no changes on that day', () => {
    const lesson = makeLesson();
    const template = makeSchedule('5а', 'Пн', 1, [lesson]);
    const weekly = makeSchedule('5а', 'Пн', 1, [lesson]); // identical

    const result = getTeacherChangesOnDay(weekly, template, {}, ['Иванова Т.С.'], 'Пн' as never);

    expect(result).toHaveLength(0);
  });

  it('Z29-3 regression: does NOT flag teacher A when only teacher B (parallel group) changed', () => {
    // Slot has two parallel group lessons: teacher A (unchanged) + teacher B (changed room)
    const lessonA = makeLesson({ id: 'la', teacher: 'Иванова Т.С.', room: '-114-', group: '5а(В.Е.)' });
    const lessonB = makeLesson({ id: 'lb', teacher: 'Петрова А.П.', room: '-201-', group: '5а(Т.В.)' });
    const lessonBChanged = makeLesson({ id: 'lb', teacher: 'Петрова А.П.', room: '-222-', group: '5а(Т.В.)' });

    const template = makeSchedule('5а', 'Пн', 1, [lessonA, lessonB]);
    const weekly = makeSchedule('5а', 'Пн', 1, [lessonA, lessonBChanged]); // only B's room changed

    const teacherMapA = {
      'Иванова Т.С.': { 'Пн': { 1: [{ className: '5а', lesson: lessonA }] } },
    };
    const result = getTeacherChangesOnDay(weekly, template, teacherMapA as never, ['Иванова Т.С.'], 'Пн' as never);

    // Teacher A's lesson did NOT change — must NOT appear in the change list
    expect(result).toHaveLength(0);
  });

  it('Z29-3: DOES flag teacher A when their own parallel group lesson is removed', () => {
    const lessonA = makeLesson({ id: 'la', teacher: 'Иванова Т.С.', room: '-114-', group: '5а(В.Е.)' });
    const lessonB = makeLesson({ id: 'lb', teacher: 'Петрова А.П.', room: '-201-', group: '5а(Т.В.)' });
    // Weekly: only teacher B remains — teacher A's lesson is removed
    const template = makeSchedule('5а', 'Пн', 1, [lessonA, lessonB]);
    const weekly = makeSchedule('5а', 'Пн', 1, [lessonB]);

    const result = getTeacherChangesOnDay(weekly, template, {}, ['Иванова Т.С.'], 'Пн' as never);

    expect(result).toHaveLength(1);
    expect(result[0].teacher).toBe('Иванова Т.С.');
    expect(result[0].changes[0].isCancelled).toBe(true);
  });

  it('Z30-1 regression: does NOT flag teacher A when teacher B (parallel group) is deleted, teacher A unchanged', () => {
    // Template: slot has two parallel group lessons — teacher A and teacher B
    // Weekly: teacher B's lesson is deleted, teacher A's lesson remains unchanged
    // Teacher A must NOT appear in the change list
    const lessonA = makeLesson({ id: 'la', teacher: 'Иванова Т.С.', room: '-114-', group: '5а(В.Е.)' });
    const lessonB = makeLesson({ id: 'lb', teacher: 'Петрова А.П.', room: '-201-', group: '5а(Т.В.)' });

    const template = makeSchedule('5а', 'Пн', 1, [lessonA, lessonB]);
    const weekly = makeSchedule('5а', 'Пн', 1, [lessonA]); // teacher B's lesson deleted

    const teacherMapA = {
      'Иванова Т.С.': { 'Пн': { 1: [{ className: '5а', lesson: lessonA }] } },
    };
    const result = getTeacherChangesOnDay(weekly, template, teacherMapA as never, ['Иванова Т.С.'], 'Пн' as never);

    // Teacher A's lesson is identical in template and weekly — must NOT be flagged
    expect(result).toHaveLength(0);
  });
});

// ─── Z27-1: per-teacher group lesson highlight fix ─────────────

describe('getTeacherImageData — Z27-1 per-teacher comparison', () => {
  it('does not include unaffected group teacher when only one group lesson changed', () => {
    // Slot has two group lessons: teacher A (group д) and teacher B (group м)
    // Only teacher A's lesson changes (room change)
    const teacherA = createLesson({ teacher: 'Иванова Т.С.', group: '10а(д)', room: '-114-' });
    const teacherB = createLesson({ id: 'l-2', teacher: 'Петрова А.П.', group: '10а(м)', room: '-115-' });

    const template: Schedule = { '10а': { 'Пн': { 1: { lessons: [teacherA, teacherB] } } } };
    const weekly: Schedule = {
      '10а': { 'Пн': { 1: { lessons: [
        { ...teacherA, room: '-201-' }, // teacher A changed room
        teacherB, // teacher B unchanged
      ] } } }
    };

    const result = getTeacherImageData(weekly, template, {}, 'Пн' as never, []);

    const teacherNames = result.changes.map(c => c.teacher);
    expect(teacherNames).toContain('Иванова Т.С.');
    expect(teacherNames).not.toContain('Петрова А.П.');
  });

  it('includes both teachers when both group lessons change', () => {
    const teacherA = createLesson({ teacher: 'Иванова Т.С.', group: '10а(д)', room: '-114-' });
    const teacherB = createLesson({ id: 'l-2', teacher: 'Петрова А.П.', group: '10а(м)', room: '-115-' });

    const template: Schedule = { '10а': { 'Пн': { 1: { lessons: [teacherA, teacherB] } } } };
    const weekly: Schedule = {
      '10а': { 'Пн': { 1: { lessons: [
        { ...teacherA, room: '-201-' },
        { ...teacherB, room: '-202-' },
      ] } } }
    };

    const result = getTeacherImageData(weekly, template, {}, 'Пн' as never, []);

    const teacherNames = result.changes.map(c => c.teacher);
    expect(teacherNames).toContain('Иванова Т.С.');
    expect(teacherNames).toContain('Петрова А.П.');
  });

  it('Z30-1 regression: does NOT flag teacher A when teacher B (parallel group) is deleted, teacher A unchanged', () => {
    // Template: two parallel group lessons in same slot
    // Weekly: teacher B's lesson deleted, teacher A's lesson unchanged
    // Teacher A must NOT appear in image data changes
    const teacherA = createLesson({ teacher: 'Иванова Т.С.', group: '10а(д)', room: '-114-' });
    const teacherB = createLesson({ id: 'l-2', teacher: 'Петрова А.П.', group: '10а(м)', room: '-115-' });

    const template: Schedule = { '10а': { 'Пн': { 1: { lessons: [teacherA, teacherB] } } } };
    const weekly: Schedule = {
      '10а': { 'Пн': { 1: { lessons: [teacherA] } } } // teacher B deleted
    };

    const result = getTeacherImageData(weekly, template, {}, 'Пн' as never, []);

    const teacherNames = result.changes.map(c => c.teacher);
    // Teacher B was deleted — flagged as changed (their lesson is gone)
    expect(teacherNames).toContain('Петрова А.П.');
    // Teacher A's lesson is identical — must NOT be flagged
    expect(teacherNames).not.toContain('Иванова Т.С.');
  });
});

// ─── Z27-2c: getReplacementEntries ────────────────────────────

describe('getReplacementEntries', () => {
  it('returns entries for lessons with originalTeacher set', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [{
            id: 'l1', requirementId: 'r1', subject: 'Математика',
            teacher: 'Петрова А.П.', room: '-114-',
            originalTeacher: 'Иванова Т.С.',
          }] },
          2: { lessons: [createLesson({ id: 'l2' })] }, // no originalTeacher
        },
      },
      '10б': {
        'Пн': {
          3: { lessons: [{
            id: 'l3', requirementId: 'r3', subject: 'Физика',
            teacher: 'Сидорова Е.В.', room: '-115-',
            originalTeacher: 'Неизвестный А.Б.',
          }] },
        },
      },
    };

    const entries = getReplacementEntries(schedule, 'Пн' as never);
    expect(entries).toHaveLength(2);
    expect(entries[0].className).toBe('10а');
    expect(entries[0].originalTeacher).toBe('Иванова Т.С.');
    expect(entries[0].replacementTeacher).toBe('Петрова А.П.');
    expect(entries[1].className).toBe('10б');
  });

  it('returns empty array when no substitutions exist', () => {
    const schedule: Schedule = {
      '10а': { 'Пн': { 1: { lessons: [createLesson()] } } },
    };
    const entries = getReplacementEntries(schedule, 'Пн' as never);
    expect(entries).toHaveLength(0);
  });

  it('sorts by className then lessonNum', () => {
    const schedule: Schedule = {
      '10б': { 'Пн': { 2: { lessons: [{ id: 'l2', requirementId: 'r2', subject: 'Физика', teacher: 'Б', room: '-2-', originalTeacher: 'Х' }] } } },
      '10а': { 'Пн': { 1: { lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Математика', teacher: 'А', room: '-1-', originalTeacher: 'У' }] } } },
    };
    const entries = getReplacementEntries(schedule, 'Пн' as never);
    expect(entries[0].className).toBe('10а');
    expect(entries[1].className).toBe('10б');
  });

  it('propagates isUnionSubstitution flag from lesson', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Математика', teacher: 'Петрова', room: '-114-', originalTeacher: 'Иванова', isUnionSubstitution: true }] },
          2: { lessons: [{ id: 'l2', requirementId: 'r2', subject: 'Физика', teacher: 'Сидоров', room: '-115-', originalTeacher: 'Козлов' }] },
        },
      },
    };
    const entries = getReplacementEntries(schedule, 'Пн' as never);
    expect(entries).toHaveLength(2);
    expect(entries[0].isUnionSubstitution).toBe(true);
    expect(entries[1].isUnionSubstitution).toBeUndefined();
  });
});

// ─── QI-13: getChangedClassesData — class view high-risk ───────

describe('getChangedClassesData', () => {
  const lesson = createLesson({ subject: 'Математика', teacher: 'Иванова Т.С.', room: '-114-' });

  it('returns empty columns when no template is loaded (empty template)', () => {
    const schedule: Schedule = { '10а': { 'Пн': { 1: { lessons: [lesson] } } } };
    const result = getChangedClassesData(schedule, {}, ['10а'], 'Пн' as never);
    // lesson added vs. empty template → class IS flagged as changed
    expect(result.columns).toContain('10а');
  });

  it('returns empty columns when schedule equals template (no changes)', () => {
    const schedule: Schedule = { '10а': { 'Пн': { 1: { lessons: [lesson] } } } };
    const result = getChangedClassesData(schedule, schedule, ['10а'], 'Пн' as never);
    expect(result.columns).toHaveLength(0);
    expect(result.cells).toHaveLength(0);
  });

  it('flags only the class that changed, not the unchanged one', () => {
    const changedLesson = createLesson({ subject: 'Физика', teacher: 'Петрова А.П.', room: '-201-' });
    const schedule: Schedule = {
      '10а': { 'Пн': { 1: { lessons: [lesson] } } },          // unchanged
      '10б': { 'Пн': { 1: { lessons: [changedLesson] } } },    // changed from lesson
    };
    const template: Schedule = {
      '10а': { 'Пн': { 1: { lessons: [lesson] } } },
      '10б': { 'Пн': { 1: { lessons: [lesson] } } },           // was lesson, now changedLesson
    };
    const result = getChangedClassesData(schedule, template, ['10а', '10б'], 'Пн' as never);
    expect(result.columns).not.toContain('10а');
    expect(result.columns).toContain('10б');
  });

  it('trims trailing empty rows', () => {
    // Only lesson 1 has content; lessons 2-8 are empty in both schedule and template
    const schedule: Schedule = { '10а': { 'Пн': { 1: { lessons: [lesson] } } } };
    const template: Schedule = { '10а': { 'Пн': { 1: { lessons: [createLesson({ subject: 'Физика' })] } } } };
    const result = getChangedClassesData(schedule, template, ['10а'], 'Пн' as never);
    // Only row 1 has content so lessonNumbers should be trimmed to [1]
    expect(result.lessonNumbers).toEqual([1]);
    expect(result.cells).toHaveLength(1);
  });

  it('marks changed cell as isChanged=true and unchanged cell as isChanged=false', () => {
    const changed = createLesson({ id: 'l-changed', subject: 'Физика' });
    const schedule: Schedule = {
      '10а': { 'Пн': { 1: { lessons: [changed] }, 2: { lessons: [lesson] } } },
    };
    const template: Schedule = {
      '10а': { 'Пн': { 1: { lessons: [lesson] }, 2: { lessons: [lesson] } } },
    };
    const result = getChangedClassesData(schedule, template, ['10а'], 'Пн' as never);
    expect(result.cells[0][0].isChanged).toBe(true);  // lesson 1 changed
    expect(result.cells[1][0].isChanged).toBe(false); // lesson 2 unchanged
  });
});

// ─── QI-13: getAbsentTeachersData — absent view high-risk ──────

describe('getAbsentTeachersData', () => {
  const makeTeacher = (name: string): Teacher => ({
    id: `teacher-${name}`,
    name,
    subjects: [],
    bans: {},
  });

  const lesson = createLesson({ teacher: 'Иванова Т.С.' });

  it('returns empty list when template is empty (no template loaded)', () => {
    const schedule: Schedule = { '10а': { 'Пн': { 1: { lessons: [lesson] } } } };
    const teachers = { 'Иванова Т.С.': makeTeacher('Иванова Т.С.') };
    const result = getAbsentTeachersData(schedule, {}, teachers, 'Пн' as never, []);
    // teacher has no template lesson → not absent, just has extra lesson
    expect(result).toHaveLength(0);
  });

  it('identifies teacher absent when template has lesson but weekly does not', () => {
    const template: Schedule = { '10а': { 'Пн': { 1: { lessons: [lesson] } } } };
    const weekly: Schedule = { '10а': { 'Пн': { 1: { lessons: [] } } } };
    const teachers = { 'Иванова Т.С.': makeTeacher('Иванова Т.С.') };
    const result = getAbsentTeachersData(weekly, template, teachers, 'Пн' as never, []);
    expect(result).toContain('Иванова Т.С.');
  });

  it('does NOT include teacher already in absentTeachers list', () => {
    const template: Schedule = { '10а': { 'Пн': { 1: { lessons: [lesson] } } } };
    const weekly: Schedule = {};
    const teachers = { 'Иванова Т.С.': makeTeacher('Иванова Т.С.') };
    const result = getAbsentTeachersData(weekly, template, teachers, 'Пн' as never, ['Иванова Т.С.']);
    expect(result).not.toContain('Иванова Т.С.');
  });

  it('detects teacher2 absence as well', () => {
    const lessonWith2 = createLesson({ teacher: 'Иванова Т.С.', teacher2: 'Петрова А.П.' });
    const template: Schedule = { '10а': { 'Пн': { 1: { lessons: [lessonWith2] } } } };
    const weekly: Schedule = {};
    const teachers = {
      'Иванова Т.С.': makeTeacher('Иванова Т.С.'),
      'Петрова А.П.': makeTeacher('Петрова А.П.'),
    };
    const result = getAbsentTeachersData(weekly, template, teachers, 'Пн' as never, []);
    expect(result).toContain('Иванова Т.С.');
    expect(result).toContain('Петрова А.П.');
  });

  it('does NOT flag teacher who appears in weekly schedule', () => {
    const template: Schedule = { '10а': { 'Пн': { 1: { lessons: [lesson] } } } };
    const weekly: Schedule = { '10а': { 'Пн': { 1: { lessons: [lesson] } } } };
    const teachers = { 'Иванова Т.С.': makeTeacher('Иванова Т.С.') };
    const result = getAbsentTeachersData(weekly, template, teachers, 'Пн' as never, []);
    expect(result).not.toContain('Иванова Т.С.');
  });
});

// ─── QI-13: getTeacherImageData — no template ─────────────────

describe('getTeacherImageData — no template (QI-13)', () => {
  it('returns changes for all teachers when template is empty (all lessons are "new")', () => {
    const lesson = createLesson({ teacher: 'Иванова Т.С.', room: '-114-' });
    const schedule: Schedule = { '10а': { 'Пн': { 1: { lessons: [lesson] } } } };
    const result = getTeacherImageData(schedule, {}, {}, 'Пн' as never, []);
    const teacherNames = result.changes.map(c => c.teacher);
    expect(teacherNames).toContain('Иванова Т.С.');
  });

  it('returns empty changes when both schedule and template are empty', () => {
    const result = getTeacherImageData({}, {}, {}, 'Пн' as never, []);
    expect(result.changes).toHaveLength(0);
  });

  it('excludes absent teachers even when their lessons changed', () => {
    const lesson = createLesson({ teacher: 'Иванова Т.С.' });
    const changed = createLesson({ teacher: 'Иванова Т.С.', room: '-999-' });
    const template: Schedule = { '10а': { 'Пн': { 1: { lessons: [lesson] } } } };
    const weekly: Schedule = { '10а': { 'Пн': { 1: { lessons: [changed] } } } };
    const result = getTeacherImageData(weekly, template, {}, 'Пн' as never, ['Иванова Т.С.']);
    expect(result.changes.map(c => c.teacher)).not.toContain('Иванова Т.С.');
  });
});
