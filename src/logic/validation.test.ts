/**
 * Tests for validation and conflict detection
 */

import { describe, it, expect } from 'vitest';
import {
  isTeacherBanned,
  getTeacherConflict,
  isTeacherFree,
  canAssignLesson,
  canLessonsCoexist,
  getCellStatus,
  validateSchedule,
  findGaps,
  suggestGapExclusions,
} from './validation';
import type { Schedule, Teacher, LessonRequirement, Group } from '@/types';

// Test fixtures
const createTestTeachers = (): Record<string, Teacher> => ({
  'Иванова Т.С.': {
    id: '1',
    name: 'Иванова Т.С.',
    bans: { 'Вт': [1, 2, 3] },
    subjects: ['Математика', 'Алгебра'],
  },
  'Петрова А.П.': {
    id: '2',
    name: 'Петрова А.П.',
    bans: {},
    subjects: ['Физика'],
  },
  'Сидорова Е.В.': {
    id: '3',
    name: 'Сидорова Е.В.',
    bans: { 'Пн': [1, 2], 'Ср': [7, 8] },
    subjects: ['Русский', 'Литература'],
  },
});

const createTestSchedule = (): Schedule => ({
  '10а': {
    'Пн': {
      1: {
        lessons: [{
          id: 'l1',
          requirementId: 'r1',
          subject: 'Математика',
          teacher: 'Иванова Т.С.',
          room: '-114-',
        }],
      },
      2: { lessons: [] },
      3: { lessons: [] },
      4: { lessons: [] },
      5: { lessons: [] },
      6: { lessons: [] },
      7: { lessons: [] },
      8: { lessons: [] },
    },
  },
  '10б': {
    'Пн': {
      1: { lessons: [] },
      2: { lessons: [] },
      3: { lessons: [] },
      4: { lessons: [] },
      5: { lessons: [] },
      6: { lessons: [] },
      7: { lessons: [] },
      8: { lessons: [] },
    },
  },
});

describe('isTeacherBanned', () => {
  const teachers = createTestTeachers();

  it('returns true when teacher is banned at specified time', () => {
    expect(isTeacherBanned(teachers, 'Иванова Т.С.', 'Вт', 1)).toBe(true);
    expect(isTeacherBanned(teachers, 'Иванова Т.С.', 'Вт', 2)).toBe(true);
    expect(isTeacherBanned(teachers, 'Иванова Т.С.', 'Вт', 3)).toBe(true);
  });

  it('returns false when teacher is not banned', () => {
    expect(isTeacherBanned(teachers, 'Иванова Т.С.', 'Пн', 1)).toBe(false);
    expect(isTeacherBanned(teachers, 'Иванова Т.С.', 'Вт', 4)).toBe(false);
  });

  it('returns false for teacher with no bans', () => {
    expect(isTeacherBanned(teachers, 'Петрова А.П.', 'Пн', 1)).toBe(false);
  });

  it('returns false for unknown teacher', () => {
    expect(isTeacherBanned(teachers, 'Неизвестная А.Б.', 'Пн', 1)).toBe(false);
  });

  it('handles teacher with undefined bans property', () => {
    const teachersWithUndefined: Record<string, Teacher> = {
      'Тестова Т.Т.': {
        id: '99',
        name: 'Тестова Т.Т.',
        bans: {},
        subjects: [],
      },
    };
    expect(isTeacherBanned(teachersWithUndefined, 'Тестова Т.Т.', 'Пн', 1)).toBe(false);
  });
});

describe('getTeacherConflict', () => {
  it('returns conflict when teacher is in another class', () => {
    const schedule = createTestSchedule();
    const conflict = getTeacherConflict(schedule, 'Иванова Т.С.', 'Пн', 1, '10б');

    expect(conflict).not.toBeNull();
    expect(conflict?.className).toBe('10а');
    expect(conflict?.subject).toBe('Математика');
  });

  it('returns null when teacher is free', () => {
    const schedule = createTestSchedule();
    const conflict = getTeacherConflict(schedule, 'Петрова А.П.', 'Пн', 1);

    expect(conflict).toBeNull();
  });

  it('excludes specified class from check', () => {
    const schedule = createTestSchedule();
    const conflict = getTeacherConflict(schedule, 'Иванова Т.С.', 'Пн', 1, '10а');

    expect(conflict).toBeNull();
  });

  it('returns null for empty schedule', () => {
    const schedule: Schedule = {};
    const conflict = getTeacherConflict(schedule, 'Иванова Т.С.', 'Пн', 1);

    expect(conflict).toBeNull();
  });
});

describe('isTeacherFree', () => {
  const teachers = createTestTeachers();

  it('returns false when teacher is banned', () => {
    const schedule = createTestSchedule();
    expect(isTeacherFree(schedule, teachers, 'Иванова Т.С.', 'Вт', 1)).toBe(false);
  });

  it('returns false when teacher is busy in another class', () => {
    const schedule = createTestSchedule();
    expect(isTeacherFree(schedule, teachers, 'Иванова Т.С.', 'Пн', 1, '10б')).toBe(false);
  });

  it('returns true when teacher is available', () => {
    const schedule = createTestSchedule();
    expect(isTeacherFree(schedule, teachers, 'Петрова А.П.', 'Пн', 1)).toBe(true);
  });

  it('returns true when checking same class (teacher can be in own class)', () => {
    const schedule = createTestSchedule();
    expect(isTeacherFree(schedule, teachers, 'Иванова Т.С.', 'Пн', 1, '10а')).toBe(true);
  });
});

