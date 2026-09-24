import type {
  LessonRequirement,
  RemovedLesson,
  RemovedLessonReason,
  UnscheduledLesson,
} from '@/types';
import { getLessonKey } from './counting';

export interface WeeklyLessonGroupItem {
  requirement: LessonRequirement;
  remaining: number;
  /** Explicit removed occurrences represented by this row. */
  removalIds: string[];
}

export interface WeeklyLessonGroups {
  temporary: WeeklyLessonGroupItem[];
  withdrawn: WeeklyLessonGroupItem[];
  sick: WeeklyLessonGroupItem[];
  completed: WeeklyLessonGroupItem[];
}

function requirementKey(requirement: LessonRequirement): string {
  return `${requirement.classOrGroup}|${getLessonKey({
    subject: requirement.subject,
    teacher: requirement.teacher,
    group: requirement.type === 'group' ? requirement.classOrGroup : undefined,
  })}`;
}

function belongsToClass(requirement: LessonRequirement, className: string): boolean {
  return requirement.type === 'class'
    ? requirement.classOrGroup === className
    : requirement.className === className;
}

function compareItems(a: WeeklyLessonGroupItem, b: WeeklyLessonGroupItem): number {
  return a.requirement.subject.localeCompare(b.requirement.subject, 'ru') ||
    a.requirement.teacher.localeCompare(b.requirement.teacher, 'ru') ||
    a.requirement.classOrGroup.localeCompare(b.requirement.classOrGroup, 'ru');
}

function pushOccurrence(
  target: WeeklyLessonGroupItem[],
  requirement: LessonRequirement,
  removalId?: string,
  count = 1,
): void {
  const key = requirementKey(requirement);
  const existing = target.find(item => requirementKey(item.requirement) === key);
  if (existing) {
    existing.remaining += count;
    if (removalId) existing.removalIds.push(removalId);
    return;
  }
  target.push({
    requirement: { ...requirement },
    remaining: count,
    removalIds: removalId ? [removalId] : [],
  });
}

/**
 * Split weekly unscheduled work by why each occurrence left the grid.
 * Explicit removal records consume the arithmetic remainder for the same
 * requirement; any legacy/unclassified remainder is treated as withdrawn.
 */
export function buildWeeklyLessonGroups(
  unscheduled: UnscheduledLesson[],
  removedLessons: RemovedLesson[],
  className: string,
): WeeklyLessonGroups {
  const groups: WeeklyLessonGroups = { temporary: [], withdrawn: [], sick: [], completed: [] };
  const explicitCounts = new Map<string, number>();

  for (const removed of removedLessons) {
    if (removed.className !== className || !belongsToClass(removed.requirement, className)) continue;
    pushOccurrence(groups[removed.reason], removed.requirement, removed.id);
    const key = requirementKey(removed.requirement);
    explicitCounts.set(key, (explicitCounts.get(key) ?? 0) + 1);
  }

  for (const item of unscheduled) {
    const key = requirementKey(item.requirement);
    const unclassified = Math.max(0, item.remaining - (explicitCounts.get(key) ?? 0));
    if (unclassified > 0) {
      pushOccurrence(groups.withdrawn, item.requirement, undefined, unclassified);
    }
  }

  groups.temporary.sort(compareItems);
  groups.withdrawn.sort(compareItems);
  groups.sick.sort(compareItems);
  groups.completed.sort(compareItems);
  return groups;
}

/** Weekly class highlighting is driven only by lessons that must be returned. */
export function getClassesWithTemporaryRemovals(removedLessons: RemovedLesson[]): Set<string> {
  return new Set(
    removedLessons
      .filter(item => item.reason === 'temporary')
      .map(item => item.className)
  );
}

export function isAssignableRemovalReason(reason: RemovedLessonReason): boolean {
  return reason !== 'sick' && reason !== 'completed';
}
