import type { LessonRequirement, ScheduledLesson } from '@/types';
import { getRequirementClassName } from '@/utils/classNames';
import { requirementMatchesScheduledLesson } from './lessonIdentity';

export function findRequirementForScheduledLesson(
  requirements: LessonRequirement[],
  lesson: ScheduledLesson,
  className: string
): LessonRequirement | undefined {
  const byId = requirements.find(req => req.id === lesson.requirementId);
  if (byId) return byId;

  return requirements.find(req =>
    getRequirementClassName(req) === className && requirementMatchesScheduledLesson(req, lesson, className)
  );
}
