/**
 * Tests for availability functions
 */

import { describe, it, expect } from 'vitest';
import {
  getOccupiedRooms,
  getAvailableRooms,
  isRoomAvailable,
  getTeacherClassesAtTime,
  getAvailableLessonsForSlot,
  getSubstituteTeachers,
  getFreeTeachersAtSlot,
} from './availability';
import type { Schedule, Room, Teacher, LessonRequirement, SchoolClass } from '@/types';

// Test fixtures
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
      1: {
        lessons: [{
          id: 'l2',
          requirementId: 'r2',
          subject: 'Физика',
          teacher: 'Петрова А.П.',
          room: '-205-',
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
});

const createTestRooms = (): Record<string, Room> => ({
  '-114-': {
    id: 'room1',
    fullName: '114 Математика',
    shortName: '-114-',
    capacity: 30,
  },
  '-205-': {
    id: 'room2',
    fullName: '205 Физика',
    shortName: '-205-',
    capacity: 25,
  },
  '-301-': {
    id: 'room3',
    fullName: '301 Химия',
    shortName: '-301-',
    capacity: 28,
  },
  '-СЗ-': {
    id: 'room4',
    fullName: 'Спортзал',
    shortName: '-СЗ-',
    capacity: 60,
    multiClass: 2, // Can hold 2 classes at once
  },
});

describe('getOccupiedRooms', () => {
  it('returns occupied rooms at given time', () => {
    const schedule = createTestSchedule();
    const occupied = getOccupiedRooms(schedule, 'Пн', 1);

    expect(occupied.has('-114-')).toBe(true);
    expect(occupied.has('-205-')).toBe(true);
    expect(occupied.has('-301-')).toBe(false);
  });

  it('returns empty set for free time slot', () => {
    const schedule = createTestSchedule();
    const occupied = getOccupiedRooms(schedule, 'Пн', 2);

    expect(occupied.size).toBe(0);
  });

  it('returns empty set for empty schedule', () => {
    const occupied = getOccupiedRooms({}, 'Пн', 1);
    expect(occupied.size).toBe(0);
  });
});

describe('getAvailableRooms', () => {
  it('returns rooms not in use', () => {
    const schedule = createTestSchedule();
    const rooms = createTestRooms();
    const available = getAvailableRooms(schedule, rooms, 'Пн', 1);

    const availableShortNames = available.map(r => r.shortName);
    expect(availableShortNames).toContain('-301-');
    expect(availableShortNames).toContain('-СЗ-');
    expect(availableShortNames).not.toContain('-114-');
    expect(availableShortNames).not.toContain('-205-');
  });

  it('returns all rooms for empty time slot', () => {
    const schedule = createTestSchedule();
    const rooms = createTestRooms();
    const available = getAvailableRooms(schedule, rooms, 'Пн', 2);

    expect(available).toHaveLength(4);
  });

  it('considers multiClass rooms', () => {
    // Gym is used once but can hold 2 classes
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Физкультура',
              teacher: 'Смирнов А.А.',
              room: '-СЗ-',
            }],
          },
        },
      },
    };

    const rooms = createTestRooms();
    const available = getAvailableRooms(schedule, rooms, 'Пн', 1);

    // Gym should still be available (1 of 2 slots used)
    const availableShortNames = available.map(r => r.shortName);
    expect(availableShortNames).toContain('-СЗ-');
  });

  it('marks multiClass room as unavailable when full', () => {
    // Gym used by 2 classes
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Физкультура',
              teacher: 'Смирнов А.А.',
              room: '-СЗ-',
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
              subject: 'Физкультура',
              teacher: 'Козлова И.В.',
              room: '-СЗ-',
            }],
          },
        },
      },
    };

    const rooms = createTestRooms();
    const available = getAvailableRooms(schedule, rooms, 'Пн', 1);

    // Gym should NOT be available (2 of 2 slots used)
    const availableShortNames = available.map(r => r.shortName);
    expect(availableShortNames).not.toContain('-СЗ-');
  });

  it('sorts rooms by full name', () => {
    const schedule = createTestSchedule();
    const rooms = createTestRooms();
    const available = getAvailableRooms(schedule, rooms, 'Пн', 2);

    // Check that rooms are sorted alphabetically by fullName
    for (let i = 1; i < available.length; i++) {
      expect(available[i - 1].fullName.localeCompare(available[i].fullName, 'ru')).toBeLessThanOrEqual(0);
    }
  });
});

