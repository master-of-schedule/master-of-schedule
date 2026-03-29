/**
 * Tests for counting functions
 */

import { describe, it, expect } from 'vitest';
import {
  getLessonKey,
  getScheduledCounts,
  getUnscheduledLessons,
  getTotalUnscheduledCount,
  isClassFullyScheduled,
  getClassProgress,
  getLessonsPerDay,
  getTeacherLessonsPerDay,
  getTeacherLessonsOnDay,
  getRoomLessonsOnDay,
  getTeachersOnDay,
  mergeWithTemporaryLessons,
} from './counting';
import type { Schedule, LessonRequirement, ScheduledLesson } from '@/types';

// Test fixtures
const createLesson = (overrides: Partial<ScheduledLesson> = {}): ScheduledLesson => ({
  id: 'l1',
  requirementId: 'r1',
  subject: 'Математика',
  teacher: 'Иванова Т.С.',
  room: '-114-',
  ...overrides,
});

const createRequirement = (overrides: Partial<LessonRequirement> = {}): LessonRequirement => ({
  id: 'req-1',
  type: 'class',
  classOrGroup: '10а',
  subject: 'Математика',
  teacher: 'Иванова Т.С.',
  countPerWeek: 5,
  ...overrides,
});

const createTestSchedule = (): Schedule => ({
  '10а': {
    'Пн': {
      1: { lessons: [createLesson()] },
      2: { lessons: [createLesson({ id: 'l2' })] },
      3: { lessons: [] },
      4: { lessons: [] },
      5: { lessons: [] },
      6: { lessons: [] },
      7: { lessons: [] },
      8: { lessons: [] },
    },
    'Вт': {
      1: { lessons: [createLesson({ id: 'l3' })] },
      2: { lessons: [] },
      3: { lessons: [] },
      4: { lessons: [] },
      5: { lessons: [] },
      6: { lessons: [] },
      7: { lessons: [] },
      8: { lessons: [] },
    },
    'Ср': {
      1: { lessons: [] },
      2: { lessons: [] },
      3: { lessons: [] },
      4: { lessons: [] },
      5: { lessons: [] },
      6: { lessons: [] },
      7: { lessons: [] },
      8: { lessons: [] },
    },
    'Чт': {
      1: { lessons: [] },
      2: { lessons: [] },
      3: { lessons: [] },
      4: { lessons: [] },
      5: { lessons: [] },
      6: { lessons: [] },
      7: { lessons: [] },
      8: { lessons: [] },
    },
    'Пт': {
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

describe('getLessonKey', () => {
  it('creates key for class lesson', () => {
    const key = getLessonKey({ subject: 'Математика', teacher: 'Иванова Т.С.' });
    expect(key).toBe('Математика|Иванова Т.С.');
  });

  it('creates key for group lesson', () => {
    const key = getLessonKey({ subject: 'Английский', teacher: 'Петрова А.П.', group: '10а(1)' });
    expect(key).toBe('Английский|Петрова А.П.|10а(1)');
  });
});

describe('getScheduledCounts', () => {
  it('counts lessons correctly', () => {
    const schedule = createTestSchedule();
    const counts = getScheduledCounts(schedule, '10а');

    expect(counts.get('Математика|Иванова Т.С.')).toBe(3);
  });

  it('returns empty map for non-existent class', () => {
    const schedule = createTestSchedule();
    const counts = getScheduledCounts(schedule, '11б');

    expect(counts.size).toBe(0);
  });

  it('returns empty map for empty schedule', () => {
    const counts = getScheduledCounts({}, '10а');
    expect(counts.size).toBe(0);
  });

  it('counts different lessons separately', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [createLesson({ subject: 'Математика' })] },
          2: { lessons: [createLesson({ id: 'l2', subject: 'Физика', teacher: 'Петрова А.П.' })] },
          3: { lessons: [] },
          4: { lessons: [] },
          5: { lessons: [] },
          6: { lessons: [] },
          7: { lessons: [] },
          8: { lessons: [] },
        },
      },
    };

    const counts = getScheduledCounts(schedule, '10а');

    expect(counts.get('Математика|Иванова Т.С.')).toBe(1);
    expect(counts.get('Физика|Петрова А.П.')).toBe(1);
  });
});

