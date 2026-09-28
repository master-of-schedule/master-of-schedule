/**
 * Counting functions for scheduled/unscheduled lessons
 * Pure functions for tracking lesson progress
 */

import type {
  Schedule,
  LessonRequirement,
  UnscheduledLesson,
  ScheduledLesson,
  LessonNumber,
  Day,
  LessonStatus,
} from '@/types';
import { forEachSlot } from './traversal';
import { getRequirementIdentityKey, getScheduledLessonIdentityKey } from './lessonIdentity';

/**
 * How many of a requirement's weekly occurrences a status already covers
 * outside the grid. 'completed'/'completed2' cover 1 or 2 occurrences
 * conducted elsewhere.
 */
function getStatusCoverage(status: LessonStatus | undefined): number {
  if (status === 'completed2') return 2;
  if (status === 'completed') return 1;
  return 0;
}

/**
 * Create a unique key for a lesson requirement
 * Used for counting how many times a lesson has been scheduled
 */
export function getLessonKey(lesson: {
  subject: string;
  teacher: string;
  teacher2?: string;
  group?: string;
}): string {
  const teachers = lesson.teacher2 ? `${lesson.teacher}|${lesson.teacher2}` : lesson.teacher;
  if (lesson.group) {
    return `${lesson.subject}|${teachers}|${lesson.group}`;
  }
  return `${lesson.subject}|${teachers}`;
}

/**
 * Count how many times each lesson has been scheduled for a class
 * Returns a map of lesson key -> count
 */
export function getScheduledCounts(
  schedule: Schedule,
  className: string
): Map<string, number> {
  const counts = new Map<string, number>();
  const classSchedule = schedule[className];

  if (!classSchedule) {
    return counts;
  }

  for (const daySchedule of Object.values(classSchedule)) {
    if (!daySchedule) continue;

    for (const slot of Object.values(daySchedule)) {
      if (!slot?.lessons) continue;

      for (const lesson of slot.lessons) {
        const key = getLessonKey(lesson);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  return counts;
}

/**
 * Get list of unscheduled lessons for a class
 * Returns lessons that still need to be placed, with remaining count
 */
export function getUnscheduledLessons(
  requirements: LessonRequirement[],
  schedule: Schedule,
  className: string,
  lessonStatuses?: Record<string, LessonStatus>
): UnscheduledLesson[] {
  const relevant = requirements.filter(req => req.type === 'class'
    ? req.classOrGroup === className
    : req.className === className);
  const lessons: ScheduledLesson[] = [];
  const classSchedule = schedule[className];
  if (classSchedule) {
    for (const daySchedule of Object.values(classSchedule)) {
      for (const slot of Object.values(daySchedule ?? {})) lessons.push(...(slot?.lessons ?? []));
    }
  }

  const byIdentity = new Map<string, LessonRequirement[]>();
  for (const req of relevant) {
    const key = getRequirementIdentityKey(req);
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), req]);
  }

  const allocated = new Map<string, number>();
  for (const [key, reqs] of byIdentity) {
    const matching = lessons.filter(lesson => getScheduledLessonIdentityKey(className, lesson) === key);
    let budget = matching.length;

    // Preserve exact IDs first. A second pass absorbs legacy rows that used a merged/base ID.
    for (const req of reqs) {
      const exact = matching.filter(lesson => lesson.requirementId === req.id).length;
      const amount = Math.min(exact, req.countPerWeek, budget);
      allocated.set(req.id, amount);
      budget -= amount;
    }
    for (const req of reqs) {
      if (budget <= 0) break;
      const capacity = req.countPerWeek - (allocated.get(req.id) ?? 0);
      const amount = Math.min(capacity, budget);
      allocated.set(req.id, (allocated.get(req.id) ?? 0) + amount);
      budget -= amount;
    }
  }

  return relevant.flatMap(req => {
    const covered = getStatusCoverage(lessonStatuses?.[req.id]);
    const remaining = Math.max(0, req.countPerWeek - (allocated.get(req.id) ?? 0) - covered);
    return remaining > 0 ? [{ requirement: req, remaining }] : [];
  });
}

/**
 * Get total count of all unscheduled lessons for a class
 */
export function getTotalUnscheduledCount(
  requirements: LessonRequirement[],
  schedule: Schedule,
  className: string,
  lessonStatuses?: Record<string, LessonStatus>
): number {
  const unscheduled = getUnscheduledLessons(requirements, schedule, className, lessonStatuses);
  return unscheduled.reduce((sum, item) => sum + item.remaining, 0);
}

/**
 * Check if all lessons are scheduled for a class
 */
export function isClassFullyScheduled(
  requirements: LessonRequirement[],
  schedule: Schedule,
  className: string,
  lessonStatuses?: Record<string, LessonStatus>
): boolean {
  return getTotalUnscheduledCount(requirements, schedule, className, lessonStatuses) === 0;
}

/**
 * Get the set of class names (from the given list) that still have unscheduled
 * lessons, for highlighting in the class list. Lessons covered by a status
 * ('completed'/'completed2') don't count as unscheduled.
 */
export function getClassesWithRemaining(
  classNames: string[],
  requirements: LessonRequirement[],
  schedule: Schedule,
  lessonStatuses?: Record<string, LessonStatus>
): Set<string> {
  const result = new Set<string>();
  for (const name of classNames) {
    if (getTotalUnscheduledCount(requirements, schedule, name, lessonStatuses) > 0) {
      result.add(name);
    }
  }
  return result;
}