describe('canAssignLesson', () => {
  const teachers = createTestTeachers();

  it('returns allowed:true for valid assignment', () => {
    const schedule = createTestSchedule();
    const result = canAssignLesson(schedule, teachers, {
      className: '10б',
      day: 'Пн',
      lessonNum: 2,
      teacherName: 'Петрова А.П.',
    });

    expect(result).toEqual({ allowed: true });
  });

  it('returns teacher_banned when teacher has ban', () => {
    const schedule = createTestSchedule();
    const result = canAssignLesson(schedule, teachers, {
      className: '10б',
      day: 'Вт',
      lessonNum: 1,
      teacherName: 'Иванова Т.С.',
    });

    expect(result).toEqual({ allowed: false, reason: 'teacher_banned' });
  });

  it('returns class_occupied when slot has lessons', () => {
    const schedule = createTestSchedule();
    const result = canAssignLesson(schedule, teachers, {
      className: '10а',
      day: 'Пн',
      lessonNum: 1,
      teacherName: 'Петрова А.П.',
    });

    expect(result).toEqual({ allowed: false, reason: 'class_occupied' });
  });

  it('returns teacher_busy when teacher is in another class', () => {
    const schedule = createTestSchedule();
    const result = canAssignLesson(schedule, teachers, {
      className: '10б',
      day: 'Пн',
      lessonNum: 1,
      teacherName: 'Иванова Т.С.',
    });

    expect(result).toEqual({
      allowed: false,
      reason: 'teacher_busy',
      conflictClass: '10а',
      conflictSubject: 'Математика',
    });
  });

  it('allows parallel groups in same slot', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Английский',
              teacher: 'Иванова Т.С.',
              room: '-114-',
              group: '10а(1)',
            }],
          },
        },
      },
    };

    const result = canAssignLesson(schedule, teachers, {
      className: '10а',
      day: 'Пн',
      lessonNum: 1,
      teacherName: 'Петрова А.П.',
      group: '10а(2)',
      parallelGroups: ['10а(1)'],
    });

    expect(result).toEqual({ allowed: true });
  });
});

describe('getCellStatus', () => {
  const teachers = createTestTeachers();
  const createRequirement = (overrides: Partial<LessonRequirement> = {}): LessonRequirement => ({
    id: 'req-1',
    type: 'class',
    classOrGroup: '10а',
    subject: 'Физика',
    teacher: 'Петрова А.П.',
    countPerWeek: 3,
    ...overrides,
  });

  it('returns available for empty slot with free teacher', () => {
    const schedule = createTestSchedule();
    const status = getCellStatus(
      schedule,
      teachers,
      createRequirement(),
      '10а',
      'Пн',
      2
    );

    expect(status).toEqual({ status: 'available' });
  });

  it('returns same when identical lesson is in slot', () => {
    const schedule = createTestSchedule();
    const status = getCellStatus(
      schedule,
      teachers,
      createRequirement({ subject: 'Математика', teacher: 'Иванова Т.С.' }),
      '10а',
      'Пн',
      1
    );

    expect(status).toEqual({ status: 'same' });
  });

  it('returns teacher_banned when teacher has ban', () => {
    const schedule = createTestSchedule();
    const status = getCellStatus(
      schedule,
      teachers,
      createRequirement({ teacher: 'Иванова Т.С.' }),
      '10а',
      'Вт',
      1
    );

    expect(status).toEqual({ status: 'teacher_banned' });
  });

  it('returns teacher_busy when teacher in another class', () => {
    const schedule = createTestSchedule();
    const status = getCellStatus(
      schedule,
      teachers,
      createRequirement({ teacher: 'Иванова Т.С.' }),
      '10б',
      'Пн',
      1
    );

    expect(status.status).toBe('teacher_busy');
    if (status.status === 'teacher_busy') {
      expect(status.conflictClass).toBe('10а');
    }
  });

  it('returns class_occupied when slot has different lesson', () => {
    const schedule = createTestSchedule();
    const status = getCellStatus(
      schedule,
      teachers,
      createRequirement(),
      '10а',
      'Пн',
      1
    );

    expect(status).toEqual({ status: 'class_occupied' });
  });
});

describe('canLessonsCoexist', () => {
  it('returns false when existing lesson has no group', () => {
    const existing = { id: 'l1', requirementId: 'r1', subject: 'Математика', teacher: 'Иванова Т.С.', room: '-114-' };
    const newLesson = { group: '10а(д)', parallelGroup: '10а(е)' };

    expect(canLessonsCoexist(existing, newLesson)).toBe(false);
  });

  it('returns false when new lesson has no group', () => {
    const existing = { id: 'l1', requirementId: 'r1', subject: 'Математика', teacher: 'Иванова Т.С.', room: '-114-', group: '10а(д)' };
    const newLesson = {};

    expect(canLessonsCoexist(existing, newLesson)).toBe(false);
  });

  it('returns false for unrelated groups (no parallelGroup match)', () => {
    const existing = { id: 'l1', requirementId: 'r1', subject: 'Английский', teacher: 'Иванова Т.С.', room: '-114-', group: '10а(д)' };
    const newLesson = { group: '11б(ф)', parallelGroup: '11б(г)' };

    // Different groups but NOT parallel — should NOT coexist
    expect(canLessonsCoexist(existing, newLesson)).toBe(false);
  });

  it('returns true when existing group matches new parallelGroup', () => {
    const existing = { id: 'l1', requirementId: 'r1', subject: 'Английский', teacher: 'Иванова Т.С.', room: '-114-', group: '10а(д)' };
    const newLesson = { group: '10а(е)', parallelGroup: '10а(д)' };

    expect(canLessonsCoexist(existing, newLesson)).toBe(true);
  });

  it('returns false when groups are same', () => {
    const existing = { id: 'l1', requirementId: 'r1', subject: 'Английский', teacher: 'Иванова Т.С.', room: '-114-', group: '10а(д)' };
    const newLesson = { group: '10а(д)', parallelGroup: '10а(е)' };

    expect(canLessonsCoexist(existing, newLesson)).toBe(false);
  });
});

describe('validateSchedule', () => {
  const teachers = createTestTeachers();

  it('returns empty array for valid schedule', () => {
    const schedule = createTestSchedule();
    const conflicts = validateSchedule(schedule, teachers);

    expect(conflicts).toEqual([]);
  });

  it('detects teacher double-booking', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Математика',
              teacher: 'Иванова Т.С.',
              room: '-114-',
            }],
          },
        },
      },
      '10б': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l2',
              requirementId: 'r2',
              subject: 'Алгебра',
              teacher: 'Иванова Т.С.',
              room: '-205-',
            }],
          },
        },
      },
    };

    const conflicts = validateSchedule(schedule, teachers);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('teacher_double_booked');
    expect(conflicts[0].day).toBe('Пн');
    expect(conflicts[0].lessonNum).toBe(1);
  });

  it('returns empty for empty schedule', () => {
    const conflicts = validateSchedule({}, teachers);
    expect(conflicts).toEqual([]);
  });

  it('validates all days even when first class has sparse schedule', () => {
    // First class only has Пн, but second class has a conflict on Вт
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Математика',
              teacher: 'Иванова Т.С.',
              room: '-114-',
            }],
          },
        },
        // No Вт at all for 10а
      },
      '10б': {
        'Вт': {
          1: {
            lessons: [{
              id: 'l2',
              requirementId: 'r2',
              subject: 'Физика',
              teacher: 'Петрова А.П.',
              room: '-205-',
            }],
          },
        },
      },
      '10в': {
        'Вт': {
          1: {
            lessons: [{
              id: 'l3',
              requirementId: 'r3',
              subject: 'Химия',
              teacher: 'Петрова А.П.', // Same teacher as 10б - double booked!
              room: '-301-',
            }],
          },
        },
      },
    };

    const conflicts = validateSchedule(schedule, teachers);

    // Should detect Петрова double-booked on Вт lesson 1
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].day).toBe('Вт');
    expect(conflicts[0].lessonNum).toBe(1);
  });
});