describe('getUnscheduledLessons', () => {
  it('returns lessons that need more scheduling', () => {
    const schedule = createTestSchedule(); // Has 3 Math lessons
    const requirements = [
      createRequirement({ countPerWeek: 5 }), // Need 5, have 3
    ];

    const unscheduled = getUnscheduledLessons(requirements, schedule, '10а');

    expect(unscheduled).toHaveLength(1);
    expect(unscheduled[0].remaining).toBe(2);
  });

  it('returns empty for fully scheduled class', () => {
    const schedule = createTestSchedule(); // Has 3 Math lessons
    const requirements = [
      createRequirement({ countPerWeek: 3 }), // Need 3, have 3
    ];

    const unscheduled = getUnscheduledLessons(requirements, schedule, '10а');

    expect(unscheduled).toHaveLength(0);
  });

  it('filters requirements by class', () => {
    const schedule = createTestSchedule();
    const requirements = [
      createRequirement({ id: 'r1', classOrGroup: '10а', countPerWeek: 5 }),
      createRequirement({ id: 'r2', classOrGroup: '10б', countPerWeek: 3 }),
    ];

    const unscheduled = getUnscheduledLessons(requirements, schedule, '10а');

    expect(unscheduled).toHaveLength(1);
    expect(unscheduled[0].requirement.classOrGroup).toBe('10а');
  });

  it('handles group lessons', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [createLesson({ subject: 'Английский', group: '10а(1)' })] },
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

    const requirements: LessonRequirement[] = [
      {
        id: 'r1',
        type: 'group',
        classOrGroup: '10а(1)',
        className: '10а',
        subject: 'Английский',
        teacher: 'Иванова Т.С.',
        countPerWeek: 3,
      },
    ];

    const unscheduled = getUnscheduledLessons(requirements, schedule, '10а');

    expect(unscheduled).toHaveLength(1);
    expect(unscheduled[0].remaining).toBe(2);
  });
});

describe('getTotalUnscheduledCount', () => {
  it('returns total remaining lessons', () => {
    const schedule = createTestSchedule(); // Has 3 Math lessons
    const requirements = [
      createRequirement({ id: 'r1', subject: 'Математика', countPerWeek: 5 }), // Need 2 more
      createRequirement({ id: 'r2', subject: 'Физика', teacher: 'Петрова А.П.', countPerWeek: 3 }), // Need 3 more
    ];

    const total = getTotalUnscheduledCount(requirements, schedule, '10а');

    expect(total).toBe(5); // 2 + 3
  });

  it('returns 0 for fully scheduled', () => {
    const schedule = createTestSchedule();
    const requirements = [
      createRequirement({ countPerWeek: 3 }),
    ];

    const total = getTotalUnscheduledCount(requirements, schedule, '10а');

    expect(total).toBe(0);
  });
});

describe('isClassFullyScheduled', () => {
  it('returns true when all lessons scheduled', () => {
    const schedule = createTestSchedule();
    const requirements = [createRequirement({ countPerWeek: 3 })];

    expect(isClassFullyScheduled(requirements, schedule, '10а')).toBe(true);
  });

  it('returns false when lessons remaining', () => {
    const schedule = createTestSchedule();
    const requirements = [createRequirement({ countPerWeek: 5 })];

    expect(isClassFullyScheduled(requirements, schedule, '10а')).toBe(false);
  });
});

