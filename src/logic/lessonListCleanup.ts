import type { Day, LessonNumber, LessonRef, LessonRequirement, Schedule, ScheduledLesson } from '@/types';
import { forEachSlot } from './traversal';

export interface LessonListCleanupRemoval extends LessonRef {
  lesson: ScheduledLesson;
  reason: 'missing' | 'excess';
}

export interface LessonListCleanupPlan {
  removals: LessonListCleanupRemoval[];
  missingCount: number;
  excessCount: number;
}

function normalizeKeyPart(value: string | undefined): string {
  return (value ?? '').trim();
}

function requirementCleanupKey(requirement: LessonRequirement): string {
  return [
    requirement.type,
    requirement.classOrGroup,
    requirement.subject,
    requirement.teacher,
    requirement.teacher2 ?? '',
  ].map(normalizeKeyPart).join('|');
}

function scheduledLessonCleanupKey(className: string, lesson: ScheduledLesson): string {
  return [
    lesson.group ? 'group' : 'class',
    lesson.group ?? className,
    lesson.subject,
    lesson.teacher,
    lesson.teacher2 ?? '',
  ].map(normalizeKeyPart).join('|');
}

function allowedLessonCount(countPerWeek: number): number {
  return Math.max(0, Math.ceil(countPerWeek));
}

export function findLessonListCleanupPlan(
  schedule: Schedule,
  requirements: LessonRequirement[],
  temporaryLessons: LessonRequirement[]
): LessonListCleanupPlan {
  const allowedCounts = new Map<string, number>();
  const temporaryIds = new Set(temporaryLessons.map(lesson => lesson.id));

  for (const requirement of requirements) {
    const key = requirementCleanupKey(requirement);
    allowedCounts.set(key, (allowedCounts.get(key) ?? 0) + allowedLessonCount(requirement.countPerWeek));
  }

  const seenCounts = new Map<string, number>();
  const removals: LessonListCleanupRemoval[] = [];

  forEachSlot(schedule, (className, day, lessonNum, lessons) => {
    lessons.forEach((lesson, lessonIndex) => {
      if (temporaryIds.has(lesson.requirementId)) return;

      const key = scheduledLessonCleanupKey(className, lesson);
      const allowed = allowedCounts.get(key) ?? 0;

      if (allowed === 0) {
        removals.push({
          className,
          day: day as Day,
          lessonNum: lessonNum as LessonNumber,
          lessonIndex,
          lesson,
          reason: 'missing',
        });
        return;
      }

      const seen = (seenCounts.get(key) ?? 0) + 1;
      seenCounts.set(key, seen);

      if (seen > allowed) {
        removals.push({
          className,
          day: day as Day,
          lessonNum: lessonNum as LessonNumber,
          lessonIndex,
          lesson,
          reason: 'excess',
        });
      }
    });
  });

  return {
    removals,
    missingCount: removals.filter(removal => removal.reason === 'missing').length,
    excessCount: removals.filter(removal => removal.reason === 'excess').length,
  };
}

export function getLessonListCleanupSignature(plan: LessonListCleanupPlan): string {
  return plan.removals
    .map(removal => [
      removal.className,
      removal.day,
      removal.lessonNum,
      removal.lessonIndex,
      removal.lesson.id,
      removal.reason,
    ].join('|'))
    .join('||');
}
