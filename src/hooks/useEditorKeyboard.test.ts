/**
 * Tests for useEditorKeyboard hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEditorKeyboard } from './useEditorKeyboard';
import type { CellRef, LessonRef, Schedule } from '@/types';

// Helper to fire a keyboard event. Pass code explicitly for shortcuts that use e.code.
function fireKey(key: string, options: Partial<KeyboardEventInit> = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));
}

function fireCode(code: string, options: Partial<KeyboardEventInit> = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...options }));
}

function makeSchedule(className = '5а'): Schedule {
  return {
    [className]: {
      'Пн': {
        1: { lessons: [{ id: 'l-1', requirementId: 'r-1', subject: 'Математика', teacher: 'Иванова Т.С.', room: '-114-' }] },
        2: { lessons: [] }, 3: { lessons: [] }, 4: { lessons: [] },
        5: { lessons: [] }, 6: { lessons: [] }, 7: { lessons: [] }, 8: { lessons: [] },
      },
    },
  };
}

describe('useEditorKeyboard', () => {
  const removeLessons = vi.fn();
  const clearSelectedCells = vi.fn();
  const setSelectedLesson = vi.fn();
  const setCopiedLesson = vi.fn();
  const undo = vi.fn();
  const redo = vi.fn();
  const closeContextMenu = vi.fn();
  const clearMovingLesson = vi.fn();
  const closeMoveTargetPicker = vi.fn();

  const onUndoEmpty = vi.fn();
  const onRedoEmpty = vi.fn();

  const baseParams = {
    selectedCells: [] as CellRef[],
    schedule: {} as Schedule,
    removeLessons,
    clearSelectedCells,
    setSelectedLesson,
    setCopiedLesson,
    undo,
    redo,
    canUndo: true,
    canRedo: true,
    onUndoEmpty,
    onRedoEmpty,
    closeContextMenu,
    clearMovingLesson,
    closeMoveTargetPicker,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Ctrl+Z triggers undo', () => {
    renderHook(() => useEditorKeyboard(baseParams));
    fireCode('KeyZ', { ctrlKey: true });
    expect(undo).toHaveBeenCalledOnce();
  });

  it('Ctrl+Z triggers undo even with Russian keyboard layout (key=я)', () => {
    renderHook(() => useEditorKeyboard(baseParams));
    fireCode('KeyZ', { ctrlKey: true, key: 'я' });
    expect(undo).toHaveBeenCalledOnce();
  });

  it('Ctrl+Y triggers redo', () => {
    renderHook(() => useEditorKeyboard(baseParams));
    fireCode('KeyY', { ctrlKey: true });
    expect(redo).toHaveBeenCalledOnce();
  });

  it('Ctrl+Y triggers redo even with Russian keyboard layout (key=н)', () => {
    renderHook(() => useEditorKeyboard(baseParams));
    fireCode('KeyY', { ctrlKey: true, key: 'н' });
    expect(redo).toHaveBeenCalledOnce();
  });

  it('Ctrl+Shift+Z triggers redo', () => {
    renderHook(() => useEditorKeyboard(baseParams));
    fireCode('KeyZ', { ctrlKey: true, shiftKey: true });
    expect(redo).toHaveBeenCalledOnce();
  });

  it('Escape clears selection, lesson, copied lesson, moving lesson, context menu', () => {
    renderHook(() => useEditorKeyboard(baseParams));
    fireKey('Escape');
    expect(setSelectedLesson).toHaveBeenCalledWith(null);
    expect(clearSelectedCells).toHaveBeenCalledOnce();
    expect(setCopiedLesson).toHaveBeenCalledWith(null);
    expect(clearMovingLesson).toHaveBeenCalledOnce();
    expect(closeContextMenu).toHaveBeenCalledOnce();
    expect(closeMoveTargetPicker).toHaveBeenCalledOnce();
  });

  it('Delete with no selectedCells does nothing', () => {
    renderHook(() => useEditorKeyboard({ ...baseParams, selectedCells: [] }));
    fireKey('Delete');
    expect(removeLessons).not.toHaveBeenCalled();
  });

  it('Delete with selectedCells removes all lessons in selected cells', () => {
    const schedule = makeSchedule('5а');
    const selectedCells: CellRef[] = [{ className: '5а', day: 'Пн', lessonNum: 1 }];
    renderHook(() => useEditorKeyboard({ ...baseParams, selectedCells, schedule }));
    fireKey('Delete');
    expect(removeLessons).toHaveBeenCalledOnce();
    const refs = removeLessons.mock.calls[0][0] as LessonRef[];
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ className: '5а', day: 'Пн', lessonNum: 1, lessonIndex: 0 });
    expect(clearSelectedCells).toHaveBeenCalledOnce();
  });

  it('Backspace works the same as Delete', () => {
    const schedule = makeSchedule('5а');
    const selectedCells: CellRef[] = [{ className: '5а', day: 'Пн', lessonNum: 1 }];
    renderHook(() => useEditorKeyboard({ ...baseParams, selectedCells, schedule }));
    fireKey('Backspace');
    expect(removeLessons).toHaveBeenCalledOnce();
  });

  it('Ctrl+Z calls onUndoEmpty when canUndo is false', () => {
    renderHook(() => useEditorKeyboard({ ...baseParams, canUndo: false }));
    fireCode('KeyZ', { ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
    expect(onUndoEmpty).toHaveBeenCalledOnce();
  });

  it('Ctrl+Y calls onRedoEmpty when canRedo is false', () => {
    renderHook(() => useEditorKeyboard({ ...baseParams, canRedo: false }));
    fireCode('KeyY', { ctrlKey: true });
    expect(redo).not.toHaveBeenCalled();
    expect(onRedoEmpty).toHaveBeenCalledOnce();
  });

  it('Ctrl+Shift+Z calls onRedoEmpty when canRedo is false', () => {
    renderHook(() => useEditorKeyboard({ ...baseParams, canRedo: false }));
    fireCode('KeyZ', { ctrlKey: true, shiftKey: true });
    expect(redo).not.toHaveBeenCalled();
    expect(onRedoEmpty).toHaveBeenCalledOnce();
  });

  it('Ctrl+Z works even when an input element is focused', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    renderHook(() => useEditorKeyboard(baseParams));
    fireCode('KeyZ', { ctrlKey: true });
    expect(undo).toHaveBeenCalledOnce();

    document.body.removeChild(input);
  });

  it('Escape does NOT fire when input is focused', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    renderHook(() => useEditorKeyboard(baseParams));
    fireKey('Escape');
    expect(setSelectedLesson).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });
});
