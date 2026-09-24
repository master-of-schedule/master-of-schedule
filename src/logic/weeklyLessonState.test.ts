import { describe, expect, it } from 'vitest';
import type { LessonRequirement, RemovedLesson } from '@/types';
import {
  completeLessonOccurrences,
  getCompletedCounts,
  migrateLegacyLessonStatuses,
  reclassifySickDayOccurrences,
  restoreCompletedOccurrences,
} from './weeklyLessonState';

const requirement: LessonRequirement = {
  id: 'req-1',
  type: 'class',
  classOrGroup: '5а',
  subject: 'Математика',
  teacher: 'Учитель',
  countPerWeek: 3,
};

function occurrence(id: string, reason: RemovedLesson['reason'] = 'withdrawn'): RemovedLesson {
  return {
    id,
    reason,
    className: '5а',
    day: 'Пн',
    lessonNum: 1,
    requirement,
    lesson: {
      id: `lesson-${id}`,
      requirementId: requirement.id,
      subject: requirement.subject,
      teacher: requirement.teacher,
      room: '101',
    },
  };
}

describe('weekly lesson occurrence transitions', () => {
  it('moves a selected removed occurrence to completed and restores its previous state', () => {
    const completed = completeLessonOccurrences(
      [occurrence('r1')],
      { requirement, className: '5а', removalIds: ['r1'], count: 1, implicitReason: 'withdrawn' },
      () => 'unused',
    );

    expect(completed[0]).toMatchObject({ id: 'r1', reason: 'completed', previousReason: 'withdrawn' });
    expect(restoreCompletedOccurrences(completed, ['r1'])[0]).toMatchObject({ id: 'r1', reason: 'withdrawn' });
  });

  it('materializes an implicit occurrence instead of creating a second source of state', () => {
    const result = completeLessonOccurrences(
      [],
      { requirement, className: '5а', removalIds: [], count: 1, implicitReason: 'withdrawn' },
      () => 'new-id',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'new-id', reason: 'completed', previousReason: 'withdrawn' });
    expect(result[0].day).toBeUndefined();
  });

  it('reclassifies illness symmetrically without losing a completed state', () => {
    const sick = reclassifySickDayOccurrences([occurrence('r1')], 'Учитель', 'Пн', true);
    expect(sick[0].reason).toBe('sick');

    const completed = completeLessonOccurrences(
      sick,
      { requirement, className: '5а', removalIds: ['r1'], count: 1, implicitReason: 'sick' },
      () => 'unused',
    );
    const noLongerSick = reclassifySickDayOccurrences(completed, 'Учитель', 'Пн', false);
    expect(noLongerSick[0]).toMatchObject({ reason: 'completed', previousReason: 'withdrawn' });
  });

  it('migrates a legacy two-lesson status into two completed occurrences', () => {
    let nextId = 0;
    const result = migrateLegacyLessonStatuses(
      [requirement],
      [],
      [occurrence('existing')],
      { 'req-1': 'completed2' },
      () => `generated-${++nextId}`,
    );

    expect(result).toHaveLength(2);
    expect(result.every(item => item.reason === 'completed')).toBe(true);
    expect(getCompletedCounts(result).get('5а|Математика|Учитель')).toBe(2);
  });
});
