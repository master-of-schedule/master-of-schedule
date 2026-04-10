import { describe, it, expect, vi } from 'vitest';
import { forEachSlot, forEachSlotAt } from './traversal';
import type { Schedule, ScheduledLesson } from '@/types';

function makeLesson(overrides: Partial<ScheduledLesson> = {}): ScheduledLesson {
  return {
    id: 'l1',
    requirementId: 'req-1',
    subject: 'Математика',
    teacher: 'Иванов',
    room: '201',
    ...overrides,
  };
}

function makeSchedule(): Schedule {
  return {
    '5А': {
      Пн: {
        1: { lessons: [makeLesson({ id: 'l1' })] },
        2: { lessons: [makeLesson({ id: 'l2', subject: 'Физкультура' })] },
      },
      Вт: {
        1: { lessons: [makeLesson({ id: 'l3', subject: 'История' })] },
      },
    },
    '6Б': {
      Пн: {
        1: { lessons: [makeLesson({ id: 'l4' })] },
      },
    },
  } as unknown as Schedule;
}

describe('forEachSlot', () => {
  it('visits every slot in every class', () => {
    const schedule = makeSchedule();
    const visited: Array<{ className: string; day: string; lessonNum: number }> = [];
    forEachSlot(schedule, (className, day, lessonNum) => {
      visited.push({ className, day, lessonNum });
    });
    expect(visited).toHaveLength(4); // 5А: 3 slots, 6Б: 1 slot
  });

  it('provides correct className, day, lessonNum, and lessons to callback', () => {
    const schedule = makeSchedule();
    const calls: Array<{ className: string; day: string; lessonNum: number; lessonIds: string[] }> = [];
    forEachSlot(schedule, (className, day, lessonNum, lessons) => {
      calls.push({ className, day, lessonNum, lessonIds: lessons.map((l) => l.id) });
    });

    const slot5АПн1 = calls.find((c) => c.className === '5А' && c.day === 'Пн' && c.lessonNum === 1);
    expect(slot5АПн1).toBeDefined();
    expect(slot5АПн1?.lessonIds).toEqual(['l1']);

    const slot6БПн1 = calls.find((c) => c.className === '6Б' && c.day === 'Пн' && c.lessonNum === 1);
    expect(slot6БПн1).toBeDefined();
    expect(slot6БПн1?.lessonIds).toEqual(['l4']);
  });

  it('skips slots with no lessons array', () => {
    const schedule = {
      '5А': {
        Пн: {
          1: { lessons: [makeLesson()] },
          2: null, // no slot
          3: { lessons: [] }, // empty lessons — still visited
        },
      },
    } as unknown as Schedule;

    const visited: number[] = [];
    forEachSlot(schedule, (_cn, _d, lessonNum) => {
      visited.push(lessonNum);
    });
    // slot 2 is null → skipped; slot 3 has lessons:[] → visited
    expect(visited).toContain(1);
    expect(visited).toContain(3);
    expect(visited).not.toContain(2);
  });

  it('handles an empty schedule without error', () => {
    const cb = vi.fn();
    forEachSlot({} as Schedule, cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('handles a class with no days without error', () => {
    const schedule = { '5А': {} } as unknown as Schedule;
    const cb = vi.fn();
    forEachSlot(schedule, cb);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('forEachSlotAt', () => {
  it('visits the same time-slot across all classes', () => {
    const schedule = makeSchedule();
    const classNames: string[] = [];
    forEachSlotAt(schedule, 'Пн' as any, 1 as any, (className) => {
      classNames.push(className);
    });
    expect(classNames).toContain('5А');
    expect(classNames).toContain('6Б');
  });

  it('provides lessons for each class at the specified slot', () => {
    const schedule = makeSchedule();
    const results: Record<string, string[]> = {};
    forEachSlotAt(schedule, 'Пн' as any, 1 as any, (className, lessons) => {
      results[className] = lessons.map((l) => l.id);
    });
    expect(results['5А']).toEqual(['l1']);
    expect(results['6Б']).toEqual(['l4']);
  });

  it('passes an empty array for classes that have no lesson at that slot', () => {
    const schedule = makeSchedule();
    const results: Record<string, ScheduledLesson[]> = {};
    // Вт lesson 2 exists for neither class
    forEachSlotAt(schedule, 'Вт' as any, 2 as any, (className, lessons) => {
      results[className] = lessons;
    });
    expect(results['5А']).toEqual([]);
    expect(results['6Б']).toEqual([]);
  });

  it('handles a missing day gracefully (returns empty array)', () => {
    const schedule = makeSchedule();
    const results: ScheduledLesson[][] = [];
    forEachSlotAt(schedule, 'Сб' as any, 1 as any, (_cn, lessons) => {
      results.push(lessons);
    });
    expect(results.every((l) => l.length === 0)).toBe(true);
  });

  it('handles an empty schedule without error', () => {
    const cb = vi.fn();
    forEachSlotAt({} as Schedule, 'Пн' as any, 1 as any, cb);
    expect(cb).not.toHaveBeenCalled();
  });
});
