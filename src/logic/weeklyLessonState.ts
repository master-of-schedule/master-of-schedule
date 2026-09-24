import type {
  Day,
  LessonRequirement,
  LessonStatus,
  RemovedLesson,
  RestorableLessonReason,
  ScheduledLesson,
} from '@/types';
import { getLessonKey } from './counting';

export interface CompleteLessonParams {
  requirement: LessonRequirement;
  className: string;
  removalIds: string[];
  count: number;
  implicitReason: RestorableLessonReason;
}

export function getRequirementClassName(requirement: LessonRequirement): string {
  return requirement.type === 'group'
    ? requirement.className ?? requirement.classOrGroup
    : requirement.classOrGroup;
}

export function getOffGridLessonKey(requirement: LessonRequirement, className: string): string {
  return `${className}|${getLessonKey({
    subject: requirement.subject,
    teacher: requirement.teacher,
    group: requirement.type === 'group' ? requirement.classOrGroup : undefined,
  })}`;
}

function scheduledSnapshot(requirement: LessonRequirement, id: string): ScheduledLesson {
  return {
    id: `completed-lesson-${id}`,
    requirementId: requirement.id,
    subject: requirement.subject,
    teacher: requirement.teacher,
    teacher2: requirement.teacher2,
    room: '',
    group: requirement.type === 'group' ? requirement.classOrGroup : undefined,
  };
}

/**
 * Move concrete off-grid occurrences into the mutually exclusive completed state.
 * If the row contains legacy/unclassified remainder, materialize those occurrences
 * so future transitions always operate on stable IDs.
 */
export function completeLessonOccurrences(
  occurrences: RemovedLesson[],
  params: CompleteLessonParams,
  createId: () => string,
): RemovedLesson[] {
  let remaining = Math.max(0, Math.floor(params.count));
  if (remaining === 0) return occurrences;

  const selectedIds = new Set(params.removalIds);
  const result = occurrences.map((item) => {
    if (remaining === 0 || !selectedIds.has(item.id) || item.reason === 'completed') return item;
    remaining -= 1;
    return {
      ...item,
      previousReason: item.reason,
      reason: 'completed' as const,
    };
  });

  while (remaining > 0) {
    const id = createId();
    result.push({
      id,
      reason: 'completed',
      previousReason: params.implicitReason,
      className: params.className,
      requirement: { ...params.requirement },
      lesson: scheduledSnapshot(params.requirement, id),
    });
    remaining -= 1;
  }

  return result;
}

/** Restore only the completed occurrences represented by the selected row. */
export function restoreCompletedOccurrences(
  occurrences: RemovedLesson[],
  occurrenceIds: string[],
): RemovedLesson[] {
  const selectedIds = new Set(occurrenceIds);
  return occurrences.map((item) => {
    if (!selectedIds.has(item.id) || item.reason !== 'completed') return item;
    const { previousReason, ...rest } = item;
    return {
      ...rest,
      reason: previousReason ?? 'withdrawn',
    };
  });
}

/** Keep sick-day transitions symmetric, including the state hidden below completed. */
export function reclassifySickDayOccurrences(
  occurrences: RemovedLesson[],
  teacher: string,
  day: Day,
  isSick: boolean,
): RemovedLesson[] {
  return occurrences.map((item) => {
    if (item.day !== day || (item.lesson.teacher !== teacher && item.lesson.teacher2 !== teacher)) {
      return item;
    }

    if (item.reason === 'completed') {
      if (isSick && item.previousReason === 'withdrawn') return { ...item, previousReason: 'sick' };
      if (!isSick && item.previousReason === 'sick') return { ...item, previousReason: 'withdrawn' };
      return item;
    }

    if (isSick && item.reason === 'withdrawn') return { ...item, reason: 'sick' };
    if (!isSick && item.reason === 'sick') return { ...item, reason: 'withdrawn' };
    return item;
  });
}

export function getCompletedCounts(occurrences: RemovedLesson[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of occurrences) {
    if (item.reason !== 'completed') continue;
    const key = getOffGridLessonKey(item.requirement, item.className);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Convert the pre-3.10 requirement-wide status into concrete completed occurrences. */
export function migrateLegacyLessonStatuses(
  requirements: LessonRequirement[],
  temporaryLessons: LessonRequirement[],
  occurrences: RemovedLesson[],
  statuses: Record<string, LessonStatus> | undefined,
  createId: () => string,
): RemovedLesson[] {
  if (!statuses || Object.keys(statuses).length === 0) return occurrences;

  let result = occurrences;
  const candidates = [...requirements, ...temporaryLessons];
  for (const [requirementId, status] of Object.entries(statuses)) {
    const requirement = candidates.find(item => item.id === requirementId);
    if (!requirement) continue;
    const className = getRequirementClassName(requirement);
    const key = getOffGridLessonKey(requirement, className);
    const removalIds = result
      .filter(item => item.reason !== 'completed' && getOffGridLessonKey(item.requirement, item.className) === key)
      .sort((a, b) => {
        const priority = { withdrawn: 0, temporary: 1, sick: 2, completed: 3 } as const;
        return priority[a.reason] - priority[b.reason];
      })
      .map(item => item.id);

    result = completeLessonOccurrences(result, {
      requirement,
      className,
      removalIds,
      count: status === 'completed2' ? 2 : 1,
      implicitReason: 'withdrawn',
    }, createId);
  }
  return result;
}
