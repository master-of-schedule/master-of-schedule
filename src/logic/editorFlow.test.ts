import { describe, expect, it } from 'vitest';
import type { LessonRequirement } from '@/types';
import {
  getAssigningLesson,
  getCopiedLesson,
  getInteractionRequirement,
  getMovingLesson,
  reduceEditorDialog,
  reduceEditorInteraction,
  type CopiedLessonData,
  type EditorDialog,
  type MovingLessonData,
} from './editorFlow';

const requirement: LessonRequirement = {
  id: 'req-1',
  type: 'class',
  classOrGroup: '5а',
  subject: 'Математика',
  teacher: 'Учитель 1',
  countPerWeek: 2,
};

const copiedLesson: CopiedLessonData = {
  requirement,
  room: '-101-',
  sourceRef: {
    className: '5а',
    day: 'Пн',
    lessonNum: 1,
    lessonIndex: 0,
  },
};

const movingLesson: MovingLessonData = {
  ...copiedLesson,
  teacher: requirement.teacher,
};

describe('reduceEditorInteraction', () => {
  it('replaces the active mode when a new flow starts', () => {
    const assigning = reduceEditorInteraction(
      { type: 'idle' },
      { type: 'SELECT_LESSON', lesson: requirement }
    );
    const copying = reduceEditorInteraction(
      assigning,
      { type: 'START_COPY', lesson: copiedLesson }
    );
    const moving = reduceEditorInteraction(
      copying,
      { type: 'START_MOVE', lesson: movingLesson }
    );

    expect(assigning).toEqual({ type: 'assigning', lesson: requirement });
    expect(copying).toEqual({ type: 'copying', lesson: copiedLesson });
    expect(moving).toEqual({ type: 'moving', lesson: movingLesson });
  });

  it('cancels any active mode', () => {
    expect(
      reduceEditorInteraction(
        { type: 'moving', lesson: movingLesson },
        { type: 'CANCEL' }
      )
    ).toEqual({ type: 'idle' });
  });

  it('exposes data only for the active mode', () => {
    const copying = { type: 'copying', lesson: copiedLesson } as const;

    expect(getAssigningLesson(copying)).toBeNull();
    expect(getCopiedLesson(copying)).toBe(copiedLesson);
    expect(getMovingLesson(copying)).toBeNull();
    expect(getInteractionRequirement(copying)).toBe(requirement);
  });
});

describe('reduceEditorDialog', () => {
  it('allows only one editor dialog at a time', () => {
    const initial: EditorDialog = { type: 'none' };
    const room = reduceEditorDialog(initial, {
      type: 'OPEN_ROOM',
      data: { day: 'Пн', lessonNum: 1 },
    });
    const replacement = reduceEditorDialog(room, {
      type: 'OPEN_REPLACEMENT',
      data: { day: 'Вт', lessonNum: 2, lessonIndex: 0 },
    });

    expect(room.type).toBe('room');
    expect(replacement).toEqual({
      type: 'replacement',
      data: { day: 'Вт', lessonNum: 2, lessonIndex: 0 },
    });
  });

  it('closes the active dialog', () => {
    expect(
      reduceEditorDialog(
        {
          type: 'moveRoom',
          data: { day: 'Ср', lessonNum: 3 },
        },
        { type: 'CLOSE' }
      )
    ).toEqual({ type: 'none' });
  });
});