describe('findGaps', () => {
  const teachers = createTestTeachers();

  const makeLesson = (teacher: string, subject: string) => ({
    id: 'l1',
    requirementId: 'r1',
    subject,
    teacher,
    room: '-114-',
  });

  it('returns empty for schedule with no gaps', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [makeLesson('Иванова Т.С.', 'Математика')] },
          2: { lessons: [makeLesson('Петрова А.П.', 'Физика')] },
          3: { lessons: [makeLesson('Иванова Т.С.', 'Алгебра')] },
          4: { lessons: [] },
          5: { lessons: [] },
          6: { lessons: [] },
          7: { lessons: [] },
          8: { lessons: [] },
        },
      },
    };

    const gaps = findGaps(schedule, teachers);
    expect(gaps.filter(g => g.type === 'class')).toHaveLength(0);
  });

  it('detects class gap between occupied slots', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [makeLesson('Иванова Т.С.', 'Математика')] },
          2: { lessons: [] },
          3: { lessons: [makeLesson('Петрова А.П.', 'Физика')] },
          4: { lessons: [] },
          5: { lessons: [] },
          6: { lessons: [] },
          7: { lessons: [] },
          8: { lessons: [] },
        },
      },
    };

    const classGaps = findGaps(schedule, teachers).filter(g => g.type === 'class');
    expect(classGaps).toHaveLength(1);
    expect(classGaps[0]).toEqual({
      type: 'class',
      name: '10а',
      day: 'Пн',
      lessonNum: 2,
    });
  });

  it('detects multiple gaps in one day', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [makeLesson('Иванова Т.С.', 'Математика')] },
          2: { lessons: [] },
          3: { lessons: [] },
          4: { lessons: [makeLesson('Петрова А.П.', 'Физика')] },
          5: { lessons: [] },
          6: { lessons: [] },
          7: { lessons: [] },
          8: { lessons: [] },
        },
      },
    };

    const classGaps = findGaps(schedule, teachers).filter(g => g.type === 'class');
    expect(classGaps).toHaveLength(2);
    expect(classGaps.map(g => g.lessonNum)).toEqual([2, 3]);
  });

  it('does not report teacher gaps (only class gaps)', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [makeLesson('Иванова Т.С.', 'Математика')] },
          2: { lessons: [] },
          3: { lessons: [] },
          4: { lessons: [] },
          5: { lessons: [] },
          6: { lessons: [] },
          7: { lessons: [] },
          8: { lessons: [] },
        },
      },
      '10б': {
        'Пн': {
          1: { lessons: [] },
          2: { lessons: [] },
          3: { lessons: [makeLesson('Иванова Т.С.', 'Алгебра')] },
          4: { lessons: [] },
          5: { lessons: [] },
          6: { lessons: [] },
          7: { lessons: [] },
          8: { lessons: [] },
        },
      },
    };

    const gaps = findGaps(schedule, teachers);
    // Teacher has a gap at Пн-2, but we only report class gaps
    expect(gaps.filter(g => g.type === 'teacher')).toHaveLength(0);
  });

  it('returns empty for empty schedule', () => {
    expect(findGaps({}, teachers)).toEqual([]);
  });

  it('excludes specified classes from gap search', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [makeLesson('Иванова Т.С.', 'Математика')] },
          2: { lessons: [] },
          3: { lessons: [makeLesson('Петрова А.П.', 'Физика')] },
        },
      },
      '1а': {
        'Пн': {
          1: { lessons: [makeLesson('Сидорова Е.В.', 'Русский')] },
          2: { lessons: [] },
          3: { lessons: [makeLesson('Сидорова Е.В.', 'Литература')] },
        },
      },
    };

    // Without exclusions — both classes have gaps
    const allGaps = findGaps(schedule, teachers);
    expect(allGaps.filter(g => g.type === 'class')).toHaveLength(2);

    // Exclude 1а — only 10а gap remains
    const filtered = findGaps(schedule, teachers, new Set(['1а']));
    expect(filtered.filter(g => g.type === 'class')).toHaveLength(1);
    expect(filtered[0].name).toBe('10а');
  });

  it('excludes multiple classes', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [makeLesson('Иванова Т.С.', 'Математика')] },
          2: { lessons: [] },
          3: { lessons: [makeLesson('Петрова А.П.', 'Физика')] },
        },
      },
      '1а': {
        'Пн': {
          1: { lessons: [makeLesson('Сидорова Е.В.', 'Русский')] },
          2: { lessons: [] },
          3: { lessons: [makeLesson('Сидорова Е.В.', 'Литература')] },
        },
      },
    };

    const filtered = findGaps(schedule, teachers, new Set(['1а', '10а']));
    expect(filtered).toHaveLength(0);
  });

  it('empty exclusion set behaves like no exclusions', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [makeLesson('Иванова Т.С.', 'Математика')] },
          2: { lessons: [] },
          3: { lessons: [makeLesson('Петрова А.П.', 'Физика')] },
        },
      },
    };

    const gaps = findGaps(schedule, teachers, new Set());
    expect(gaps.filter(g => g.type === 'class')).toHaveLength(1);
  });

  it('returns empty for single occupied slot (no gap possible)', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [makeLesson('Иванова Т.С.', 'Математика')] },
          2: { lessons: [] },
          3: { lessons: [] },
          4: { lessons: [] },
          5: { lessons: [] },
          6: { lessons: [] },
          7: { lessons: [] },
          8: { lessons: [] },
        },
      },
    };

    const classGaps = findGaps(schedule, teachers).filter(g => g.type === 'class');
    expect(classGaps).toHaveLength(0);
  });
});

