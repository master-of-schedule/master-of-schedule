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
} from '@/types';
import { forEachSlot } from './traversal';

/**
 * Create a unique key for a lesson requirement
 * Used for counting how many times a lesson has been scheduled
 */
export function getLessonKey(lesson: {
  subject: string;
  teacher: string;
  group?: string;
}): string {
  if (lesson.group) {
    return `${lesson.subject}|${lesson.teacher}|${lesson.group}`;
  }
  return `${lesson.subject}|${lesson.teacher}`;
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
  className: string
): UnscheduledLesson[] {
  const scheduledCounts = getScheduledCounts(schedule, className);
  const unscheduled: UnscheduledLesson[] = [];

  for (const req of requirements) {
    // Skip requirements for other classes
    if (req.type === 'class' && req.classOrGroup !== className) continue;
    if (req.type === 'group' && req.className !== className) continue;

    const key = getLessonKey({
      subject: req.subject,
      teacher: req.teacher,
      group: req.type === 'group' ? req.classOrGroup : undefined,
    });

    const scheduled = scheduledCounts.get(key) ?? 0;
    const remaining = req.countPerWeek - scheduled;

    if (remaining > 0) {
      unscheduled.push({
        requirement: req,
        remaining,
      });
    }
  }

  return unscheduled;
}

/**
 * Get total count of all unscheduled lessons for a class
 */
export function getTotalUnscheduledCount(
  requirements: LessonRequirement[],
  schedule: Schedule,
  className: string
): number {
  const unscheduled = getUnscheduledLessons(requirements, schedule, className);
  return unscheduled.reduce((sum, item) => sum + item.remaining, 0);
}

/**
 * Check if all lessons are scheduled for a class
 */
export function isClassFullyScheduled(
  requirements: LessonRequirement[],
  schedule: Schedule,
  className: string
): boolean {
  return getTotalUnscheduledCount(requirements, schedule, className) === 0;
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
  className: string
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

  const unscheduledCount = getTotalUnscheduledCount(requirements, schedule, className);
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

  const merged = requirements.map(r => ({ ...r }));

  for (const temp of temporaryLessons) {
    const tempKey = getLessonKey({
      subject: temp.subject,
      teacher: temp.teacher,
      group: temp.type === 'group' ? temp.classOrGroup : undefined,
    });

    const existing = merged.find(r => {
      if (r.classOrGroup !== temp.classOrGroup) return false;
      const rKey = getLessonKey({
        subject: r.subject,
        teacher: r.teacher,
        group: r.type === 'group' ? r.classOrGroup : undefined,
      });
      return rKey === tempKey;
    });

    if (existing) {
      existing.countPerWeek += temp.countPerWeek;
    } else {
      merged.push({ ...temp });
    }
  }

  return merged;
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
