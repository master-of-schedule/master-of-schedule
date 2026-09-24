/**
 * History/Protocol types for undo/redo
 */

import type { Schedule } from './schedule';
import type { Substitution } from './substitutions';
import type { RemovedLesson, SickLeave } from './removedLessons';

/**
 * Action types that can be recorded in history
 */
export type HistoryActionType =
  | 'assign'
  | 'remove'
  | 'temporary_remove'
  | 'complete'
  | 'clear_complete'
  | 'sick_leave'
  | 'change_room'
  | 'substitute'
  | 'multi_remove'
  | 'import';

/**
 * A single entry in the history/protocol
 */
export interface HistoryEntry {
  id: string;
  /** When this action was performed */
  timestamp: Date;
  /** Type of action */
  actionType: HistoryActionType;
  /** Human-readable description */
  description: string;
  /** Complete schedule state after this action */
  schedule: Schedule;
  /** Complete substitutions state after this action */
  substitutions: Substitution[];
  /** Weekly removal categories after this action. */
  removedLessons?: RemovedLesson[];
  /** Weekly teacher/day illness marks after this action. */
  sickLeaves?: SickLeave[];
}

/**
 * Generate description for history entry
 */
export function describeAction(
  actionType: HistoryActionType,
  details: {
    subject?: string;
    teacher?: string;
    className?: string;
    day?: string;
    lessonNum?: number;
    room?: string;
    count?: number;
  }
): string {
  switch (actionType) {
    case 'assign':
      return `Добавлено: ${details.subject} ${details.className} ${details.day}-${details.lessonNum}`;
    case 'remove':
      return `Удалено: ${details.subject} ${details.className} ${details.day}-${details.lessonNum}`;
    case 'temporary_remove':
      return `Временно удалено: ${details.subject} ${details.className} ${details.day}-${details.lessonNum}`;
    case 'complete':
      return `Проведено: ${details.subject} ${details.className}`;
    case 'clear_complete':
      return `Снята отметка «Проведено»: ${details.subject} ${details.className}`;
    case 'sick_leave':
      return `Больничный: ${details.teacher} ${details.day}`;
    case 'change_room':
      return `Кабинет: ${details.subject} ${details.className} → ${details.room}`;
    case 'substitute':
      return `Замена: ${details.teacher} ${details.className} ${details.day}-${details.lessonNum}`;
    case 'multi_remove':
      return details.className
        ? `Удалено: ${details.count} занятий (${details.className})`
        : `Удалено: ${details.count} занятий`;
    case 'import':
      return `Импорт расписания`;
    default:
      return 'Изменение';
  }
}