describe('suggestGapExclusions', () => {
  it('suggests home-schooled names (no leading digit)', () => {
    const result = suggestGapExclusions(['10а', '10б', 'Иванов', 'Петров']);
    expect(result).toContain('Иванов');
    expect(result).toContain('Петров');
  });

  it('suggests elementary grades 1-4', () => {
    const result = suggestGapExclusions(['1а', '2б', '3в', '4г', '5а', '10а']);
    expect(result).toEqual(expect.arrayContaining(['1а', '2б', '3в', '4г']));
    expect(result).not.toContain('5а');
    expect(result).not.toContain('10а');
  });

  it('returns empty for all-digit-starting non-elementary names', () => {
    const result = suggestGapExclusions(['5а', '10а', '11б']);
    expect(result).toHaveLength(0);
  });
});

describe('teacher2 support', () => {
  const teachers = createTestTeachers();

  it('getTeacherConflict detects conflict via teacher2', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Математика',
              teacher: 'Иванова Т.С.',
              teacher2: 'Петрова А.П.',
              room: '-114-',
            }],
          },
        },
      },
    };

    // Петрова is teacher2 in 10а, should conflict when checking for 10б
    const conflict = getTeacherConflict(schedule, 'Петрова А.П.', 'Пн', 1, '10б');
    expect(conflict).not.toBeNull();
    expect(conflict?.className).toBe('10а');
    expect(conflict?.subject).toBe('Математика');
  });

  it('validateSchedule detects teacher2 double-booking', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Математика',
              teacher: 'Иванова Т.С.',
              teacher2: 'Петрова А.П.',
              room: '-114-',
            }],
          },
        },
      },
      '10б': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l2',
              requirementId: 'r2',
              subject: 'Физика',
              teacher: 'Петрова А.П.',
              room: '-215-',
            }],
          },
        },
      },
    };

    const conflicts = validateSchedule(schedule, teachers);
    expect(conflicts.length).toBeGreaterThan(0);
    const petrovConflict = conflicts.find(c => c.details.includes('Петрова А.П.'));
    expect(petrovConflict).toBeDefined();
  });

  it('getCellStatus returns teacher_banned when teacher2 is banned', () => {
    const schedule: Schedule = {};
    const req: LessonRequirement = {
      id: 'req-t2-ban',
      type: 'class',
      classOrGroup: '10а',
      subject: 'Физика',
      teacher: 'Петрова А.П.',
      teacher2: 'Иванова Т.С.',
      countPerWeek: 2,
    };

    // Иванова is banned on Вт lessons 1-3
    const status = getCellStatus(schedule, teachers, req, '10а', 'Вт', 1);
    expect(status.status).toBe('teacher_banned');
  });

  it('getCellStatus returns teacher_busy when teacher2 is busy elsewhere', () => {
    const schedule: Schedule = {
      '10б': {
        'Пн': {
          3: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Русский',
              teacher: 'Сидорова Е.В.',
              room: '-114-',
            }],
          },
        },
      },
    };

    const req: LessonRequirement = {
      id: 'req-t2-busy',
      type: 'class',
      classOrGroup: '10а',
      subject: 'Физика',
      teacher: 'Петрова А.П.',
      teacher2: 'Сидорова Е.В.',
      countPerWeek: 2,
    };

    // Пн-3: Сидорова has no ban but is busy in 10б
    const status = getCellStatus(schedule, teachers, req, '10а', 'Пн', 3);
    expect(status.status).toBe('teacher_busy');
  });

  it('canAssignLesson returns teacher_banned when teacher2 is banned', () => {
    const schedule: Schedule = {};
    const result = canAssignLesson(schedule, teachers, {
      className: '10а',
      day: 'Вт',
      lessonNum: 1,
      teacherName: 'Петрова А.П.',
      teacher2Name: 'Иванова Т.С.',
    });
    expect(result).toEqual({ allowed: false, reason: 'teacher_banned' });
  });

  it('canAssignLesson returns teacher_busy when teacher2 is busy', () => {
    const schedule: Schedule = {
      '10б': {
        'Пн': {
          3: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Русский',
              teacher: 'Сидорова Е.В.',
              room: '-114-',
            }],
          },
        },
      },
    };

    // Пн-3: Сидорова has no ban but is busy in 10б
    const result = canAssignLesson(schedule, teachers, {
      className: '10а',
      day: 'Пн',
      lessonNum: 3,
      teacherName: 'Петрова А.П.',
      teacher2Name: 'Сидорова Е.В.',
    });
    expect(result).toEqual({
      allowed: false,
      reason: 'teacher_busy',
      conflictClass: '10б',
      conflictSubject: 'Русский',
    });
  });
});


