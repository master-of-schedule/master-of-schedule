import { describe, expect, it } from 'vitest';
import type { Group, LessonRequirement, Schedule, ScheduledLesson } from '@/types';
import {
  findLessonListCleanupPlan,
  getLessonListRequirementUpdates,
  getLessonListCleanupSignature,
} from './lessonListCleanup';

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

  it('groups selected missing lessons into one new requirement', () => {
    const schedule = makeSchedule([
      makeLesson({ id: 'lesson-1', subject: 'История' }),
      makeLesson({ id: 'lesson-2', subject: 'История' }),
    ]);
    const plan = findLessonListCleanupPlan(schedule, [], []);

    const updates = getLessonListRequirementUpdates(plan.removals, [], []);

    expect(updates).toEqual({
      additions: [expect.objectContaining({
        type: 'class',
        classOrGroup: '10а',
        subject: 'История',
        teacher: 'Иванова Т.С.',
        countPerWeek: 2,
      })],
      updates: [],
    });
  });

  it('adds only the individually selected lessons to the lesson list', () => {
    const schedule = makeSchedule([
      makeLesson({ id: 'lesson-1', subject: 'История' }),
      makeLesson({ id: 'lesson-2', subject: 'История' }),
    ]);
    const plan = findLessonListCleanupPlan(schedule, [], []);

    const updates = getLessonListRequirementUpdates([plan.removals[1]], [], []);

    expect(updates.additions).toEqual([expect.objectContaining({
      subject: 'История',
      countPerWeek: 1,
    })]);
  });

  it('increases an existing requirement when keeping excess lessons', () => {
    const requirements = [makeRequirement({ countPerWeek: 1 })];
    const schedule = makeSchedule([
      makeLesson({ id: 'lesson-1' }),
      makeLesson({ id: 'lesson-2' }),
      makeLesson({ id: 'lesson-3' }),
    ]);
    const plan = findLessonListCleanupPlan(schedule, requirements, []);

    const updates = getLessonListRequirementUpdates(plan.removals, requirements, []);

    expect(updates).toEqual({
      additions: [],
      updates: [{ id: 'req-1', countPerWeek: 3 }],
    });
  });

  it('recreates selected group lessons with their saved group relationship', () => {
    const schedule = makeSchedule([
      makeLesson({
        group: '10а(д)',
        subject: 'Английский',
        teacher2: 'Сидорова С.С.',
      }),
    ]);
    const groups: Group[] = [{
      id: 'group-1',
      name: '10а(д)',
      className: '10а',
      index: '(д)',
      parallelGroup: '10а(м)',
    }];
    const plan = findLessonListCleanupPlan(schedule, [], []);

    const updates = getLessonListRequirementUpdates(plan.removals, [], groups);

    expect(updates.additions).toEqual([{
      type: 'group',
      classOrGroup: '10а(д)',
      className: '10а',
      parallelGroup: '10а(м)',
      subject: 'Английский',
      teacher: 'Иванова Т.С.',
      teacher2: 'Сидорова С.С.',
      countPerWeek: 1,
    }]);
  });
});