describe('isRoomAvailable', () => {
  it('returns true for available room', () => {
    const schedule = createTestSchedule();
    const rooms = createTestRooms();

    expect(isRoomAvailable(schedule, rooms, '-301-', 'Пн', 1)).toBe(true);
  });

  it('returns false for occupied room', () => {
    const schedule = createTestSchedule();
    const rooms = createTestRooms();

    expect(isRoomAvailable(schedule, rooms, '-114-', 'Пн', 1)).toBe(false);
  });

  it('returns false for unknown room', () => {
    const schedule = createTestSchedule();
    const rooms = createTestRooms();

    expect(isRoomAvailable(schedule, rooms, '-999-', 'Пн', 1)).toBe(false);
  });

  it('considers multiClass for availability', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Физкультура',
              teacher: 'Смирнов А.А.',
              room: '-СЗ-',
            }],
          },
        },
      },
    };

    const rooms = createTestRooms();

    // Gym used once but can hold 2 - should be available
    expect(isRoomAvailable(schedule, rooms, '-СЗ-', 'Пн', 1)).toBe(true);
  });
});

describe('getTeacherClassesAtTime', () => {
  it('returns classes where teacher has lessons', () => {
    const schedule = createTestSchedule();
    const classes = getTeacherClassesAtTime(schedule, 'Иванова Т.С.', 'Пн', 1);

    expect(classes).toHaveLength(1);
    expect(classes[0].className).toBe('10а');
    expect(classes[0].subject).toBe('Математика');
    expect(classes[0].room).toBe('-114-');
  });

  it('returns empty array when teacher is free', () => {
    const schedule = createTestSchedule();
    const classes = getTeacherClassesAtTime(schedule, 'Иванова Т.С.', 'Пн', 2);

    expect(classes).toHaveLength(0);
  });

  it('returns multiple classes if teacher has parallel groups', () => {
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

    const classes = getTeacherClassesAtTime(schedule, 'Иванова Т.С.', 'Пн', 1);

    expect(classes).toHaveLength(2);
  });

  it('returns classes where teacher is teacher2', () => {
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

    const classes = getTeacherClassesAtTime(schedule, 'Петрова А.П.', 'Пн', 1);
    expect(classes).toHaveLength(1);
    expect(classes[0].className).toBe('10а');
    expect(classes[0].subject).toBe('Математика');
  });
});

// Test fixtures for getAvailableLessonsForSlot
const createTestTeachers = (): Record<string, Teacher> => ({
  'Иванова Т.С.': {
    id: 't1',
    name: 'Иванова Т.С.',
    subjects: ['Математика', 'Алгебра'],
    bans: {},
  },
  'Петрова А.П.': {
    id: 't2',
    name: 'Петрова А.П.',
    subjects: ['Физика'],
    bans: { 'Пн': [1, 2] }, // Banned on Monday lessons 1-2
  },
  'Сидорова М.К.': {
    id: 't3',
    name: 'Сидорова М.К.',
    subjects: ['Химия'],
    bans: {},
  },
});

const createTestRequirements = (): LessonRequirement[] => [
  {
    id: 'req1',
    type: 'class',
    classOrGroup: '10а',
    subject: 'Математика',
    teacher: 'Иванова Т.С.',
    countPerWeek: 4,
  },
  {
    id: 'req2',
    type: 'class',
    classOrGroup: '10а',
    subject: 'Физика',
    teacher: 'Петрова А.П.',
    countPerWeek: 3,
  },
  {
    id: 'req3',
    type: 'class',
    classOrGroup: '10а',
    subject: 'Химия',
    teacher: 'Сидорова М.К.',
    countPerWeek: 2,
  },
];