describe('canLessonsCoexist — groups table lookup (Z29-1)', () => {
  // Groups table for 10а: two separate parallel pairs
  const groups10a: Group[] = [
    { id: 'g1', name: '10а(д)', className: '10а', index: '(д)', parallelGroup: '10а(м)' },
    { id: 'g2', name: '10а(м)', className: '10а', index: '(м)', parallelGroup: '10а(д)' },
    { id: 'g3', name: '10а(В.Е.)', className: '10а', index: '(В.Е.)', parallelGroup: '10а(Т.В.)' },
    { id: 'g4', name: '10а(Т.В.)', className: '10а', index: '(Т.В.)', parallelGroup: '10а(В.Е.)' },
  ];

  const groups5a: Group[] = [
    { id: 'g1', name: '5а (Т.В.)', className: '5а', index: '(Т.В.)', parallelGroup: '5а (Ю.В.)' },
    { id: 'g2', name: '5а (Ю.В.)', className: '5а', index: '(Ю.В.)', parallelGroup: '5а (Т.В.)' },
  ];

  it('allows parallel groups via groups table lookup (no formal parallelGroup needed)', () => {
    const existing = { id: 'l1', requirementId: 'r1', subject: 'Физра', teacher: 'Пепкин А.В.', room: '-Зал-', group: '10а(д)' };
    const newLesson = { group: '10а(м)' }; // groups table: 10а(д) parallelGroup=10а(м)
    expect(canLessonsCoexist(existing, newLesson, groups10a)).toBe(true);
  });

  it('Z29-1 regression: blocks non-parallel groups from same class', () => {
    // 10а(м) is parallel to 10а(д), NOT to 10а(В.Е.) — different parallel pair
    const existing = { id: 'l1', requirementId: 'r1', subject: 'Физра', teacher: 'Пепкин А.В.', room: '-Зал-', group: '10а(м)' };
    const newLesson = { group: '10а(В.Е.)', parallelGroup: '10а(Т.В.)' };
    expect(canLessonsCoexist(existing, newLesson, groups10a)).toBe(false);
  });

  it('Z29-1 regression: also blocks without parallelGroup set on new lesson', () => {
    const existing = { id: 'l1', requirementId: 'r1', subject: 'Физра', teacher: 'Пепкин А.В.', room: '-Зал-', group: '10а(м)' };
    const newLesson = { group: '10а(В.Е.)' };
    expect(canLessonsCoexist(existing, newLesson, groups10a)).toBe(false);
  });

  it('still rejects groups from different parent classes', () => {
    const existing = { id: 'l1', requirementId: 'r1', subject: 'Английский', teacher: 'Иванова Т.С.', room: '-114-', group: '10а(д)' };
    const newLesson = { group: '11б(м)' };
    expect(canLessonsCoexist(existing, newLesson, groups10a)).toBe(false);
  });

  // ── Z16-3 regression: real data uses "5а (Т.В.)" (space before paren) ──
  it('Z16-3: allows coexistence with real-data space format via groups table', () => {
    const existing = { id: 'l1', requirementId: 'r1', subject: 'Английский', teacher: 'Винокурова Т.В.', room: '-114-', group: '5а (Т.В.)' };
    const newLesson = { group: '5а (Ю.В.)' };
    expect(canLessonsCoexist(existing, newLesson, groups5a)).toBe(true);
  });

  it('allows coexistence via formal parallelGroup even without groups table', () => {
    const existing = { id: 'l1', requirementId: 'r1', subject: 'Английский', teacher: 'Иванова Т.С.', room: '-114-', group: '10а(д)' };
    const newLesson = { group: '10а(е)', parallelGroup: '10а(д)' };
    expect(canLessonsCoexist(existing, newLesson)).toBe(true);
  });

  it('blocks same-class groups when no groups table and no parallelGroup set', () => {
    // Without groups data, only formal parallelGroup check applies
    const existing = { id: 'l1', requirementId: 'r1', subject: 'Физра', teacher: 'Иванова Т.С.', room: '-114-', group: '10а(д)' };
    const newLesson = { group: '10а(м)' };
    expect(canLessonsCoexist(existing, newLesson)).toBe(false);
  });
});

describe('getCellStatus — group coexistence relaxed', () => {
  const teachers = createTestTeachers();

  it('temp group lesson coexists with imported parallel group (stakeholder Z13-4 scenario)', () => {
    // Imported lesson already in slot: Английский 11б(В.Е.) Лихачева
    const schedule: Schedule = {
      '11б': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Английский',
              teacher: 'Иванова Т.С.',
              room: '-114-',
              group: '11б(В.Е.)',
            }],
          },
        },
      },
    };

    // Temp lesson created via +: Английский 11б(Т.В.) with sibling-detected parallelGroup
    const tempReq: LessonRequirement = {
      id: 'temp-1',
      type: 'group',
      classOrGroup: '11б(Т.В.)',
      subject: 'Английский',
      teacher: 'Петрова А.П.',
      countPerWeek: 1,
      className: '11б',
      parallelGroup: '11б(В.Е.)',
    };

    const status = getCellStatus(schedule, teachers, tempReq, '11б', 'Пн', 1);
    expect(status.status).toBe('available');
  });

  it('temp group lesson without parallelGroup coexists when groups table confirms parallel', () => {
    // First temp lesson placed, no parallelGroup on the scheduled lesson itself
    const schedule: Schedule = {
      '11б': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'temp-1',
              subject: 'Английский',
              teacher: 'Иванова Т.С.',
              room: '-114-',
              group: '11б(Т.В.)',
            }],
          },
        },
      },
    };

    // Groups table confirms 11б(Т.В.) ∥ 11б(В.Е.)
    const groups11b: Group[] = [
      { id: 'g1', name: '11б(Т.В.)', className: '11б', index: '(Т.В.)', parallelGroup: '11б(В.Е.)' },
      { id: 'g2', name: '11б(В.Е.)', className: '11б', index: '(В.Е.)', parallelGroup: '11б(Т.В.)' },
    ];

    // Second temp lesson (no parallelGroup) — coexists via groups table
    const tempReq: LessonRequirement = {
      id: 'temp-2',
      type: 'group',
      classOrGroup: '11б(В.Е.)',
      subject: 'Английский',
      teacher: 'Петрова А.П.',
      countPerWeek: 1,
      className: '11б',
      // No parallelGroup
    };

    const status = getCellStatus(schedule, teachers, tempReq, '11б', 'Пн', 1, undefined, groups11b);
    expect(status.status).toBe('available');
  });

  it('allows group lesson in slot with parallel group from same class (via groups table, no parallelGroup on req)', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Физра',
              teacher: 'Иванова Т.С.',
              room: '-Зал-',
              group: '10а(д)',
            }],
          },
        },
      },
    };

    const groups10a: Group[] = [
      { id: 'g1', name: '10а(д)', className: '10а', index: '(д)', parallelGroup: '10а(м)' },
      { id: 'g2', name: '10а(м)', className: '10а', index: '(м)', parallelGroup: '10а(д)' },
    ];

    const req: LessonRequirement = {
      id: 'req-group',
      type: 'group',
      classOrGroup: '10а(м)',
      subject: 'Физра',
      teacher: 'Петрова А.П.',
      countPerWeek: 3,
      className: '10а',
      // No parallelGroup — groups table handles it
    };

    const status = getCellStatus(schedule, teachers, req, '10а', 'Пн', 1, undefined, groups10a);
    expect(status.status).toBe('available');
  });

  it('Z29-1: blocks non-parallel groups from same class even when no parallelGroup set', () => {
    // Slot has 10а(м) (PE), trying to place 10а(В.Е.) (English) — different parallel pair
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Физра',
              teacher: 'Пепкин А.В.',
              room: '-Зал-',
              group: '10а(м)',
            }],
          },
        },
      },
    };

    const groups10a: Group[] = [
      { id: 'g1', name: '10а(д)', className: '10а', index: '(д)', parallelGroup: '10а(м)' },
      { id: 'g2', name: '10а(м)', className: '10а', index: '(м)', parallelGroup: '10а(д)' },
      { id: 'g3', name: '10а(В.Е.)', className: '10а', index: '(В.Е.)', parallelGroup: '10а(Т.В.)' },
      { id: 'g4', name: '10а(Т.В.)', className: '10а', index: '(Т.В.)', parallelGroup: '10а(В.Е.)' },
    ];

    const req: LessonRequirement = {
      id: 'req-eng',
      type: 'group',
      classOrGroup: '10а(В.Е.)',
      subject: 'Английский',
      teacher: 'Лихачева В.Е.',
      countPerWeek: 5,
      className: '10а',
      parallelGroup: '10а(Т.В.)',
    };

    const status = getCellStatus(schedule, teachers, req, '10а', 'Пн', 1, undefined, groups10a);
    expect(status.status).toBe('class_occupied');
  });

  it('Z16-3 exact scenario: temp lesson "5а (Л.М.)" coexists with imported "5а (Т.В.)"', () => {
    // Stakeholder scenario: 5а, Wed slot 1 already has Винокурова Т.В. group "5а (Т.В.)"
    // User adds temp lesson for Мусатова group "5а (Ю.В.)" via "+"
    const scheduleZ16: Schedule = {
      '5а': {
        'Ср': {
          1: {
            lessons: [{
              id: 'l-existing',
              requirementId: 'r-base',
              subject: 'Английский',
              teacher: 'Иванова Т.С.',  // placeholder for Винокурова
              room: '-114-',
              group: '5а (Т.В.)',       // real data format: space before paren
            }],
          },
        },
      },
    };

    // Temp lesson created via "+" with correct space format (after fix)
    const tempReq: LessonRequirement = {
      id: 'temp-musa',
      type: 'group',
      classOrGroup: '5а (Ю.В.)',       // space format — matches real data
      subject: 'Английский',
      teacher: 'Петрова А.П.',          // placeholder for Мусатова
      countPerWeek: 1,
      className: '5а',
      parallelGroup: '5а (Т.В.)',       // correctly looked up from Groups table
    };

    const status = getCellStatus(scheduleZ16, teachers, tempReq, '5а', 'Ср', 1);
    expect(status.status).toBe('available');
  });
});

