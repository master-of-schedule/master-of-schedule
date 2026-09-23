import { describe, expect, it } from 'vitest';
import type { LessonRequirement, RemovedLesson, RemovedLessonReason, UnscheduledLesson } from '@/types';
import { buildWeeklyLessonGroups, getClassesWithTemporaryRemovals } from './weeklyLessonGroups';

function requirement(id: string, subject: string, teacher = 'Учитель'): LessonRequirement {
  return {
    id,
    type: 'class',
    classOrGroup: '5а',
    subject,
    teacher,
    countPerWeek: 3,
  };
}

function removed(id: string, req: LessonRequirement, reason: RemovedLessonReason): RemovedLesson {
  return {
    id,
    reason,
    className: '5а',
    day: 'Пн',
    lessonNum: 1,
    requirement: req,
    lesson: {
      id: `lesson-${id}`,
      requirementId: req.id,
      subject: req.subject,
      teacher: req.teacher,
      room: '101',
    },
  };
}

describe('buildWeeklyLessonGroups', () => {
  it('splits explicit occurrences into the three stakeholder groups', () => {
    const math = requirement('math', 'Математика');
    const biology = requirement('bio', 'Биология');
    const algebra = requirement('alg', 'Алгебра');
    const unscheduled: UnscheduledLesson[] = [
      { requirement: math, remaining: 1 },
      { requirement: biology, remaining: 1 },
      { requirement: algebra, remaining: 1 },
    ];

    const result = buildWeeklyLessonGroups(unscheduled, [
      removed('t1', math, 'temporary'),
      removed('w1', biology, 'withdrawn'),
      removed('s1', algebra, 'sick'),
    ], '5а');

    expect(result.temporary.map(item => item.requirement.id)).toEqual(['math']);
    expect(result.withdrawn.map(item => item.requirement.id)).toEqual(['bio']);
    expect(result.sick.map(item => item.requirement.id)).toEqual(['alg']);
  });

  it('treats old unclassified remainder as withdrawn without duplicating explicit records', () => {
    const math = requirement('math', 'Математика');
    const result = buildWeeklyLessonGroups(
      [{ requirement: math, remaining: 3 }],
      [removed('t1', math, 'temporary')],
      '5а',
    );

    expect(result.temporary[0]).toMatchObject({ remaining: 1, removalIds: ['t1'] });
    expect(result.withdrawn[0]).toMatchObject({ remaining: 2, removalIds: [] });
  });

  it('aggregates occurrences of the same lesson and sorts each group alphabetically', () => {
    const math = requirement('math', 'Математика');
    const algebra = requirement('alg', 'Алгебра');
    const result = buildWeeklyLessonGroups([], [
      removed('m1', math, 'temporary'),
      removed('m2', math, 'temporary'),
      removed('a1', algebra, 'temporary'),
    ], '5а');

    expect(result.temporary.map(item => item.requirement.subject)).toEqual(['Алгебра', 'Математика']);
    expect(result.temporary[1]).toMatchObject({ remaining: 2, removalIds: ['m1', 'm2'] });
  });

  it('does not invent a row for a fully scheduled temporary lesson', () => {
    expect(buildWeeklyLessonGroups([], [], '5а')).toEqual({
      temporary: [],
      withdrawn: [],
      sick: [],
    });
  });

  it('keeps group lessons from the same subject separate', () => {
    const first: LessonRequirement = {
      ...requirement('g1', 'Английский'),
      type: 'group',
      classOrGroup: '5а(1)',
      className: '5а',
    };
    const second: LessonRequirement = {
      ...first,
      id: 'g2',
      classOrGroup: '5а(2)',
    };

    const result = buildWeeklyLessonGroups([], [
      removed('r1', first, 'withdrawn'),
      removed('r2', second, 'withdrawn'),
    ], '5а');

    expect(result.withdrawn).toHaveLength(2);
  });
});

describe('getClassesWithTemporaryRemovals', () => {
  it('highlights only classes with mandatory temporary removals', () => {
    const req = requirement('math', 'Математика');
    const other = { ...removed('w1', req, 'withdrawn'), className: '6б' };
    const sick = { ...removed('s1', req, 'sick'), className: '7в' };

    expect(getClassesWithTemporaryRemovals([
      removed('t1', req, 'temporary'),
      other,
      sick,
    ])).toEqual(new Set(['5а']));
  });
});
