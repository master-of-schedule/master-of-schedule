import type { Day, LessonNumber } from './constants';
import type { LessonRequirement, ScheduledLesson } from './schedule';

/** Why one concrete lesson occurrence was removed from a weekly schedule. */
export type RemovedLessonReason = 'temporary' | 'withdrawn' | 'sick';

/**
 * Persisted snapshot of one removed weekly lesson occurrence.
 *
 * The requirement and scheduled-lesson snapshots keep the entry usable even
 * when master data is edited after the lesson was removed.
 */
export interface RemovedLesson {
  id: string;
  reason: RemovedLessonReason;
  className: string;
  day: Day;
  lessonNum: LessonNumber;
  requirement: LessonRequirement;
  lesson: ScheduledLesson;
}

/** A teacher/day pair explicitly marked as sick in a weekly version. */
export interface SickLeave {
  teacher: string;
  day: Day;
}
