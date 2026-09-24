/**
 * Type definitions index - re-exports all types
 */

// Constants
export {
  DAYS,
  MAX_LESSONS_PER_DAY,
  LESSON_NUMBERS,
  VERSION_TYPES,
  CELL_STATUSES,
} from './constants';
export type { Day, LessonNumber, VersionType, CellStatus } from './constants';

// Entities
export type {
  DayBans,
  Teacher,
  Room,
  SchoolClass,
  Group,
} from './entities';

// Schedule
export type {
  LessonRequirement,
  ScheduledLesson,
  ScheduleSlot,
  DaySchedule,
  ClassSchedule,
  Schedule,
  CellRef,
  LessonRef,
  UnscheduledLesson,
} from './schedule';

// Versions
export type { Version, VersionListItem, LessonStatus } from './versions';

// Substitutions
export type { Substitution } from './substitutions';
export { formatSubstitution } from './substitutions';

// History
export type { HistoryActionType, HistoryEntry } from './history';
export type { RemovedLessonReason, RestorableLessonReason, RemovedLesson, SickLeave } from './removedLessons';
export { describeAction } from './history';

// UI
export type {
  AppTab,
  SelectedLesson,
  SearchResult,
  CellStatusInfo,
  ContextMenuPosition,
  ContextMenuState,
  ModalType,
  AbsentTeacherState,
} from './ui';

// Partner availability
export type { PartnerAvailabilityFile } from './partner';
