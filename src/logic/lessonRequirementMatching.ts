import type { LessonRequirement, ScheduledLesson } from '@/types';
import { getRequirementClassName } from '@/utils/classNames';

export function findRequirementForScheduledLesson(
  requirements: LessonRequirement[],
  lesson: ScheduledLesson,
  className: string
): LessonRequirement | undefined {
  const byId = requirements.find(req => req.id === lesson.requirementId);
  if (byId) return byId;

  return requirements.find(req => {
    if (req.subject !== lesson.subject || req.teacher !== lesson.teacher) return false;
    if (getRequirementClassName(req) !== className) return false;
    if (req.type === 'group') return req.classOrGroup === lesson.group;
    return !lesson.group;
  });
}