/**
 * Get progress stats for a class
 */
export interface ClassProgress {
  className: string;
  totalRequired: number;
  totalScheduled: number;
  percentage: number;
}

export function getClassProgress(
  requirements: LessonRequirement[],
  schedule: Schedule,
  className: string,
  lessonStatuses?: Record<string, LessonStatus>
): ClassProgress {
  // Calculate total required lessons for this class
  let totalRequired = 0;
  for (const req of requirements) {
    if (req.type === 'class' && req.classOrGroup === className) {
      totalRequired += req.countPerWeek;
    }
    if (req.type === 'group' && req.className === className) {
      totalRequired += req.countPerWeek;
    }
  }

  const unscheduledCount = getTotalUnscheduledCount(requirements, schedule, className, lessonStatuses);
  const totalScheduled = totalRequired - unscheduledCount;
  const percentage = totalRequired > 0 ? Math.round((totalScheduled / totalRequired) * 100) : 100;

  return {
    className,
    totalRequired,
    totalScheduled,
    percentage,
  };
}

/**
 * Merge global lesson requirements with per-version temporary lessons.
 * If a temporary lesson matches an existing requirement (same lesson key + classOrGroup),
 * increases countPerWeek on the existing entry. Otherwise adds as new entry.
 * This ensures getUnscheduledLessons computes correct remaining counts.
 */
export function mergeWithTemporaryLessons(
  requirements: LessonRequirement[],
  temporaryLessons: LessonRequirement[]
): LessonRequirement[] {
  if (temporaryLessons.length === 0) return requirements;
  return [...requirements, ...temporaryLessons];
}

/**
 * Count lessons per day for a class (for distribution analysis)
 */
export function getLessonsPerDay(
  schedule: Schedule,
  className: string
): Map<Day, number> {
  const counts = new Map<Day, number>();
  const classSchedule = schedule[className];

  if (!classSchedule) {
    return counts;
  }

  for (const [day, daySchedule] of Object.entries(classSchedule)) {
    if (!daySchedule) continue;

    let dayCount = 0;
    for (const slot of Object.values(daySchedule)) {
      if (slot?.lessons) {
        dayCount += slot.lessons.length;
      }
    }

    counts.set(day as Day, dayCount);
  }

  return counts;
}

/**
 * Count lessons per day for a teacher
 */
export function getTeacherLessonsPerDay(
  schedule: Schedule,
  teacherName: string
): Map<Day, number> {
  const counts = new Map<Day, number>();

  forEachSlot(schedule, (_className, day, _lessonNum, lessons) => {
    for (const lesson of lessons) {
      if (lesson.teacher === teacherName || lesson.teacher2 === teacherName) {
        counts.set(day, (counts.get(day) ?? 0) + 1);
      }
    }
  });

  return counts;
}

/**
 * Get all teachers who have lessons on a specific day
 */
export function getTeachersOnDay(
  schedule: Schedule,
  day: Day
): Set<string> {
  const teachers = new Set<string>();

  forEachSlot(schedule, (_className, slotDay, _lessonNum, lessons) => {
    if (slotDay !== day) return;
    for (const lesson of lessons) {
      teachers.add(lesson.teacher);
      if (lesson.teacher2) teachers.add(lesson.teacher2);
    }
  });

  return teachers;
}

/**
 * Get all lesson slots for a teacher on a specific day, across all classes.
 * Returns entries sorted by lesson number then class name.
 */
export function getTeacherLessonsOnDay(
  schedule: Schedule,
  teacherName: string,
  day: Day
): { className: string; lessonNum: LessonNumber; lessons: ScheduledLesson[] }[] {
  const results: { className: string; lessonNum: LessonNumber; lessons: ScheduledLesson[] }[] = [];

  forEachSlot(schedule, (className, slotDay, lessonNum, lessons) => {
    if (slotDay !== day) return;
    const teacherLessons = lessons.filter(l => l.teacher === teacherName || l.teacher2 === teacherName);
    if (teacherLessons.length > 0) {
      results.push({ className, lessonNum, lessons: teacherLessons });
    }
  });

  results.sort((a, b) => a.lessonNum - b.lessonNum || a.className.localeCompare(b.className, 'ru', { numeric: true }));
  return results;
}

/**
 * Get all lesson slots using a specific room on a given day, across all classes.
 * Returns entries sorted by lesson number then class name.
 */
export function getRoomLessonsOnDay(
  schedule: Schedule,
  roomName: string,
  day: Day
): { className: string; lessonNum: LessonNumber; lessons: ScheduledLesson[] }[] {
  const results: { className: string; lessonNum: LessonNumber; lessons: ScheduledLesson[] }[] = [];

  forEachSlot(schedule, (className, slotDay, lessonNum, lessons) => {
    if (slotDay !== day) return;
    const roomLessons = lessons.filter(l => l.room === roomName);
    if (roomLessons.length > 0) {
      results.push({ className, lessonNum, lessons: roomLessons });
    }
  });

  results.sort((a, b) => a.lessonNum - b.lessonNum || a.className.localeCompare(b.className, 'ru', { numeric: true }));
  return results;
}
