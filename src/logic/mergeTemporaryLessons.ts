import type { LessonRequirement, UnscheduledLesson } from '@/types';
import { getLessonKey } from './counting';

interface MergeResult {
  unscheduled: UnscheduledLesson[];
  /** Maps an original requirement ID to the temporary lesson that was merged into it. */
  mergedTempsByEntryId: Map<string, LessonRequirement>;
}

/**
 * Annotates an unscheduled list with information about which entries have
 * temporary lessons merged into them.
 *
 * Returns a new `unscheduled` array (the input list is not mutated) and a map
 * from original requirement ID → the temporary lesson merged into that entry.
 * Temporary lessons that are fully scheduled (remaining === 0) are appended to
 * the result list so the "×" removal button still appears.
 */
export function computeMergedTemps(
  list: UnscheduledLesson[],
  temporaryLessons: LessonRequirement[],
  className: string,
): MergeResult {
  const unscheduled = [...list];
  const mergedTempsByEntryId = new Map<string, LessonRequirement>();

  for (const temp of temporaryLessons) {
    const isForThisClass =
      (temp.type === 'class' && temp.classOrGroup === className) ||
      (temp.type === 'group' && temp.className === className);
    if (!isForThisClass) continue;

    // Temp already appears in the list under its own ID (standalone new subject/teacher)
    if (unscheduled.some((item) => item.requirement.id === temp.id)) continue;

    // Check if this temp was merged into an existing entry (same lesson key + classOrGroup).
    const tempKey = getLessonKey({
      subject: temp.subject,
      teacher: temp.teacher,
      group: temp.type === 'group' ? temp.classOrGroup : undefined,
    });
    const mergedEntry = unscheduled.find((item) => {
      if (item.requirement.classOrGroup !== temp.classOrGroup) return false;
      const itemKey = getLessonKey({
        subject: item.requirement.subject,
        teacher: item.requirement.teacher,
        group: item.requirement.type === 'group' ? item.requirement.classOrGroup : undefined,
      });
      return itemKey === tempKey;
    });

    if (mergedEntry) {
      // Temp was merged into this entry — record it so the × button appears on that row
      mergedTempsByEntryId.set(mergedEntry.requirement.id, temp);
    } else {
      // Temp is fully scheduled — append with remaining=0 so the × button still shows
      unscheduled.push({ requirement: temp, remaining: 0 });
    }
  }

  return { unscheduled, mergedTempsByEntryId };
}