describe('getCellStatus — partner_busy', () => {
  const teachers = createTestTeachers();

  const req = (override: Partial<LessonRequirement> = {}): LessonRequirement => ({
    id: 'req-1',
    type: 'class',
    classOrGroup: '10а',
    subject: 'Физика',
    teacher: 'Петрова А.П.',
    countPerWeek: 3,
    ...override,
  });

  it('returns partner_busy when teacher+slot is in partnerBusySet', () => {
    const busySet = new Set(['Петрова А.П.|Пн|2']);
    const status = getCellStatus({}, teachers, req(), '10а', 'Пн', 2, busySet);
    expect(status.status).toBe('partner_busy');
    if (status.status === 'partner_busy') {
      expect(status.teacherName).toBe('Петрова А.П.');
    }
  });

  it('returns partner_busy for teacher2 when teacher2 is in busySet', () => {
    const busySet = new Set(['Иванова Т.С.|Пн|2']);
    const status = getCellStatus({}, teachers, req({ teacher2: 'Иванова Т.С.' }), '10а', 'Пн', 2, busySet);
    expect(status.status).toBe('partner_busy');
    if (status.status === 'partner_busy') {
      expect(status.teacherName).toBe('Иванова Т.С.');
    }
  });

  it('teacher_busy wins over partner_busy (higher priority)', () => {
    const schedule = createTestSchedule();
    // Иванова is in 10а/Пн/1 — checking from 10б, Иванова is teacher_busy
    // Even if Иванова is also in partner busy set, teacher_busy is returned first
    const busySet = new Set(['Иванова Т.С.|Пн|1']);
    const status = getCellStatus(schedule, teachers, req({ teacher: 'Иванова Т.С.' }), '10б', 'Пн', 1, busySet);
    expect(status.status).toBe('teacher_busy');
  });

  it('returns available when partnerBusySet is undefined (backward-compatible)', () => {
    const status = getCellStatus({}, teachers, req(), '10а', 'Пн', 2, undefined);
    expect(status.status).toBe('available');
  });

  it('returns available when partnerBusySet is provided but teacher not in it', () => {
    const busySet = new Set(['Иванова Т.С.|Пн|2']);
    const status = getCellStatus({}, teachers, req(), '10а', 'Пн', 2, busySet);
    expect(status.status).toBe('available');
  });
});

// ─── Z37-4 partner school class tests ─────────────────────────────────────

describe('getCellStatus — Z37-4 partner class names', () => {
  const teachers = createTestTeachers();

  const req = (override: Partial<LessonRequirement> = {}): LessonRequirement => ({
    id: 'req-1',
    type: 'class',
    classOrGroup: '10а',
    subject: 'Физика',
    teacher: 'Петрова А.П.',
    countPerWeek: 3,
    ...override,
  });

  const buildScheduleWithTeacherInPartnerClass = () => {
    const schedule: Schedule = {
      '9п': { // partner class
        'Пн': {
          1: {
            lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Физика', teacher: 'Петрова А.П.', room: '-114-' }],
          },
        },
      },
    };
    return schedule;
  };

  it('returns partner_busy (not teacher_busy) when teacher conflict is in a partner class', () => {
    const schedule = buildScheduleWithTeacherInPartnerClass();
    const partnerClassNames = new Set(['9п']);
    const status = getCellStatus(schedule, teachers, req(), '10а', 'Пн', 1, undefined, undefined, partnerClassNames);
    expect(status.status).toBe('partner_busy');
  });

  it('returns teacher_busy when conflict class is NOT a partner class', () => {
    const schedule = buildScheduleWithTeacherInPartnerClass();
    // No partnerClassNames provided — 9п is treated as regular class
    const status = getCellStatus(schedule, teachers, req(), '10а', 'Пн', 1, undefined, undefined, undefined);
    expect(status.status).toBe('teacher_busy');
  });

  it('returns partner_busy for teacher2 conflict in partner class', () => {
    const schedule: Schedule = {
      '9п': {
        'Пн': {
          1: { lessons: [{ id: 'l2', requirementId: 'r2', subject: 'Алгебра', teacher: 'Иванова Т.С.', room: '-114-' }] },
        },
      },
    };
    const partnerClassNames = new Set(['9п']);
    const status = getCellStatus(schedule, teachers, req({ teacher2: 'Иванова Т.С.' }), '10а', 'Пн', 1, undefined, undefined, partnerClassNames);
    expect(status.status).toBe('partner_busy');
  });
});

