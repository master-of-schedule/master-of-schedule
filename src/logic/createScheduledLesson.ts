/**
 * Factory for creating ScheduledLesson objects.
 *
 * ALWAYS use this instead of inline object literals.
 * When adding a new field to ScheduledLesson, update this factory first,
 * then grep for any remaining direct object literals and update them too.
 * Document the total construction-site count in the commit message.
 *
 * Construction sites (5 total as of QI-9):
 *   EditorPage.tsx — bulk assign, single assign, paste copy, quick assign, move
 */

import type { LessonRequirement, ScheduledLesson } from '@/types';
import { generateId } from '@/utils/generateId';

interface ScheduledLessonOptions {
  /** Original teacher name (set when this is a substitution) */
  originalTeacher?: string;
  /** True when this lesson was placed bypassing bans/busy constraints */
  forceOverride?: boolean;
  /** True when this is a formal teacher substitution */
  isSubstitution?: boolean;
  /** True when this substitution is paid by the union (профсоюз), not the budget */
  isUnionSubstitution?: boolean;
}

/**
 * Create a ScheduledLesson from a requirement and room, with optional override fields.
 *
 * @param req  The lesson requirement being fulfilled
 * @param room Room short name (e.g. "-114-")
 * @param opts Optional fields: originalTeacher, forceOverride, isSubstitution
 */
export function createScheduledLesson(
  req: LessonRequirement,
  room: string,
  opts?: ScheduledLessonOptions,
): ScheduledLesson {
  const lesson: ScheduledLesson = {
    id: generateId(),
    requirementId: req.id,
    subject: req.subject,
    teacher: req.teacher,
    room,
    group: req.type === 'group' ? req.classOrGroup : undefined,
  };

  if (req.teacher2) lesson.teacher2 = req.teacher2;
  if (opts?.originalTeacher) lesson.originalTeacher = opts.originalTeacher;
  // Propagate compensation type from requirement (temporary lessons marked as substitutions)
  const isSubstitution = opts?.isSubstitution || !!req.compensationType;
  if (isSubstitution) lesson.isSubstitution = true;
  if (opts?.forceOverride) lesson.forceOverride = true;
  const isUnion = opts?.isUnionSubstitution || req.compensationType === 'union';
  if (isUnion) lesson.isUnionSubstitution = true;

  return lesson;
}