describe('getAvailableLessonsForSlot', () => {
  it('returns unscheduled lessons with free teachers', () => {
    const schedule: Schedule = {
      '10а': {
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
    };
    const teachers = createTestTeachers();
    const requirements = createTestRequirements();

    const result = getAvailableLessonsForSlot(
      requirements,
      schedule,
      teachers,
      '10а',
      'Пн',
      3 // Lesson 3 - no bans for any teacher
    );

    // All 3 lessons should be available
    expect(result.unscheduled).toHaveLength(3);
    expect(result.unscheduled.map(l => l.subject)).toContain('Математика');
    expect(result.unscheduled.map(l => l.subject)).toContain('Физика');
    expect(result.unscheduled.map(l => l.subject)).toContain('Химия');
  });

  it('excludes lessons with banned teachers', () => {
    const schedule: Schedule = {
      '10а': {
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
    };
    const teachers = createTestTeachers();
    const requirements = createTestRequirements();

    const result = getAvailableLessonsForSlot(
      requirements,
      schedule,
      teachers,
      '10а',
      'Пн',
      1 // Lesson 1 - Петрова banned
    );

    // Физика should NOT be available (teacher banned)
    expect(result.unscheduled.map(l => l.subject)).not.toContain('Физика');
    expect(result.unscheduled).toHaveLength(2);
  });

  it('excludes lessons with teachers busy elsewhere', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          3: { lessons: [] },
        },
      },
      '10б': {
        'Пн': {
          3: {
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
    const teachers = createTestTeachers();
    const requirements = createTestRequirements();

    const result = getAvailableLessonsForSlot(
      requirements,
      schedule,
      teachers,
      '10а',
      'Пн',
      3 // Lesson 3 - Иванова busy in 10б
    );

    // Математика should NOT be available (teacher busy in another class)
    expect(result.unscheduled.map(l => l.subject)).not.toContain('Математика');
  });

  it('returns movable lessons from other slots', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'req1',
              subject: 'Математика',
              teacher: 'Иванова Т.С.',
              room: '-114-',
            }],
          },
          3: { lessons: [] },
        },
      },
    };
    const teachers = createTestTeachers();
    // Math requirement fully scheduled (countPerWeek: 1, 1 scheduled)
    const requirements: LessonRequirement[] = [{
      id: 'req1',
      type: 'class',
      classOrGroup: '10а',
      subject: 'Математика',
      teacher: 'Иванова Т.С.',
      countPerWeek: 1, // Fully scheduled - no unscheduled remaining
    }];

    const result = getAvailableLessonsForSlot(
      requirements,
      schedule,
      teachers,
      '10а',
      'Пн',
      3 // Empty slot
    );

    // Math can be moved from lesson 1 to lesson 3
    // (no unscheduled remaining, so it appears in movable)
    expect(result.movable).toHaveLength(1);
    expect(result.movable[0].lesson.subject).toBe('Математика');
    expect(result.movable[0].fromDay).toBe('Пн');
    expect(result.movable[0].fromLessonNum).toBe(1);
  });

  it('returns empty result when no lessons available', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [] },
        },
      },
    };
    const teachers = createTestTeachers();
    // No requirements for this class
    const requirements: LessonRequirement[] = [];

    const result = getAvailableLessonsForSlot(
      requirements,
      schedule,
      teachers,
      '10а',
      'Пн',
      1
    );

    expect(result.unscheduled).toHaveLength(0);
    expect(result.movable).toHaveLength(0);
  });

  it('does not drop parallel group entries with same subject and teacher', () => {
    const schedule: Schedule = {
      '10а': {
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
    };

    const teachers: Record<string, Teacher> = {
      'Иванова Т.С.': {
        id: 't1',
        name: 'Иванова Т.С.',
        subjects: ['Английский'],
        bans: {},
      },
    };

    // Two parallel group requirements with same subject+teacher but different groups
    const requirements: LessonRequirement[] = [
      {
        id: 'req-g1',
        type: 'group',
        classOrGroup: '10а(д)',
        subject: 'Английский',
        teacher: 'Иванова Т.С.',
        countPerWeek: 3,
        parallelGroup: '10а(е)',
        className: '10а',
      },
      {
        id: 'req-g2',
        type: 'group',
        classOrGroup: '10а(е)',
        subject: 'Английский',
        teacher: 'Иванова Т.С.',
        countPerWeek: 3,
        parallelGroup: '10а(д)',
        className: '10а',
      },
    ];

    const result = getAvailableLessonsForSlot(
      requirements,
      schedule,
      teachers,
      '10а',
      'Пн',
      1
    );

    // Both group entries should appear (not deduplicated)
    expect(result.unscheduled).toHaveLength(2);
    const groups = result.unscheduled.map(r => r.classOrGroup);
    expect(groups).toContain('10а(д)');
    expect(groups).toContain('10а(е)');
  });

  it('filters out all lessons from the same teacher when excludeLesson is provided', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'req1',
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
    };
    const teachers = createTestTeachers();
    const requirements = createTestRequirements();

    // Excluding a lesson by Иванова — all her other lessons should be excluded too
    const result = getAvailableLessonsForSlot(
      requirements,
      schedule,
      teachers,
      '10а',
      'Пн',
      3,
      { subject: 'Алгебра', teacher: 'Иванова Т.С.' }
    );

    // Математика (also Иванова) should NOT appear - same teacher
    const subjects = [
      ...result.unscheduled.map(l => l.subject),
      ...result.movable.map(m => m.lesson.subject),
    ];
    expect(subjects).not.toContain('Математика');
    // Other teachers' lessons should still appear
    expect(result.unscheduled.map(l => l.subject)).toContain('Химия');
  });
});

