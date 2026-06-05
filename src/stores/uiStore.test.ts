import { beforeEach, describe, expect, it } from 'vitest';
import type { Day, LessonNumber, LessonRequirement } from '@/types';
import { useUIStore } from './uiStore';

const cellRef = {
  className: '10а',
  day: 'Пн' as Day,
  lessonNum: 1 as LessonNumber,
};

const requirement: LessonRequirement = {
  id: 'req-1',
  type: 'class',
  classOrGroup: '10а',
  subject: 'Математика',
  teacher: 'Учитель 1',
  countPerWeek: 4,
};

const copiedLesson = {
  requirement,
  room: 'К301',
  sourceRef: { ...cellRef, lessonIndex: 0 },
};

const movingLesson = {
  ...copiedLesson,
  teacher: requirement.teacher,
};

function resetStore() {
  useUIStore.setState(useUIStore.getInitialState());
}

describe('uiStore editor interaction', () => {
  beforeEach(resetStore);

  it('preserves move mode when opening and selecting a context-menu cell', () => {
    const store = useUIStore.getState();
    store.setMovingLesson(movingLesson);
    store.selectContextCell(cellRef);
    store.openContextMenu(100, 200, cellRef, 0);

    expect(useUIStore.getState().interaction).toEqual({
      type: 'moving',
      lesson: movingLesson,
    });
    expect(useUIStore.getState().selectedCells).toEqual([cellRef]);
    expect(useUIStore.getState().contextMenu.isOpen).toBe(true);
  });

  it('preserves copy mode when opening and selecting a context-menu cell', () => {
    const store = useUIStore.getState();
    store.setCopiedLesson(copiedLesson);
    store.selectContextCell(cellRef);
    store.openContextMenu(100, 200, cellRef, 0);

    expect(useUIStore.getState().interaction).toEqual({
      type: 'copying',
      lesson: copiedLesson,
    });
  });

  it('replaces copy mode with move mode', () => {
    const store = useUIStore.getState();
    store.setCopiedLesson(copiedLesson);
    store.setMovingLesson(movingLesson);

    expect(useUIStore.getState().interaction).toEqual({
      type: 'moving',
      lesson: movingLesson,
    });
  });

  it('replaces move mode with copy mode', () => {
    const store = useUIStore.getState();
    store.setMovingLesson(movingLesson);
    store.setCopiedLesson(copiedLesson);

    expect(useUIStore.getState().interaction).toEqual({
      type: 'copying',
      lesson: copiedLesson,
    });
  });

  it('stores substitution metadata in move mode', () => {
    const lesson = {
      ...movingLesson,
      originalTeacher: 'Учитель 2',
      isSubstitution: true,
    };

    useUIStore.getState().setMovingLesson(lesson);

    expect(useUIStore.getState().interaction).toEqual({
      type: 'moving',
      lesson,
    });
  });

  it.each([
    ['assigning', () => useUIStore.getState().selectLesson(requirement)],
    ['copying', () => useUIStore.getState().setCopiedLesson(copiedLesson)],
    ['moving', () => useUIStore.getState().setMovingLesson(movingLesson)],
  ])('cancels %s mode when switching class', (_mode, startInteraction) => {
    startInteraction();
    useUIStore.getState().setCurrentClass('11а');

    expect(useUIStore.getState().interaction).toEqual({ type: 'idle' });
  });

  it('selecting a lesson replaces copy or move mode', () => {
    useUIStore.getState().setMovingLesson(movingLesson);
    useUIStore.getState().selectLesson(requirement);

    expect(useUIStore.getState().interaction).toEqual({
      type: 'assigning',
      lesson: requirement,
    });
  });

  it('clearAllSelection cancels interaction and clears cells', () => {
    useUIStore.getState().setCopiedLesson(copiedLesson);
    useUIStore.setState({ selectedCells: [cellRef] });
    useUIStore.getState().clearAllSelection();

    expect(useUIStore.getState().interaction).toEqual({ type: 'idle' });
    expect(useUIStore.getState().selectedCells).toEqual([]);
  });

  it('ordinary cell selection cancels the active interaction', () => {
    useUIStore.getState().setCopiedLesson(copiedLesson);
    useUIStore.getState().selectCell(cellRef);

    expect(useUIStore.getState().interaction).toEqual({ type: 'idle' });
    expect(useUIStore.getState().selectedCells).toEqual([cellRef]);
  });
});

describe('uiStore highlighted movable state', () => {
  beforeEach(resetStore);

  it('keeps teacher and cell highlights independent', () => {
    const store = useUIStore.getState();
    store.setHighlightedMovableTeacher('Учитель 1');
    store.setHighlightedMovableCell(cellRef);
    store.clearHighlightedMovableTeacher();

    expect(useUIStore.getState().highlightedMovableTeacher).toBeNull();
    expect(useUIStore.getState().highlightedMovableCell).toEqual(cellRef);
  });

  it('preserves the teacher highlight when opening a context menu', () => {
    const store = useUIStore.getState();
    store.setHighlightedMovableTeacher('Учитель 1');
    store.openContextMenu(100, 200, cellRef, 0);

    expect(useUIStore.getState().highlightedMovableTeacher).toBe('Учитель 1');
  });
});
