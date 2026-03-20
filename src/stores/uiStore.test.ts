/**
 * uiStore regression tests
 * Covers state management bugs found in Z10B feedback
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';
import type { Day, LessonNumber, LessonRequirement } from '@/types';

function resetStore() {
  useUIStore.setState(useUIStore.getInitialState());
}

const mockCellRef = { className: '10а', day: 'Пн' as Day, lessonNum: 1 as LessonNumber };

const mockRequirement: LessonRequirement = {
  id: 'req-1',
  type: 'class',
  classOrGroup: '10а',
  subject: 'Математика',
  teacher: 'Иванова Т.С.',
  countPerWeek: 4,
};

const mockMovingLesson = {
  sourceRef: { className: '10а', day: 'Пн' as Day, lessonNum: 1 as LessonNumber, lessonIndex: 0 },
  requirement: mockRequirement,
  room: 'К301',
  teacher: 'Иванова Т.С.',
};

const mockCopiedLesson = {
  requirement: mockRequirement,
  room: 'К301',
  sourceRef: { className: '10а', day: 'Пн' as Day, lessonNum: 1 as LessonNumber, lessonIndex: 0 },
};

describe('uiStore', () => {
  beforeEach(resetStore);

  describe('Z10B-2 regression: openContextMenu preserves movingLesson', () => {
    it('does not clear movingLesson when opening context menu', () => {
      const store = useUIStore.getState();
      store.setMovingLesson(mockMovingLesson);
      expect(useUIStore.getState().movingLesson).not.toBeNull();

      store.openContextMenu(100, 200, mockCellRef, 0);

      expect(useUIStore.getState().contextMenu.isOpen).toBe(true);
      expect(useUIStore.getState().movingLesson).not.toBeNull();
      expect(useUIStore.getState().movingLesson).toEqual(mockMovingLesson);
    });
  });

  describe('Z10B-3 regression: openContextMenu preserves copiedLesson', () => {
    it('does not clear copiedLesson when opening context menu', () => {
      const store = useUIStore.getState();
      store.setCopiedLesson(mockCopiedLesson);
      expect(useUIStore.getState().copiedLesson).not.toBeNull();

      store.openContextMenu(100, 200, mockCellRef, 0);

      expect(useUIStore.getState().contextMenu.isOpen).toBe(true);
      expect(useUIStore.getState().copiedLesson).not.toBeNull();
      expect(useUIStore.getState().copiedLesson).toEqual(mockCopiedLesson);
    });
  });

  describe('setMovingLesson clears copiedLesson', () => {
    it('clears copiedLesson when setting movingLesson', () => {
      const store = useUIStore.getState();
      store.setCopiedLesson(mockCopiedLesson);
      expect(useUIStore.getState().copiedLesson).not.toBeNull();

      store.setMovingLesson(mockMovingLesson);

      expect(useUIStore.getState().movingLesson).toEqual(mockMovingLesson);
      expect(useUIStore.getState().copiedLesson).toBeNull();
    });
  });

  describe('setCopiedLesson clears movingLesson', () => {
    it('clears movingLesson when setting copiedLesson', () => {
      const store = useUIStore.getState();
      store.setMovingLesson(mockMovingLesson);
      expect(useUIStore.getState().movingLesson).not.toBeNull();

      store.setCopiedLesson(mockCopiedLesson);

      expect(useUIStore.getState().copiedLesson).toEqual(mockCopiedLesson);
      expect(useUIStore.getState().movingLesson).toBeNull();
    });
  });

  describe('clearAllSelection resets move/copy state', () => {
    it('clears movingLesson and copiedLesson', () => {
      const store = useUIStore.getState();
      store.setMovingLesson(mockMovingLesson);
      store.setCopiedLesson(mockCopiedLesson); // this also clears movingLesson

      // Set both independently via setState for the test
      useUIStore.setState({ movingLesson: mockMovingLesson, copiedLesson: mockCopiedLesson });

      store.clearAllSelection();

      const state = useUIStore.getState();
      expect(state.movingLesson).toBeNull();
      expect(state.copiedLesson).toBeNull();
      expect(state.selectedLesson).toBeNull();
      expect(state.selectedCells).toEqual([]);
    });
  });

  describe('highlightedMovableTeacher', () => {
    it('sets and clears highlighted movable teacher', () => {
      const store = useUIStore.getState();
      store.setHighlightedMovableTeacher('Иванова Т.С.');
      expect(useUIStore.getState().highlightedMovableTeacher).toBe('Иванова Т.С.');

      store.clearHighlightedMovableTeacher();
      expect(useUIStore.getState().highlightedMovableTeacher).toBeNull();
    });

    it('is independent from highlightedMovableCell', () => {
      const store = useUIStore.getState();
      store.setHighlightedMovableTeacher('Иванова Т.С.');
      store.setHighlightedMovableCell(mockCellRef);

      expect(useUIStore.getState().highlightedMovableTeacher).toBe('Иванова Т.С.');
      expect(useUIStore.getState().highlightedMovableCell).toEqual(mockCellRef);

      store.clearHighlightedMovableTeacher();
      expect(useUIStore.getState().highlightedMovableCell).toEqual(mockCellRef);
    });

    it('is not cleared by openContextMenu', () => {
      const store = useUIStore.getState();
      store.setHighlightedMovableTeacher('Иванова Т.С.');

      store.openContextMenu(100, 200, mockCellRef, 0);

      expect(useUIStore.getState().highlightedMovableTeacher).toBe('Иванова Т.С.');
    });
  });
});

// ─── Z27-2a: movingLesson preserves substitution metadata ─────

describe('setMovingLesson — Z27-2a substitution metadata', () => {
  const mockReq: LessonRequirement = {
    id: 'r1', subject: 'Математика', teacher: 'Иванова Т.С.', countPerWeek: 1, type: 'class', classOrGroup: '10а',
  };

  it('stores originalTeacher and isSubstitution when provided', () => {
    useUIStore.getState().setMovingLesson({
      sourceRef: { className: '10а', day: 'Пн' as Day, lessonNum: 1 as LessonNumber, lessonIndex: 0 },
      requirement: { ...mockReq, teacher: 'Петрова А.П.' },
      room: '-114-',
      teacher: 'Петрова А.П.',
      originalTeacher: 'Иванова Т.С.',
      isSubstitution: true,
    });
    const state = useUIStore.getState().movingLesson;
    expect(state?.originalTeacher).toBe('Иванова Т.С.');
    expect(state?.isSubstitution).toBe(true);
  });

  it('works without substitution fields', () => {
    useUIStore.getState().setMovingLesson({
      sourceRef: { className: '10а', day: 'Пн' as Day, lessonNum: 1 as LessonNumber, lessonIndex: 0 },
      requirement: mockReq,
      room: '-114-',
      teacher: 'Иванова Т.С.',
    });
    const state = useUIStore.getState().movingLesson;
    expect(state?.originalTeacher).toBeUndefined();
    expect(state?.isSubstitution).toBeUndefined();
  });
});

// ─── QI-12: setCurrentClass clearing invariants ───────────────

describe('setCurrentClass — clearing invariants', () => {
  beforeEach(() => useUIStore.setState(useUIStore.getInitialState()));

  it('clears movingLesson when switching class', () => {
    useUIStore.setState({ movingLesson: mockMovingLesson });
    useUIStore.getState().setCurrentClass('11а');
    expect(useUIStore.getState().movingLesson).toBeNull();
  });

  it('clears copiedLesson when switching class', () => {
    useUIStore.setState({ copiedLesson: mockCopiedLesson });
    useUIStore.getState().setCurrentClass('11а');
    expect(useUIStore.getState().copiedLesson).toBeNull();
  });

  it('clears selectedLesson when switching class', () => {
    useUIStore.setState({ selectedLesson: mockRequirement });
    useUIStore.getState().setCurrentClass('11а');
    expect(useUIStore.getState().selectedLesson).toBeNull();
  });

  it('clears selectedCells when switching class', () => {
    useUIStore.setState({ selectedCells: [mockCellRef] });
    useUIStore.getState().setCurrentClass('11а');
    expect(useUIStore.getState().selectedCells).toEqual([]);
  });

  it('clears showReplacementPanel when switching class', () => {
    useUIStore.setState({ showReplacementPanel: true });
    useUIStore.getState().setCurrentClass('11а');
    expect(useUIStore.getState().showReplacementPanel).toBe(false);
  });
});

// ─── QI-12: selectLesson clearing invariants ──────────────────

describe('selectLesson — clearing invariants', () => {
  beforeEach(() => useUIStore.setState(useUIStore.getInitialState()));

  it('clears movingLesson when lesson is selected', () => {
    useUIStore.setState({ movingLesson: mockMovingLesson });
    useUIStore.getState().selectLesson(mockRequirement);
    expect(useUIStore.getState().movingLesson).toBeNull();
  });

  it('clears copiedLesson when lesson is selected', () => {
    useUIStore.setState({ copiedLesson: mockCopiedLesson });
    useUIStore.getState().selectLesson(mockRequirement);
    expect(useUIStore.getState().copiedLesson).toBeNull();
  });

  it('clears selectedCells when lesson is selected', () => {
    useUIStore.setState({ selectedCells: [mockCellRef] });
    useUIStore.getState().selectLesson(mockRequirement);
    expect(useUIStore.getState().selectedCells).toEqual([]);
  });

  it('sets selectedLesson to the provided value', () => {
    useUIStore.getState().selectLesson(mockRequirement);
    expect(useUIStore.getState().selectedLesson).toEqual(mockRequirement);
  });

  it('deselects when called with null', () => {
    useUIStore.setState({ selectedLesson: mockRequirement });
    useUIStore.getState().selectLesson(null);
    expect(useUIStore.getState().selectedLesson).toBeNull();
  });
});

// Note: acknowledgeConflict / clearConflictAcks moved to scheduleStore (Z32-3)
// Tests are in scheduleStore.test.ts