describe('getAvailableLessonsForSlot — teacher2 filtering', () => {
  it('excludes lessons where teacher2 is banned', () => {
    const schedule: Schedule = {
      '10а': {
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
    };
    const teachers: Record<string, Teacher> = {
      'Иванова Т.С.': { id: 't1', name: 'Иванова Т.С.', subjects: ['Математика'], bans: {} },
      'Петрова А.П.': { id: 't2', name: 'Петрова А.П.', subjects: ['Физика'], bans: { 'Пн': [1] } },
    };
    const requirements: LessonRequirement[] = [{
      id: 'req1',
      type: 'class',
      classOrGroup: '10а',
      subject: 'Математика',
      teacher: 'Иванова Т.С.',
      teacher2: 'Петрова А.П.',
      countPerWeek: 3,
    }];

    // Петрова banned on Пн-1, so the lesson should NOT be available
    const result = getAvailableLessonsForSlot(requirements, schedule, teachers, '10а', 'Пн', 1);
    expect(result.unscheduled).toHaveLength(0);

    // But on Пн-3, both are free → available
    const result2 = getAvailableLessonsForSlot(requirements, schedule, teachers, '10а', 'Пн', 3);
    expect(result2.unscheduled).toHaveLength(1);
  });

  it('excludes lessons where teacher2 is busy in another class', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [] },
        },
      },
      '10б': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'other',
              subject: 'Химия',
              teacher: 'Петрова А.П.',
              room: '-205-',
            }],
          },
        },
      },
    };
    const teachers: Record<string, Teacher> = {
      'Иванова Т.С.': { id: 't1', name: 'Иванова Т.С.', subjects: ['Математика'], bans: {} },
      'Петрова А.П.': { id: 't2', name: 'Петрова А.П.', subjects: ['Физика', 'Химия'], bans: {} },
    };
    const requirements: LessonRequirement[] = [{
      id: 'req1',
      type: 'class',
      classOrGroup: '10а',
      subject: 'Математика',
      teacher: 'Иванова Т.С.',
      teacher2: 'Петрова А.П.',
      countPerWeek: 3,
    }];

    const result = getAvailableLessonsForSlot(requirements, schedule, teachers, '10а', 'Пн', 1);
    expect(result.unscheduled).toHaveLength(0);
  });
});