describe('getClassProgress', () => {
  it('calculates progress correctly', () => {
    const schedule = createTestSchedule(); // Has 3 Math lessons
    const requirements = [createRequirement({ countPerWeek: 5 })];

    const progress = getClassProgress(requirements, schedule, '10а');

    expect(progress.className).toBe('10а');
    expect(progress.totalRequired).toBe(5);
    expect(progress.totalScheduled).toBe(3);
    expect(progress.percentage).toBe(60);
  });

  it('returns 100% for fully scheduled', () => {
    const schedule = createTestSchedule();
    const requirements = [createRequirement({ countPerWeek: 3 })];

    const progress = getClassProgress(requirements, schedule, '10а');

    expect(progress.percentage).toBe(100);
  });

  it('returns 100% when no requirements', () => {
    const schedule = createTestSchedule();
    const requirements: LessonRequirement[] = [];

    const progress = getClassProgress(requirements, schedule, '10а');

    expect(progress.percentage).toBe(100);
  });
});

describe('getLessonsPerDay', () => {
  it('counts lessons per day correctly', () => {
    const schedule = createTestSchedule();
    const counts = getLessonsPerDay(schedule, '10а');

    expect(counts.get('Пн')).toBe(2);
    expect(counts.get('Вт')).toBe(1);
    expect(counts.get('Ср')).toBe(0);
  });

  it('returns empty map for non-existent class', () => {
    const schedule = createTestSchedule();
    const counts = getLessonsPerDay(schedule, '11б');

    expect(counts.size).toBe(0);
  });
});

describe('getTeacherLessonsPerDay', () => {
  it('counts teacher lessons per day', () => {
    const schedule = createTestSchedule();
    const counts = getTeacherLessonsPerDay(schedule, 'Иванова Т.С.');

    expect(counts.get('Пн')).toBe(2);
    expect(counts.get('Вт')).toBe(1);
  });

  it('returns empty for teacher not in schedule', () => {
    const schedule = createTestSchedule();
    const counts = getTeacherLessonsPerDay(schedule, 'Петрова А.П.');

    expect(counts.size).toBe(0);
  });

  it('counts across multiple classes', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [createLesson()] },
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
          2: { lessons: [createLesson({ id: 'l2' })] },
          3: { lessons: [] },
          4: { lessons: [] },
          5: { lessons: [] },
          6: { lessons: [] },
          7: { lessons: [] },
          8: { lessons: [] },
        },
      },
    };

    const counts = getTeacherLessonsPerDay(schedule, 'Иванова Т.С.');

    expect(counts.get('Пн')).toBe(2);
  });

  it('counts lessons where teacher is teacher2', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [createLesson({ teacher: 'Иванова Т.С.', teacher2: 'Петрова А.П.' })] },
          2: { lessons: [] }, 3: { lessons: [] }, 4: { lessons: [] },
          5: { lessons: [] }, 6: { lessons: [] }, 7: { lessons: [] }, 8: { lessons: [] },
        },
      },
    };

    const counts = getTeacherLessonsPerDay(schedule, 'Петрова А.П.');
    expect(counts.get('Пн')).toBe(1);
  });
});

