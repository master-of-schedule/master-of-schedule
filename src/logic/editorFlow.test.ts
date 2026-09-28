import { describe, expect, it } from 'vitest';
import type { LessonRequirement } from '@/types';
import {
  canUseForcePlacement,
  canUseRegularPlacementTarget,
  getAssigningLesson,
  getAssigningRemovedLessonIds,
  getCopiedLesson,
  getInteractionRequirement,
  getMovingLesson,
  createReplacementRoomDialog,
  createPendingPartnerMerge,
  reduceEditorDialog,
  reduceEditorInteraction,
  supportsForcePlacement,
  type CopiedLessonData,
  type EditorDialog,
  type MovingLessonData,
} from './editorFlow';

describe('supportsForcePlacement', () => {
  it('allows all version types', () => {
    expect(supportsForcePlacement('technical')).toBe(true);
    expect(supportsForcePlacement('weekly')).toBe(true);
    expect(supportsForcePlacement('template')).toBe(true);
  });
});

describe('placement click policy', () => {
  it('rejects teacher bans and other forbidden cells for ordinary clicks', () => {
    expect(canUseRegularPlacementTarget({ status: 'available' })).toBe(true);
    expect(canUseRegularPlacementTarget({ status: 'teacher_banned' })).toBe(false);
    expect(canUseRegularPlacementTarget({
      status: 'teacher_busy',
      conflictClass: '6а',
      conflictSubject: 'Физика',
    })).toBe(false);
    expect(canUseRegularPlacementTarget({ status: 'class_occupied' })).toBe(false);
  });
});

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

describe('canUseForcePlacement', () => {
  it('allows Alt placement while assigning or moving, including a pink target', () => {
    expect(canUseForcePlacement('weekly', { type: 'assigning', lesson: requirement })).toBe(true);
    expect(canUseForcePlacement('weekly', { type: 'moving', lesson: movingLesson })).toBe(true);
  });

  it('does not turn Alt into a force action outside placement flows', () => {
    expect(canUseForcePlacement('weekly', { type: 'idle' })).toBe(false);
    expect(canUseForcePlacement('weekly', { type: 'copying', lesson: copiedLesson })).toBe(false);
  });
});

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

  it('keeps the exact removed occurrence selected for reassignment', () => {
    const assigning = reduceEditorInteraction(
      { type: 'idle' },
      { type: 'SELECT_LESSON', lesson: requirement, removedLessonIds: ['removed-1', 'removed-2'] },
    );

    expect(getAssigningLesson(assigning)).toBe(requirement);
    expect(getAssigningRemovedLessonIds(assigning)).toEqual(['removed-1', 'removed-2']);
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

  it('keeps force override scoped to the room dialog', () => {
    const room = reduceEditorDialog(
      { type: 'none' },
      {
        type: 'OPEN_ROOM',
        data: { day: 'Пн', lessonNum: 1, forceOverride: true },
      }
    );

    expect(room).toEqual({
      type: 'room',
      data: { day: 'Пн', lessonNum: 1, forceOverride: true },
    });
    expect(reduceEditorDialog(room, { type: 'CLOSE' })).toEqual({ type: 'none' });
  });

  it('keeps force override on a move room dialog', () => {
    const moveRoom = reduceEditorDialog(
      { type: 'none' },
      {
        type: 'OPEN_MOVE_ROOM',
        data: { day: 'Пн', lessonNum: 1, forceOverride: true },
      }
    );

    expect(moveRoom).toEqual({
      type: 'moveRoom',
      data: { day: 'Пн', lessonNum: 1, forceOverride: true },
    });
  });
});

describe('partner merge handoff', () => {
  it('keeps the source slot after the temporary-lesson modal closes', () => {
    const pending = createPendingPartnerMerge(
      { sourceDay: 'Чт', sourceLessonNum: 4, partnerLessonIndex: 1 },
      requirement,
    );

    expect(pending).toEqual({
      sourceDay: 'Чт', sourceLessonNum: 4, partnerLessonIndex: 1, requirement,
    });
  });
});

describe('createReplacementRoomDialog', () => {
  it('keeps the occupied lesson as a deferred replacement source', () => {
    expect(createReplacementRoomDialog({ day: 'Вт', lessonNum: 2, lessonIndex: 0 }, '5а')).toEqual({
      day: 'Вт',
      lessonNum: 2,
      fromReplacement: true,
      replacementSource: { className: '5а', day: 'Вт', lessonNum: 2, lessonIndex: 0 },
    });
  });

  it('opens an empty-cell replacement without a removal source', () => {
    expect(createReplacementRoomDialog({ day: 'Ср', lessonNum: 3, lessonIndex: null }, '5а')).toEqual({
      day: 'Ср',
      lessonNum: 3,
      fromReplacement: true,
    });
  });
});