describe('getAvailableRooms with capacity', () => {
  const createClasses = (): SchoolClass[] => [
    { id: 'c1', name: '10а', studentCount: 30 },
    { id: 'c2', name: '10б', studentCount: 25 },
  ];

  it('excludes room when class student count exceeds capacity', () => {
    const schedule: Schedule = {};
    const rooms: Record<string, Room> = {
      '-114-': { id: 'r1', fullName: '114', shortName: '-114-', capacity: 20 },
      '-205-': { id: 'r2', fullName: '205', shortName: '-205-', capacity: 35 },
    };
    const classes = createClasses();

    // 10а has 30 students, room 114 has capacity 20 → should be excluded
    const available = getAvailableRooms(schedule, rooms, 'Пн', 1, classes, 30);
    const names = available.map(r => r.shortName);
    expect(names).not.toContain('-114-');
    expect(names).toContain('-205-');
  });

  it('includes room without capacity set (unlimited)', () => {
    const schedule: Schedule = {};
    const rooms: Record<string, Room> = {
      '-114-': { id: 'r1', fullName: '114', shortName: '-114-' }, // no capacity
    };
    const classes = createClasses();

    const available = getAvailableRooms(schedule, rooms, 'Пн', 1, classes, 30);
    expect(available).toHaveLength(1);
  });

  it('checks cumulative students in multiClass room', () => {
    // 10а (30 students) already in the gym, trying to add 10б (25 students)
    // gym capacity=60, multiClass=2 → 30+25=55 ≤ 60 → ok
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Физкультура',
              teacher: 'Смирнов А.А.',
              room: '-СЗ-',
            }],
          },
        },
      },
    };
    const rooms: Record<string, Room> = {
      '-СЗ-': { id: 'r4', fullName: 'Спортзал', shortName: '-СЗ-', capacity: 60, multiClass: 2 },
    };
    const classes = createClasses();

    const available = getAvailableRooms(schedule, rooms, 'Пн', 1, classes, 25);
    expect(available.map(r => r.shortName)).toContain('-СЗ-');
  });

  it('excludes multiClass room when cumulative students exceed capacity', () => {
    // 10а (30 students) already in the gym, trying to add 10б (25 students)
    // gym capacity=40, multiClass=2 → 30+25=55 > 40 → excluded
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [{
              id: 'l1',
              requirementId: 'r1',
              subject: 'Физкультура',
              teacher: 'Смирнов А.А.',
              room: '-СЗ-',
            }],
          },
        },
      },
    };
    const rooms: Record<string, Room> = {
      '-СЗ-': { id: 'r4', fullName: 'Спортзал', shortName: '-СЗ-', capacity: 40, multiClass: 2 },
    };
    const classes = createClasses();

    const available = getAvailableRooms(schedule, rooms, 'Пн', 1, classes, 25);
    expect(available.map(r => r.shortName)).not.toContain('-СЗ-');
  });
});

describe('getAvailableRooms — group lessons skip capacity', () => {
  it('all rooms available when studentCount is undefined (group lesson scenario)', () => {
    const schedule: Schedule = {};
    const rooms: Record<string, Room> = {
      '-114-': { id: 'r1', fullName: '114', shortName: '-114-', capacity: 10 },
      '-205-': { id: 'r2', fullName: '205', shortName: '-205-', capacity: 5 },
    };

    // With studentCount=30, small rooms would be excluded
    const withCount = getAvailableRooms(schedule, rooms, 'Пн', 1, [{ id: 'c1', name: '10а', studentCount: 30 }], 30);
    expect(withCount.map(r => r.shortName)).not.toContain('-114-');
    expect(withCount.map(r => r.shortName)).not.toContain('-205-');

    // With studentCount=undefined (group lesson), all rooms are available
    const withoutCount = getAvailableRooms(schedule, rooms, 'Пн', 1, [{ id: 'c1', name: '10а', studentCount: 30 }], undefined);
    expect(withoutCount.map(r => r.shortName)).toContain('-114-');
    expect(withoutCount.map(r => r.shortName)).toContain('-205-');
  });
});

