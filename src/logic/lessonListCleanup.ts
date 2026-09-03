import type { Day, Group, LessonNumber, LessonRef, LessonRequirement, Schedule, ScheduledLesson } from '@/types';
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

export interface LessonListRequirementUpdates {
  additions: Omit<LessonRequirement, 'id'>[];
  updates: Array<{ id: string; countPerWeek: number }>;
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

  for (const requirement of [...requirements, ...temporaryLessons]) {
    const key = requirementCleanupKey(requirement);
    allowedCounts.set(key, (allowedCounts.get(key) ?? 0) + allowedLessonCount(requirement.countPerWeek));
  }

  const seenCounts = new Map<string, number>();
  const removals: LessonListCleanupRemoval[] = [];

  forEachSlot(schedule, (className, day, lessonNum, lessons) => {
    lessons.forEach((lesson, lessonIndex) => {
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

export function getLessonListRequirementUpdates(
  selectedRemovals: LessonListCleanupRemoval[],
  requirements: LessonRequirement[],
  groups: Group[]
): LessonListRequirementUpdates {
  const selectedCounts = new Map<string, { removal: LessonListCleanupRemoval; count: number }>();

  for (const removal of selectedRemovals) {
    const key = scheduledLessonCleanupKey(removal.className, removal.lesson);
    const selected = selectedCounts.get(key);
    if (selected) {
      selected.count += 1;
    } else {
      selectedCounts.set(key, { removal, count: 1 });
    }
  }

  const additions: Omit<LessonRequirement, 'id'>[] = [];
  const updates: Array<{ id: string; countPerWeek: number }> = [];

  for (const [key, selected] of selectedCounts) {
    const existing = requirements.find(requirement => requirementCleanupKey(requirement) === key);
    if (existing) {
      updates.push({ id: existing.id, countPerWeek: existing.countPerWeek + selected.count });
      continue;
    }

    const { lesson, className } = selected.removal;
    const group = lesson.group ? groups.find(item => item.name === lesson.group) : undefined;
    additions.push({
      type: lesson.group ? 'group' : 'class',
      classOrGroup: lesson.group ?? className,
      subject: lesson.subject,
      teacher: lesson.teacher,
      teacher2: lesson.teacher2,
      countPerWeek: selected.count,
      className: lesson.group ? group?.className ?? className : undefined,
      parallelGroup: group?.parallelGroup,
    });
  }

  return { additions, updates };
}