describe('getTeacherLessonsOnDay', () => {
  it('returns teacher lessons on a specific day', () => {
    const schedule = createTestSchedule(); // Иванова has Пн:1, Пн:2, Вт:1
    const result = getTeacherLessonsOnDay(schedule, 'Иванова Т.С.', 'Пн');

    expect(result).toHaveLength(2);
    expect(result[0].lessonNum).toBe(1);
    expect(result[0].className).toBe('10а');
    expect(result[1].lessonNum).toBe(2);
  });

  it('returns empty for day with no lessons', () => {
    const schedule = createTestSchedule();
    const result = getTeacherLessonsOnDay(schedule, 'Иванова Т.С.', 'Ср');

    expect(result).toHaveLength(0);
  });

  it('returns empty for unknown teacher', () => {
    const schedule = createTestSchedule();
    const result = getTeacherLessonsOnDay(schedule, 'Петрова А.П.', 'Пн');

    expect(result).toHaveLength(0);
  });

  it('finds lessons across multiple classes', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [createLesson()] },
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
          2: { lessons: [createLesson({ id: 'l2' })] },
          3: { lessons: [] },
          4: { lessons: [] },
          5: { lessons: [] },
          6: { lessons: [] },
          7: { lessons: [] },
          8: { lessons: [] },
        },
      },
    };

    const result = getTeacherLessonsOnDay(schedule, 'Иванова Т.С.', 'Пн');

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ className: '10а', lessonNum: 1 });
    expect(result[1]).toMatchObject({ className: '10б', lessonNum: 2 });
  });

  it('sorts by lesson number then class name', () => {
    const schedule: Schedule = {
      '10б': {
        'Пн': {
          1: { lessons: [createLesson({ id: 'l1' })] },
          2: { lessons: [] }, 3: { lessons: [] }, 4: { lessons: [] },
          5: { lessons: [] }, 6: { lessons: [] }, 7: { lessons: [] }, 8: { lessons: [] },
        },
      },
      '10а': {
        'Пн': {
          1: { lessons: [createLesson({ id: 'l2' })] },
          2: { lessons: [] }, 3: { lessons: [] }, 4: { lessons: [] },
          5: { lessons: [] }, 6: { lessons: [] }, 7: { lessons: [] }, 8: { lessons: [] },
        },
      },
    };

    const result = getTeacherLessonsOnDay(schedule, 'Иванова Т.С.', 'Пн');

    expect(result).toHaveLength(2);
    // Same lesson number, sorted by class name
    expect(result[0].className).toBe('10а');
    expect(result[1].className).toBe('10б');
  });

  it('includes lessons where teacher is teacher2', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [createLesson({ teacher: 'Иванова Т.С.', teacher2: 'Петрова А.П.' })] },
          2: { lessons: [] }, 3: { lessons: [] }, 4: { lessons: [] },
          5: { lessons: [] }, 6: { lessons: [] }, 7: { lessons: [] }, 8: { lessons: [] },
        },
      },
    };

    const result = getTeacherLessonsOnDay(schedule, 'Петрова А.П.', 'Пн');
    expect(result).toHaveLength(1);
    expect(result[0].className).toBe('10а');
    expect(result[0].lessonNum).toBe(1);
  });
});

describe('getRoomLessonsOnDay', () => {
  it('returns lessons using the room on the specified day', () => {
    const schedule: Schedule = {
      '5а': { Пн: { 1: { lessons: [{ subject: 'Математика', teacher: 'Иванов', room: '101', id: 'a', type: 'regular' }] } } },
      '5б': { Пн: { 2: { lessons: [{ subject: 'Физика', teacher: 'Петров', room: '101', id: 'b', type: 'regular' }] } } },
      '6а': { Пн: { 1: { lessons: [{ subject: 'Биология', teacher: 'Сидоров', room: '202', id: 'c', type: 'regular' }] } } },
    };
    const result = getRoomLessonsOnDay(schedule, '101', 'Пн');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ className: '5а', lessonNum: 1 });
    expect(result[1]).toMatchObject({ className: '5б', lessonNum: 2 });
  });

  it('returns empty for a day with no lessons in that room', () => {
    const schedule: Schedule = {
      '5а': { Пн: { 1: { lessons: [{ subject: 'Математика', teacher: 'Иванов', room: '101', id: 'a', type: 'regular' }] } } },
    };
    expect(getRoomLessonsOnDay(schedule, '101', 'Вт')).toHaveLength(0);
  });

  it('returns empty for unknown room', () => {
    const schedule: Schedule = {
      '5а': { Пн: { 1: { lessons: [{ subject: 'Математика', teacher: 'Иванов', room: '101', id: 'a', type: 'regular' }] } } },
    };
    expect(getRoomLessonsOnDay(schedule, '999', 'Пн')).toHaveLength(0);
  });

  it('sorts by lessonNum then className', () => {
    const schedule: Schedule = {
      '10б': { Пн: { 1: { lessons: [{ subject: 'Хим', teacher: 'А', room: '5', id: 'x', type: 'regular' }] } } },
      '10а': { Пн: { 1: { lessons: [{ subject: 'Физ', teacher: 'Б', room: '5', id: 'y', type: 'regular' }] } } },
    };
    const result = getRoomLessonsOnDay(schedule, '5', 'Пн');
    expect(result[0].className).toBe('10а');
    expect(result[1].className).toBe('10б');
  });
});