describe('getRoomStudentCount — no double-counting for same-class groups', () => {
  it('counts class students once even with multiple group lessons in same room', () => {
    // Two group lessons of 11б in the gym — should count 29 students, not 58
    const schedule: Schedule = {
      '11б': {
        'Пн': {
          1: {
            lessons: [
              { id: 'l1', requirementId: 'r1', subject: 'Физра', teacher: 'Иванов А.А.', room: '-Зал-', group: '11б(В.Е.)' },
              { id: 'l2', requirementId: 'r2', subject: 'Физра', teacher: 'Петров Б.Б.', room: '-Зал-', group: '11б(Т.В.)' },
            ],
          },
        },
      },
    };
    const classes: SchoolClass[] = [
      { id: 'c1', name: '11б', studentCount: 29 },
      { id: 'c2', name: '5в', studentCount: 25 },
    ];
    const rooms: Record<string, Room> = {
      '-Зал-': { id: 'r1', fullName: 'Зал', shortName: '-Зал-', capacity: 70, multiClass: 3 },
    };

    // 5в (25 students) should fit: 29 + 25 = 54 ≤ 70
    const available = getAvailableRooms(schedule, rooms, 'Пн', 1, classes, 25);
    expect(available.map(r => r.shortName)).toContain('-Зал-');
  });

  it('still rejects when different classes exceed capacity', () => {
    // 10а (30 students) already in gym, try to add 10б (25 students) — 30+25=55 > 50
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: {
            lessons: [
              { id: 'l1', requirementId: 'r1', subject: 'Физра', teacher: 'Иванов А.А.', room: '-Зал-' },
            ],
          },
        },
      },
    };
    const classes: SchoolClass[] = [
      { id: 'c1', name: '10а', studentCount: 30 },
      { id: 'c2', name: '10б', studentCount: 25 },
    ];
    const rooms: Record<string, Room> = {
      '-Зал-': { id: 'r1', fullName: 'Зал', shortName: '-Зал-', capacity: 50, multiClass: 2 },
    };

    const available = getAvailableRooms(schedule, rooms, 'Пн', 1, classes, 25);
    expect(available.map(r => r.shortName)).not.toContain('-Зал-');
  });
});

describe('getSubstituteTeachers', () => {
  const createTeachersForSub = (): Record<string, Teacher> => ({
    'Иванова Т.С.': {
      id: 't1',
      name: 'Иванова Т.С.',
      subjects: ['Математика', 'Алгебра'],
      bans: {},
    },
    'Петрова А.П.': {
      id: 't2',
      name: 'Петрова А.П.',
      subjects: ['Математика'],
      bans: { 'Пн': [2] },
    },
    'Сидорова М.К.': {
      id: 't3',
      name: 'Сидорова М.К.',
      subjects: ['Химия'],
      bans: {},
    },
    'Рыбина А.А.': {
      id: 't4',
      name: 'Рыбина А.А.',
      subjects: ['Математика', 'Физика'],
      bans: {},
    },
  });

  it('returns free teachers who teach the subject', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Математика', teacher: 'Иванова Т.С.', room: '-114-' }] },
        },
      },
    };
    const teachers = createTeachersForSub();

    const result = getSubstituteTeachers(schedule, teachers, 'Математика', 'Пн', 1, '10а');

    const names = result.map(t => t.name);
    // Петрова, Рыбина, and Иванова teach Математика and are free at Пн-1
    // (Иванова's lesson in excludeClass 10а is ignored — slot is being freed)
    expect(names).toContain('Петрова А.П.');
    expect(names).toContain('Рыбина А.А.');
    expect(names).toContain('Иванова Т.С.');
    // Сидорова doesn't teach Математика
    expect(names).not.toContain('Сидорова М.К.');
  });

  it('excludes teachers with bans at the time slot', () => {
    const schedule: Schedule = {};
    const teachers = createTeachersForSub();

    // Пн-2: Петрова is banned
    const result = getSubstituteTeachers(schedule, teachers, 'Математика', 'Пн', 2, '10а');

    const names = result.map(t => t.name);
    expect(names).not.toContain('Петрова А.П.');
    expect(names).toContain('Иванова Т.С.');
    expect(names).toContain('Рыбина А.А.');
  });

  it('excludes teachers busy in another class', () => {
    const schedule: Schedule = {
      '10б': {
        'Пн': {
          3: { lessons: [{ id: 'l2', requirementId: 'r2', subject: 'Физика', teacher: 'Рыбина А.А.', room: '-205-' }] },
        },
      },
    };
    const teachers = createTeachersForSub();

    const result = getSubstituteTeachers(schedule, teachers, 'Математика', 'Пн', 3, '10а');

    const names = result.map(t => t.name);
    expect(names).not.toContain('Рыбина А.А.');
    expect(names).toContain('Иванова Т.С.');
  });

  it('returns empty array when no teachers teach the subject', () => {
    const schedule: Schedule = {};
    const teachers = createTeachersForSub();

    const result = getSubstituteTeachers(schedule, teachers, 'История', 'Пн', 1, '10а');
    expect(result).toHaveLength(0);
  });

  it('returns results sorted by name', () => {
    const schedule: Schedule = {};
    const teachers = createTeachersForSub();

    const result = getSubstituteTeachers(schedule, teachers, 'Математика', 'Вт', 1, '10а');

    const names = result.map(t => t.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ru')));
  });

  it('excludes the teacher being replaced when excludeTeacher is provided', () => {
    const schedule: Schedule = {
      '10а': {
        'Пн': {
          1: { lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Математика', teacher: 'Иванова Т.С.', room: '-114-' }] },
        },
      },
    };
    const teachers = createTeachersForSub();

    const result = getSubstituteTeachers(schedule, teachers, 'Математика', 'Пн', 1, '10а', 'Иванова Т.С.');

    const names = result.map(t => t.name);
    expect(names).not.toContain('Иванова Т.С.');
    expect(names).toContain('Петрова А.П.');
    expect(names).toContain('Рыбина А.А.');
  });
});

