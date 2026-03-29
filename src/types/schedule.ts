/**
 * Schedule-related types
 */

import type { Day, LessonNumber } from './constants';

/**
 * Lesson requirement - defines what needs to be scheduled
 */
export interface LessonRequirement {
  id: string;
  /** 'class' for regular lessons, 'group' for split groups */
  type: 'class' | 'group';
  /** Class name "10а" or group name "10а(д)" */
  classOrGroup: string;
  /** Subject name */
  subject: string;
  /** Teacher full name */
  teacher: string;
  /** How many times per week */
  countPerWeek: number;
  /** For group lessons: the parallel group name */
  parallelGroup?: string;
  /** Parent class name (for groups) */
  className?: string;
  /** Second teacher (for co-teaching, temporary lessons only) */
  teacher2?: string;
}

/**
 * A lesson that has been placed in the schedule
 */
export interface ScheduledLesson {
  id: string;
  /** Reference to the requirement this fulfills */
  requirementId: string;
  /** Subject name */
  subject: string;
  /** Teacher full name */
  teacher: string;
  /** Second teacher (co-teaching, weekly/technical only) */
  teacher2?: string;
  /** Room short name */
  room: string;
  /** Group index if this is a group lesson, e.g., "(д)" */
  group?: string;
  /** True if this is a substitute teacher */
  isSubstitution?: boolean;
  /** Original teacher if this is a substitution */
  originalTeacher?: string;
  /** True if placed bypassing teacher bans / busy constraints (weekly mode only) */
  forceOverride?: boolean;
  /** True when this substitution is paid by the union (профсоюз), not the budget */
  isUnionSubstitution?: boolean;
}

/**
 * A single slot in the schedule grid
 */
export interface ScheduleSlot {
  /** Lessons in this slot (0-2 for parallel groups) */
  lessons: ScheduledLesson[];
}

/**
 * Schedule for one day (lesson number -> slot)
 */
export type DaySchedule = Record<LessonNumber, ScheduleSlot>;

/**
 * Schedule for one class (day -> day schedule)
 */
export type ClassSchedule = Partial<Record<Day, Partial<DaySchedule>>>;

/**
 * Complete schedule (class name -> class schedule)
 */
export type Schedule = Record<string, ClassSchedule>;

/**
 * Reference to a specific cell in the grid
 */
export interface CellRef {
  className: string;
  day: Day;
  lessonNum: LessonNumber;
}

/**
 * Reference to a specific lesson within a cell
 */
export interface LessonRef extends CellRef {
  lessonIndex: number;
}

/**
 * Unscheduled lesson info for display
 */
export interface UnscheduledLesson {
  requirement: LessonRequirement;
  remaining: number;
}
