import { describe, expect, it } from 'vitest';
import type { LessonRequirement } from '@/types';
import { getActiveGridStatusLesson } from './scheduleGridStatus';

const requirement = (id: string): LessonRequirement => ({
  id,
  classOrGroup: '5а',
  subject: 'Математика',
  teacher: 'Иванов И.И.',
  countPerWeek: 1,
  type: 'class',
});

describe('getActiveGridStatusLesson', () => {
  it('uses copied lesson for grid status when no lesson is selected', () => {
    const copied = {
      requirement: requirement('copy'),
      room: '-101-',
      sourceRef: { className: '5а', day: 'Пн' as const, lessonNum: 1 as const, lessonIndex: 0 },
    };

    expect(getActiveGridStatusLesson(null, copied, null)?.id).toBe('copy');
  });

  it('uses moving lesson for grid status when no lesson is selected or copied', () => {
    const moving = {
      requirement: requirement('move'),
      room: '-101-',
      teacher: 'Иванов И.И.',
      sourceRef: { className: '5а', day: 'Пн' as const, lessonNum: 1 as const, lessonIndex: 0 },
    };

    expect(getActiveGridStatusLesson(null, null, moving)?.id).toBe('move');
  });

  it('keeps selected lesson priority over copy and move modes', () => {
    const selected = requirement('selected');
    const copied = {
      requirement: requirement('copy'),
      room: '-101-',
      sourceRef: { className: '5а', day: 'Пн' as const, lessonNum: 1 as const, lessonIndex: 0 },
    };
    const moving = {
      requirement: requirement('move'),
      room: '-101-',
      teacher: 'Иванов И.И.',
      sourceRef: { className: '5а', day: 'Пн' as const, lessonNum: 1 as const, lessonIndex: 0 },
    };

    expect(getActiveGridStatusLesson(selected, copied, moving)?.id).toBe('selected');
  });
});