describe('getFreeTeachersAtSlot', () => {
  const makeTeacher = (name: string): Teacher => ({
    id: name,
    name,
    subjects: ['Физика'],
    bans: {},
  });

  it('returns all teachers free at the slot', () => {
    const schedule: Schedule = {};
    const teachers = {
      t1: makeTeacher('Иванов'),
      t2: makeTeacher('Петров'),
    };
    const result = getFreeTeachersAtSlot(schedule, teachers, 'Пн', 1);
    expect(result.map(t => t.name)).toContain('Иванов');
    expect(result.map(t => t.name)).toContain('Петров');
  });

  it('excludes the specified teacher', () => {
    const schedule: Schedule = {};
    const teachers = { t1: makeTeacher('Иванов'), t2: makeTeacher('Петров') };
    const result = getFreeTeachersAtSlot(schedule, teachers, 'Пн', 1, 'Иванов');
    expect(result.map(t => t.name)).not.toContain('Иванов');
    expect(result.map(t => t.name)).toContain('Петров');
  });

  it('excludes teachers in substituteTeacherNames', () => {
    const schedule: Schedule = {};
    const teachers = {
      t1: makeTeacher('Иванов'),
      t2: makeTeacher('Петров'),
      t3: makeTeacher('Сидоров'),
    };
    const result = getFreeTeachersAtSlot(schedule, teachers, 'Пн', 1, undefined, ['Петров']);
    const names = result.map(t => t.name);
    expect(names).toContain('Иванов');
    expect(names).not.toContain('Петров');
    expect(names).toContain('Сидоров');
  });

  it('excludes teachers busy at the slot', () => {
    const schedule: Schedule = {
      '5а': {
        'Пн': {
          1: { lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Физика', teacher: 'Иванов', room: '101' }] },
        },
      },
    };
    const teachers = { t1: makeTeacher('Иванов'), t2: makeTeacher('Петров') };
    const result = getFreeTeachersAtSlot(schedule, teachers, 'Пн', 1);
    expect(result.map(t => t.name)).not.toContain('Иванов');
    expect(result.map(t => t.name)).toContain('Петров');
  });

  it('returns results sorted by name', () => {
    const schedule: Schedule = {};
    const teachers = {
      t1: makeTeacher('Яковлев'),
      t2: makeTeacher('Аввакумов'),
      t3: makeTeacher('Михайлов'),
    };
    const result = getFreeTeachersAtSlot(schedule, teachers, 'Пн', 1);
    const names = result.map(t => t.name);
    expect(names[0]).toBe('Аввакумов');
    expect(names[names.length - 1]).toBe('Яковлев');
  });
});
