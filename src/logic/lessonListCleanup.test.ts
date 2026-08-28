import { describe, expect, it } from 'vitest';
import type { LessonRequirement, Schedule, ScheduledLesson } from '@/types';
import { findLessonListCleanupPlan, getLessonListCleanupSignature } from './lessonListCleanup';

const makeRequirement = (overrides: Partial<LessonRequirement> = {}): LessonRequirement => ({
  id: 'req-1',
  type: 'class',
  classOrGroup: '10а',
  subject: 'Математика',
  teacher: 'Иванова Т.С.',
  countPerWeek: 2,
  ...overrides,
});

const makeLesson = (overrides: Partial<ScheduledLesson> = {}): ScheduledLesson => ({
  id: 'lesson-1',
  requirementId: 'req-1',
  subject: 'Математика',
  teacher: 'Иванова Т.С.',
  room: '-101-',
  ...overrides,
});

function makeSchedule(lessons: ScheduledLesson[]): Schedule {
  return {
    '10а': {
      Пн: {
        1: { lessons: [lessons[0]].filter(Boolean) },
        2: { lessons: [lessons[1]].filter(Boolean) },
      },
      Вт: {
        1: { lessons: [lessons[2]].filter(Boolean) },
      },
    },
  };
}

describe('findLessonListCleanupPlan', () => {
  it('removes lessons that no longer exist in the lesson list', () => {
    const schedule = makeSchedule([makeLesson({ subject: 'Старый предмет' })]);

    const plan = findLessonListCleanupPlan(schedule, [makeRequirement()], []);

    expect(plan.removals).toHaveLength(1);
    expect(plan.removals[0]).toMatchObject({
      className: '10а',
      day: 'Пн',
      lessonNum: 1,
      lessonIndex: 0,
      reason: 'missing',
    });
    expect(plan.missingCount).toBe(1);
  });

  it('removes extra scheduled lessons after countPerWeek decreases', () => {
    const schedule = makeSchedule([
      makeLesson({ id: 'lesson-1' }),
      makeLesson({ id: 'lesson-2' }),
      makeLesson({ id: 'lesson-3' }),
    ]);

    const plan = findLessonListCleanupPlan(schedule, [makeRequirement({ countPerWeek: 2 })], []);

    expect(plan.removals).toHaveLength(1);
    expect(plan.removals[0]).toMatchObject({
      day: 'Вт',
      lessonNum: 1,
      reason: 'excess',
    });
    expect(plan.excessCount).toBe(1);
  });

  it('keeps temporary lessons even when they are absent from the main lesson list', () => {
    const temp = makeRequirement({
      id: 'temp-1',
      subject: 'Проект',
      teacher: 'Петров П.П.',
      countPerWeek: 1,
      compensationType: 'budget',
    });
    const schedule = makeSchedule([
      makeLesson({
        id: 'temp-lesson',
        requirementId: 'temp-1',
        subject: 'Проект',
        teacher: 'Петров П.П.',
      }),
    ]);

    const plan = findLessonListCleanupPlan(schedule, [makeRequirement()], [temp]);

    expect(plan.removals).toHaveLength(0);
  });

  it('matches lessons by second teacher as part of the lesson identity', () => {
    const schedule = makeSchedule([
      makeLesson({
        teacher2: 'Сидорова С.С.',
      }),
    ]);

    const plan = findLessonListCleanupPlan(
      schedule,
      [makeRequirement({ teacher2: 'Петрова П.П.' })],
      []
    );

    expect(plan.removals).toHaveLength(1);
    expect(plan.removals[0].reason).toBe('missing');
  });

  it('builds a stable signature for prompt dismissal', () => {
    const schedule = makeSchedule([makeLesson()]);
    const plan = findLessonListCleanupPlan(schedule, [], []);

    expect(getLessonListCleanupSignature(plan)).toBe('10а|Пн|1|0|lesson-1|missing');
  });
});