describe('mergeWithTemporaryLessons', () => {
  it('returns original requirements when no temporary lessons', () => {
    const reqs = [createRequirement()];
    const result = mergeWithTemporaryLessons(reqs, []);
    expect(result).toBe(reqs); // same reference, no copy
  });

  it('increases countPerWeek when temporary lesson matches existing requirement', () => {
    const reqs = [createRequirement({ countPerWeek: 3 })];
    const temp = [createRequirement({ id: 'temp-1', countPerWeek: 1 })];

    const result = mergeWithTemporaryLessons(reqs, temp);

    expect(result).toHaveLength(1);
    expect(result[0].countPerWeek).toBe(4);
  });

  it('does not mutate original requirements', () => {
    const reqs = [createRequirement({ countPerWeek: 3 })];
    const temp = [createRequirement({ id: 'temp-1', countPerWeek: 1 })];

    mergeWithTemporaryLessons(reqs, temp);

    expect(reqs[0].countPerWeek).toBe(3);
  });

  it('adds new entry when temporary lesson has no matching requirement', () => {
    const reqs = [createRequirement()];
    const temp = [createRequirement({
      id: 'temp-1',
      subject: 'Физика',
      teacher: 'Петрова А.П.',
      countPerWeek: 2,
    })];

    const result = mergeWithTemporaryLessons(reqs, temp);

    expect(result).toHaveLength(2);
    expect(result[1].subject).toBe('Физика');
    expect(result[1].countPerWeek).toBe(2);
  });

  it('matches by classOrGroup in addition to lesson key', () => {
    const reqs = [createRequirement({ classOrGroup: '10а', countPerWeek: 3 })];
    const temp = [createRequirement({
      id: 'temp-1',
      classOrGroup: '10б', // different class, same subject+teacher
      countPerWeek: 1,
    })];

    const result = mergeWithTemporaryLessons(reqs, temp);

    // Should add as new entry, not merge
    expect(result).toHaveLength(2);
    expect(result[0].countPerWeek).toBe(3);
    expect(result[1].classOrGroup).toBe('10б');
  });

  it('does not mutate temporary lesson objects (frozen by immer)', () => {
    // Regression test for Z14-2: crash when adding duplicate temp lesson.
    // When a temp lesson has no base match, it was pushed by reference.
    // A second temp with the same key tried to mutate the frozen object → TypeError.
    const reqs = [createRequirement({ countPerWeek: 3 })];
    const temp1 = createRequirement({
      id: 'temp-1',
      subject: 'Физика',
      teacher: 'Петрова А.П.',
      countPerWeek: 1,
    });
    const temp2 = createRequirement({
      id: 'temp-2',
      subject: 'Физика',
      teacher: 'Петрова А.П.',
      countPerWeek: 1,
    });

    // Simulate immer freezing the objects
    Object.freeze(temp1);
    Object.freeze(temp2);

    // Should NOT throw TypeError: Cannot assign to read only property
    const result = mergeWithTemporaryLessons(reqs, [temp1, temp2]);

    expect(result).toHaveLength(2); // original Math + merged Physics
    const physics = result.find(r => r.subject === 'Физика');
    expect(physics?.countPerWeek).toBe(2); // 1 + 1
    // Original objects must not be mutated
    expect(temp1.countPerWeek).toBe(1);
    expect(temp2.countPerWeek).toBe(1);
  });

  it('handles multiple temporary lessons for different subjects', () => {
    const reqs = [createRequirement({ countPerWeek: 3 })];
    const temp = [
      createRequirement({ id: 'temp-1', countPerWeek: 1 }), // matches existing
      createRequirement({ id: 'temp-2', subject: 'Физика', teacher: 'Петрова А.П.', countPerWeek: 2 }), // new
    ];

    const result = mergeWithTemporaryLessons(reqs, temp);

    expect(result).toHaveLength(2);
    expect(result[0].countPerWeek).toBe(4); // 3 + 1
    expect(result[1].subject).toBe('Физика');
    expect(result[1].countPerWeek).toBe(2);
  });
});

