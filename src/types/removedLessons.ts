import type { Day, LessonNumber } from './constants';
import type { LessonRequirement, ScheduledLesson } from './schedule';

/** Mutually exclusive off-grid state of one weekly lesson occurrence. */
export type RemovedLessonReason = 'temporary' | 'withdrawn' | 'sick' | 'completed';
export type RestorableLessonReason = Exclude<RemovedLessonReason, 'completed'>;

/**
 * Persisted snapshot of one removed weekly lesson occurrence.
 *
 * The requirement and scheduled-lesson snapshots keep the entry usable even
 * when master data is edited after the lesson was removed.
 */
export interface RemovedLesson {
  id: string;
  reason: RemovedLessonReason;
  /** State restored when a completed mark is cleared. */
  previousReason?: RestorableLessonReason;
  className: string;
  /** Original slot, absent for a legacy unplaced occurrence materialized as completed. */
  day?: Day;
  lessonNum?: LessonNumber;
  requirement: LessonRequirement;
  lesson: ScheduledLesson;
}

/** A teacher/day pair explicitly marked as sick in a weekly version. */
export interface SickLeave {
  teacher: string;
  day: Day;
}
