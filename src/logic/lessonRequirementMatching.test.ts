import { describe, expect, it } from 'vitest';
import type { LessonRequirement, ScheduledLesson } from '@/types';
import { findRequirementForScheduledLesson } from './lessonRequirementMatching';

function req(overrides: Partial<LessonRequirement>): LessonRequirement {
  return {
    id: 'req-1',
    type: 'class',
    classOrGroup: '5-а',
    subject: 'Математика',
    teacher: 'Иванова И.И.',
    countPerWeek: 5,
    ...overrides,
  };
}

function lesson(overrides: Partial<ScheduledLesson>): ScheduledLesson {
  return {
    id: 'lesson-1',
    requirementId: 'missing-after-import',
    subject: 'Математика',
    teacher: 'Иванова И.И.',
    room: '101',
    ...overrides,
  };
}

describe('findRequirementForScheduledLesson', () => {
  it('does not match a class lesson requirement from another class', () => {
    const requirements = [
      req({ id: 'other', classOrGroup: '5-а' }),
      req({ id: 'target', classOrGroup: '5-б', countPerWeek: 2 }),
    ];

    const result = findRequirementForScheduledLesson(requirements, lesson({}), '5-б');

    expect(result?.id).toBe('target');
  });

  it('matches group lessons by parent class and group name', () => {
    const requirements = [
      req({ id: 'other', type: 'group', classOrGroup: '8-в (А)', className: '8-в' }),
      req({ id: 'target', type: 'group', classOrGroup: '8-г (А)', className: '8-г' }),
    ];

    const result = findRequirementForScheduledLesson(
      requirements,
      lesson({ group: '8-г (А)' }),
      '8-г'
    );

    expect(result?.id).toBe('target');
  });
});