describe('mergeWithTemporaryLessons + getUnscheduledLessons integration', () => {
  it('temporary lesson creates remaining when existing requirement is fully scheduled', () => {
    // Schedule has 3 Math lessons placed for 10а
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [createLesson()] },
          2: { lessons: [createLesson({ id: 'l2' })] },
          3: { lessons: [createLesson({ id: 'l3' })] },
          4: { lessons: [] }, 5: { lessons: [] }, 6: { lessons: [] }, 7: { lessons: [] }, 8: { lessons: [] },
        },
      },
    };

    // Base requirement: 3/week (fully scheduled)
    const reqs = [createRequirement({ countPerWeek: 3 })];
    const tempLessons = [createRequirement({ id: 'temp-1', countPerWeek: 1 })];

    // Without temporary: fully scheduled, nothing unscheduled
    const withoutTemp = getUnscheduledLessons(reqs, schedule, '10а');
    expect(withoutTemp).toHaveLength(0);

    // With temporary: 4 required, 3 scheduled → 1 remaining
    const merged = mergeWithTemporaryLessons(reqs, tempLessons);
    const withTemp = getUnscheduledLessons(merged, schedule, '10а');
    expect(withTemp).toHaveLength(1);
    expect(withTemp[0].remaining).toBe(1);
  });

  it('temporary lesson for new subject appears as unscheduled', () => {
    const schedule: Schedule = { '10а': {} };

    const reqs = [createRequirement({ countPerWeek: 3 })];
    const tempLessons = [createRequirement({
      id: 'temp-1',
      subject: 'Физика',
      teacher: 'Петрова А.П.',
      countPerWeek: 2,
    })];

    const merged = mergeWithTemporaryLessons(reqs, tempLessons);
    const unscheduled = getUnscheduledLessons(merged, schedule, '10а');

    // Both original (3 remaining) and temp (2 remaining) should appear
    expect(unscheduled).toHaveLength(2);
    const math = unscheduled.find(u => u.requirement.subject === 'Математика');
    const physics = unscheduled.find(u => u.requirement.subject === 'Физика');
    expect(math?.remaining).toBe(3);
    expect(physics?.remaining).toBe(2);
  });

  it('merged temp entry uses original requirement ID, not temp ID (regression: Z22-2)', () => {
    // Reproduces the bug: when a temp lesson matches an existing requirement, mergeWithTemporaryLessons
    // puts the merged count on the original entry (original ID). UnscheduledPanel's "ensure
    // visibility" loop must detect this by getLessonKey comparison, not by temp.id lookup.
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [createLesson()] },
          2: { lessons: [createLesson({ id: 'l2' })] },
          3: { lessons: [createLesson({ id: 'l3' })] },
          4: { lessons: [] }, 5: { lessons: [] }, 6: { lessons: [] }, 7: { lessons: [] }, 8: { lessons: [] },
        },
      },
    };
    const reqs = [createRequirement({ id: 'orig-1', countPerWeek: 3 })];
    const tempLessons = [createRequirement({ id: 'temp-1', countPerWeek: 1 })];
    const merged = mergeWithTemporaryLessons(reqs, tempLessons);
    const unscheduled = getUnscheduledLessons(merged, schedule, '10а');

    // Exactly one entry with remaining=1
    expect(unscheduled).toHaveLength(1);
    expect(unscheduled[0].remaining).toBe(1);

    // Entry uses ORIGINAL requirement ID (not temp ID)
    expect(unscheduled[0].requirement.id).toBe('orig-1');
    expect(unscheduled[0].requirement.id).not.toBe('temp-1');

    // Therefore: checking list.some(item => item.id === 'temp-1') = false → fix needed
    const tempFoundById = unscheduled.some(u => u.requirement.id === 'temp-1');
    expect(tempFoundById).toBe(false);

    // getLessonKey correctly identifies the merged entry for the fix
    const tempKey = getLessonKey({ subject: 'Математика', teacher: 'Иванова Т.С.' });
    const originalKey = getLessonKey({ subject: unscheduled[0].requirement.subject, teacher: unscheduled[0].requirement.teacher });
    expect(originalKey).toBe(tempKey);
  });

  it('temporary lesson for different class does not affect current class', () => {
    const schedule: Schedule = { '10а': {}, '10б': {} };

    const reqs = [createRequirement({ classOrGroup: '10а', countPerWeek: 3 })];
    const tempLessons = [createRequirement({
      id: 'temp-1',
      classOrGroup: '10б',
      countPerWeek: 1,
    })];

    const merged = mergeWithTemporaryLessons(reqs, tempLessons);

    // 10а should only see its own 3 remaining
    const unscheduled10a = getUnscheduledLessons(merged, schedule, '10а');
    expect(unscheduled10a).toHaveLength(1);
    expect(unscheduled10a[0].remaining).toBe(3);

    // 10б should see the temp lesson's 1 remaining
    const unscheduled10b = getUnscheduledLessons(merged, schedule, '10б');
    expect(unscheduled10b).toHaveLength(1);
    expect(unscheduled10b[0].remaining).toBe(1);
  });
});

