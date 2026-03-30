/**
 * Keyboard shortcuts for the schedule editor.
 * Handles: Ctrl+Z/Y (undo/redo), Escape (cancel all flows), Delete/Backspace (remove selected).
 */

import { useEffect, useCallback } from 'react';
import type { CellRef, LessonRef, LessonRequirement, Schedule } from '@/types';

export interface UseEditorKeyboardParams {
  selectedCells: CellRef[];
  schedule: Schedule;
  removeLessons: (refs: LessonRef[]) => void;
  clearSelectedCells: () => void;
  setSelectedLesson: (lesson: LessonRequirement | null) => void;
  setCopiedLesson: (lesson: null) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndoEmpty?: () => void;
  onRedoEmpty?: () => void;
  // Additional Escape handlers
  closeContextMenu: () => void;
  clearMovingLesson: () => void;
  closeMoveTargetPicker: () => void;
}

export interface UseEditorKeyboardReturn {
  /** Delete all lessons in selectedCells. Exposed for use in context menus. */
  handleDeleteSelected: () => void;
}

export function useEditorKeyboard(params: UseEditorKeyboardParams): UseEditorKeyboardReturn {
  const {
    selectedCells,
    schedule,
    removeLessons,
    clearSelectedCells,
    setSelectedLesson,
    setCopiedLesson,
    undo,
    redo,
    canUndo,
    canRedo,
    onUndoEmpty,
    onRedoEmpty,
    closeContextMenu,
    clearMovingLesson,
    closeMoveTargetPicker,
  } = params;

  const handleDeleteSelected = useCallback(() => {
    if (selectedCells.length === 0) return;

    const toDelete: LessonRef[] = [];
    for (const cell of selectedCells) {
      const lessons = schedule[cell.className]?.[cell.day]?.[cell.lessonNum]?.lessons ?? [];
      lessons.forEach((_, index) => {
        toDelete.push({
          className: cell.className,
          day: cell.day,
          lessonNum: cell.lessonNum,
          lessonIndex: index,
        });
      });
    }

    if (toDelete.length > 0) {
      removeLessons(toDelete);
      clearSelectedCells();
    }
  }, [selectedCells, schedule, removeLessons, clearSelectedCells]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';

      // Undo: Ctrl+Z — use e.code (physical key) so it works with any keyboard layout
      if (e.ctrlKey && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
        else onUndoEmpty?.();
        return;
      }
      // Redo: Ctrl+Y or Ctrl+Shift+Z — use e.code for layout independence
      if ((e.ctrlKey && e.code === 'KeyY') || (e.ctrlKey && e.shiftKey && e.code === 'KeyZ')) {
        e.preventDefault();
        if (canRedo) redo();
        else onRedoEmpty?.();
        return;
      }

      if (isInputFocused) return;

      // Escape: clear selection and cancel all flows
      if (e.key === 'Escape') {
        setSelectedLesson(null);
        closeContextMenu();
        clearSelectedCells();
        setCopiedLesson(null);
        clearMovingLesson();
        closeMoveTargetPicker();
      }
      // Delete: remove all selected cells
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedCells.length > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    undo,
    redo,
    canUndo,
    canRedo,
    onUndoEmpty,
    onRedoEmpty,
    setSelectedLesson,
    closeContextMenu,
    clearSelectedCells,
    setCopiedLesson,
    clearMovingLesson,
    closeMoveTargetPicker,
    selectedCells,
    handleDeleteSelected,
  ]);

  return { handleDeleteSelected };
}