describe('validateSchedule — Z37-4 partner class exclusion', () => {
  it('does not report teacher_double_booked when second class is a partner class', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': { 1: { lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Физика', teacher: 'Петрова А.П.', room: '-114-' }] } },
      },
      '9п': { // partner class
        'Пн': { 1: { lessons: [{ id: 'l2', requirementId: 'r2', subject: 'Физика', teacher: 'Петрова А.П.', room: '-115-' }] } },
      },
    };
    const partnerClassNames = new Set(['9п']);
    const conflicts = validateSchedule(schedule, createTestTeachers(), partnerClassNames);
    expect(conflicts.filter(c => c.type === 'teacher_double_booked')).toHaveLength(0);
  });

  it('still reports teacher_double_booked when both classes are non-partner', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': { 1: { lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Физика', teacher: 'Петрова А.П.', room: '-114-' }] } },
      },
      '10б': {
        'Пн': { 1: { lessons: [{ id: 'l2', requirementId: 'r2', subject: 'Физика', teacher: 'Петрова А.П.', room: '-115-' }] } },
      },
    };
    const partnerClassNames = new Set<string>(); // empty
    const conflicts = validateSchedule(schedule, createTestTeachers(), partnerClassNames);
    expect(conflicts.filter(c => c.type === 'teacher_double_booked').length).toBeGreaterThan(0);
  });
});

// ─── Z27 regression tests ─────────────────────────────────────

describe('validateSchedule — Z27-4 force_override_ban', () => {
  it('detects force-override lesson placed during teacher ban', () => {
    const schedule: Schedule = {
      '10а': {
        'Вт': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Математика',
              teacher: 'Иванова Т.С.',
              room: '-114-',
              forceOverride: true,
            }],
          },
        },
      },
    };
    // Иванова is banned Вт 1-3
    const conflicts = validateSchedule(schedule, createTestTeachers());
    expect(conflicts.some(c => c.type === 'force_override_ban')).toBe(true);
    const banConflict = conflicts.find(c => c.type === 'force_override_ban')!;
    expect(banConflict.day).toBe('Вт');
    expect(banConflict.lessonNum).toBe(1);
    expect(banConflict.details).toContain('Иванова Т.С.');
  });

  it('does not emit force_override_ban for regular non-banned lesson', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Математика',
              teacher: 'Иванова Т.С.',
              room: '-114-',
            }],
          },
        },
      },
    };
    const conflicts = validateSchedule(schedule, createTestTeachers());
    expect(conflicts.some(c => c.type === 'force_override_ban')).toBe(false);
  });
});

