/**
 * UI state types
 */

import type { CellRef, LessonRequirement } from './schedule';
import type { Day } from './constants';
import type { CellStatus } from './constants';

// Re-export CellStatus for convenience (used in logic layer)
export type { CellStatus };

/**
 * Application tabs/views
 */
export type AppTab = 'start' | 'editor' | 'export' | 'data' | 'settings' | 'help';

/**
 * Selected lesson from unscheduled list
 */
export interface SelectedLesson {
  requirement: LessonRequirement;
}

/**
 * Search result for highlighting
 */
export interface SearchResult {
  cellRef: CellRef;
  lessonIndex: number;
  matchedField: 'subject' | 'teacher' | 'room';
}

/**
 * Cell status with optional conflict info
 */
export type CellStatusInfo =
  | { status: 'available' }
  | { status: 'same' }
  | { status: 'teacher_banned' }
  | { status: 'class_occupied' }
  | {
      status: 'teacher_busy';
      conflictClass: string;
      conflictSubject: string;
    }
  | {
      /** Partner unit has the teacher busy at this slot (shown as gray) */
      status: 'partner_busy';
      teacherName: string;
    };

/**
 * Context menu position
 */
export interface ContextMenuPosition {
  x: number;
  y: number;
}

/**
 * Context menu state
 */
export interface ContextMenuState {
  isOpen: boolean;
  position: ContextMenuPosition | null;
  cellRef: CellRef | null;
  lessonIndex: number | null;
}

/**
 * Modal types
 */
export type ModalType =
  | 'room_picker'
  | 'save_version'
  | 'confirm_delete'
  | 'substitution_list'
  | null;

/**
 * Absent teacher tracking
 */
export interface AbsentTeacherState {
  teacherName: string | null;
  day: Day | null;
}