describe('getTeachersOnDay', () => {
  it('returns all teachers with lessons on the given day', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [createLesson({ teacher: 'Иванова Т.С.' })] },
          2: { lessons: [createLesson({ id: 'l2', teacher: 'Петрова А.П.' })] },
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
          1: { lessons: [createLesson({ id: 'l3', teacher: 'Сидорова М.К.' })] },
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

    const result = getTeachersOnDay(schedule, 'Пн');
    expect(result.size).toBe(3);
    expect(result.has('Иванова Т.С.')).toBe(true);
    expect(result.has('Петрова А.П.')).toBe(true);
    expect(result.has('Сидорова М.К.')).toBe(true);
  });

  it('does not include teachers from other days', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [createLesson({ teacher: 'Иванова Т.С.' })] },
          2: { lessons: [] }, 3: { lessons: [] }, 4: { lessons: [] },
          5: { lessons: [] }, 6: { lessons: [] }, 7: { lessons: [] }, 8: { lessons: [] },
        },
        'Вт': {
          1: { lessons: [createLesson({ id: 'l2', teacher: 'Петрова А.П.' })] },
          2: { lessons: [] }, 3: { lessons: [] }, 4: { lessons: [] },
          5: { lessons: [] }, 6: { lessons: [] }, 7: { lessons: [] }, 8: { lessons: [] },
        },
      },
    };

    const result = getTeachersOnDay(schedule, 'Вт');
    expect(result.size).toBe(1);
    expect(result.has('Петрова А.П.')).toBe(true);
    expect(result.has('Иванова Т.С.')).toBe(false);
  });

  it('returns empty set for empty schedule', () => {
    const result = getTeachersOnDay({}, 'Пн');
    expect(result.size).toBe(0);
  });

  it('deduplicates teachers with multiple lessons', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [createLesson({ teacher: 'Иванова Т.С.' })] },
          2: { lessons: [createLesson({ id: 'l2', teacher: 'Иванова Т.С.' })] },
          3: { lessons: [] }, 4: { lessons: [] },
          5: { lessons: [] }, 6: { lessons: [] }, 7: { lessons: [] }, 8: { lessons: [] },
        },
      },
    };

    const result = getTeachersOnDay(schedule, 'Пн');
    expect(result.size).toBe(1);
    expect(result.has('Иванова Т.С.')).toBe(true);
  });

  it('includes teacher2 in results', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [createLesson({ teacher: 'Иванова Т.С.', teacher2: 'Петрова А.П.' })] },
          2: { lessons: [] }, 3: { lessons: [] }, 4: { lessons: [] },
          5: { lessons: [] }, 6: { lessons: [] }, 7: { lessons: [] }, 8: { lessons: [] },
        },
      },
    };

    const result = getTeachersOnDay(schedule, 'Пн');
    expect(result.size).toBe(2);
    expect(result.has('Иванова Т.С.')).toBe(true);
    expect(result.has('Петрова А.П.')).toBe(true);
  });
});