describe('findGaps — Z27-5/Z28-1 group gap detection', () => {
  // Z27-5 true positive: full-class → single-group → full-class → window for absent group.
  it('7е-case: single-group slot between two full-class slots reports window for absent group', () => {
    // Lesson 6: both groups (full class), Lesson 7: group A only, Lesson 8: class-wide (full class)
    const schedule: Schedule = {
      '7е': {
        'Чт': {
          6: {
            lessons: [
              { id: 'a6', requirementId: 'r1', subject: 'Инф', teacher: 'Иванова Т.С.', room: '-114-', group: '7е(Л.Н.)' },
              { id: 'b6', requirementId: 'r2', subject: 'Инф', teacher: 'Петрова А.П.', room: '-115-', group: '7е(Т.В.)' },
            ],
          },
          7: {
            lessons: [
              { id: 'a7', requirementId: 'r1', subject: 'Инф', teacher: 'Иванова Т.С.', room: '-114-', group: '7е(Л.Н.)' },
            ],
          },
          8: {
            lessons: [
              { id: 'c8', requirementId: 'r3', subject: 'История', teacher: 'Сидорова Е.В.', room: '-220-' },
            ],
          },
        },
      },
    };

    const gaps = findGaps(schedule, {});
    const groupGaps = gaps.filter(g => g.type === 'group');
    // Group 7е(Т.В.) has a window at lesson 7 (absent while partner is present, between full-class slots 6 and 8)
    expect(groupGaps.some(g => g.name === '7е(Т.В.)' && g.lessonNum === 7)).toBe(true);
    // Group 7е(Л.Н.) has NO window (it is present at lesson 7)
    expect(groupGaps.some(g => g.name === '7е(Л.Н.)')).toBe(false);
  });

  // Z28-1 false-positive regression: both groups present in a slot → no window.
  it('11б-case: slot with both groups is full-class and must NOT be reported as window', () => {
    // Lesson 5: group A + group B (both groups — full class). No single-group slot anywhere.
    const schedule: Schedule = {
      '11б': {
        'Пт': {
          5: {
            lessons: [
              { id: 'a5', requirementId: 'r1', subject: 'Физ', teacher: 'Иванова Т.С.', room: '-114-', group: '11б(А.М.)' },
              { id: 'b5', requirementId: 'r2', subject: 'Физ', teacher: 'Петрова А.П.', room: '-115-', group: '11б(Д.М.)' },
            ],
          },
        },
      },
    };

    const gaps = findGaps(schedule, {});
    expect(gaps.filter(g => g.type === 'group')).toHaveLength(0);
    expect(gaps.filter(g => g.type === 'class')).toHaveLength(0);
  });

  // Z28-1: single-group slot NOT sandwiched (no full-class after) → no window.
  it('single-group slot at end of day (no full-class after) does NOT produce a window', () => {
    // Lesson 4: both groups (full class), Lesson 5: group A only (end of day — no full-class after)
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          4: {
            lessons: [
              { id: 'a4', requirementId: 'r1', subject: 'Мат', teacher: 'Иванова Т.С.', room: '-114-', group: '10а(д)' },
              { id: 'b4', requirementId: 'r2', subject: 'Мат', teacher: 'Петрова А.П.', room: '-115-', group: '10а(м)' },
            ],
          },
          5: {
            lessons: [
              { id: 'a5', requirementId: 'r1', subject: 'Мат', teacher: 'Иванова Т.С.', room: '-114-', group: '10а(д)' },
            ],
          },
        },
      },
    };

    const gaps = findGaps(schedule, {});
    expect(gaps.filter(g => g.type === 'group')).toHaveLength(0);
  });

  // Z28-1: single-group with class-wide full-class on both sides → window.
  it('single-group between class-wide and two-group slot reports window', () => {
    // Lesson 3: class-wide, Lesson 4: group A only, Lesson 5: group A + group B
    const schedule: Schedule = {
      '9д': {
        'Пн': {
          3: {
            lessons: [
              { id: 'c3', requirementId: 'r3', subject: 'История', teacher: 'Сидорова Е.В.', room: '-220-' },
            ],
          },
          4: {
            lessons: [
              { id: 'a4', requirementId: 'r1', subject: 'Труд', teacher: 'Мажарова А.Д.', room: '-314-', group: '9д(М.Н.)' },
            ],
          },
          5: {
            lessons: [
              { id: 'a5', requirementId: 'r1', subject: 'Труд', teacher: 'Мажарова А.Д.', room: '-314-', group: '9д(М.Н.)' },
              { id: 'b5', requirementId: 'r2', subject: 'Труд', teacher: 'Тимофеева В.С.', room: '-313-', group: '9д(Т.В.)' },
            ],
          },
        },
      },
    };

    const gaps = findGaps(schedule, {});
    const groupGaps = gaps.filter(g => g.type === 'group');
    // Group 9д(Т.В.) has a window at lesson 4 (absent while partner is present, between full-class 3 and 5)
    expect(groupGaps.some(g => g.name === '9д(Т.В.)' && g.lessonNum === 4)).toBe(true);
    // Group 9д(М.Н.) has NO window (it is present at lesson 4)
    expect(groupGaps.some(g => g.name === '9д(М.Н.)')).toBe(false);
  });

  // Groups from different subject splits are NOT compared to each other.
  it('groups from different splits (different subject divisons) do not create cross-split false windows', () => {
    // Lesson 3: Info group A only, Lesson 5: Физра group X + Физра group Y
    // Info group A is not paired with Физра groups → no group window
    const schedule: Schedule = {
      '11б': {
        'Пт': {
          3: {
            lessons: [
              { id: 'i3', requirementId: 'r1', subject: 'Инф', teacher: 'Иванова Т.С.', room: '-114-', group: '11б(А.М.)' },
            ],
          },
          4: {
            lessons: [
              { id: 'c4', requirementId: 'r3', subject: 'История', teacher: 'Сидорова Е.В.', room: '-220-' },
            ],
          },
          5: {
            lessons: [
              { id: 'x5', requirementId: 'r4', subject: 'Физ-ра', teacher: 'Козлов П.А.', room: '-спорт-', group: '11б(м)' },
              { id: 'y5', requirementId: 'r5', subject: 'Физ-ра', teacher: 'Макарова С.Б.', room: '-спорт-', group: '11б(ж)' },
            ],
          },
        },
      },
    };

    const gaps = findGaps(schedule, {});
    const groupGaps = gaps.filter(g => g.type === 'group');
    // No cross-split false windows: 11б(А.М.) never appears with (м) or (ж) in same slot, so no pair
    expect(groupGaps.some(g => g.name === '11б(м)' || g.name === '11б(ж)')).toBe(false);
  });

  it('does not create group gaps when no groups exist', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Математика', teacher: 'Иванова Т.С.', room: '-114-' }] },
          3: { lessons: [{ id: 'l2', requirementId: 'r2', subject: 'Физика', teacher: 'Петрова А.П.', room: '-115-' }] },
        },
      },
    };
    const gaps = findGaps(schedule, {});
    expect(gaps.filter(g => g.type === 'group')).toHaveLength(0);
    // Regular class gap still detected
    expect(gaps.filter(g => g.type === 'class' && g.lessonNum === 2)).toHaveLength(1);
  });

  it('Z31-5 regression: detects group gaps using Groups table when groups never share a slot', () => {
    // Real-world case: groups are at DIFFERENT lesson numbers (never co-appear in one slot).
    // The dynamic slot-based discovery would miss this pair entirely.
    // The Groups table is the only authority.
    const schedule: Schedule = {
      '7е': {
        'Пн': {
          // Lesson 1: full-class (no group)
          1: { lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Математика', teacher: 'Иванова Т.С.', room: '101', group: undefined }] },
          // Lesson 2: only group А (Т.В.) — group Б is absent → window for Б
          2: { lessons: [{ id: 'l2', requirementId: 'r2', subject: 'Английский', teacher: 'Петрова А.П.', room: '201', group: '7е(Т.В.)' }] },
          // Lesson 3: only group Б (С.П.) — group А is absent (not a window — no full-class after)
          3: { lessons: [{ id: 'l3', requirementId: 'r3', subject: 'Английский', teacher: 'Сидорова Е.В.', room: '202', group: '7е(С.П.)' }] },
          // Lesson 4: full-class (no group)
          4: { lessons: [{ id: 'l4', requirementId: 'r4', subject: 'Физика', teacher: 'Петрова А.П.', room: '101', group: undefined }] },
        },
      },
    };

    const groups: Group[] = [
      { id: 'g1', name: '7е(Т.В.)', className: '7е', index: '(Т.В.)', parallelGroup: '7е(С.П.)' },
      { id: 'g2', name: '7е(С.П.)', className: '7е', index: '(С.П.)', parallelGroup: '7е(Т.В.)' },
    ];

    // Without groups table — pair not discoverable, no group gaps
    const gapsNoTable = findGaps(schedule, {});
    expect(gapsNoTable.filter(g => g.type === 'group')).toHaveLength(0);

    // With groups table — pair known, window for 7е(С.П.) at lesson 2 detected
    const gapsWithTable = findGaps(schedule, {}, undefined, groups);
    const groupGaps = gapsWithTable.filter(g => g.type === 'group');
    expect(groupGaps.some(g => g.name === '7е(С.П.)' && g.lessonNum === 2)).toBe(true);
  });
});
