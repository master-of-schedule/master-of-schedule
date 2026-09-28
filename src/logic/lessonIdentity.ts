import type { LessonRequirement, ScheduledLesson } from '@/types';
import { getRequirementClassName } from '@/utils/classNames';

type LessonIdentitySource = Pick<LessonRequirement, 'type' | 'classOrGroup' | 'className' | 'subject' | 'teacher' | 'teacher2'>;

const clean = (value: string | undefined): string => value?.trim() ?? '';

/** Canonical identity for one requirement. IDs remain the authority; this key is the legacy fallback. */
export function getRequirementIdentityKey(requirement: LessonIdentitySource): string {
  return [
    requirement.type,
    clean(getRequirementClassName(requirement as LessonRequirement)),
    clean(requirement.type === 'group' ? requirement.classOrGroup : ''),
    clean(requirement.subject),
    clean(requirement.teacher),
    clean(requirement.teacher2),
  ].join('|');
}

export function getScheduledLessonIdentityKey(className: string, lesson: ScheduledLesson): string {
  return [
    lesson.group ? 'group' : 'class',
    clean(className),
    clean(lesson.group),
    clean(lesson.subject),
    clean(lesson.teacher),
    clean(lesson.teacher2),
  ].join('|');
}

export function requirementMatchesScheduledLesson(
  requirement: LessonRequirement,
  lesson: ScheduledLesson,
  className: string,
): boolean {
  return getRequirementIdentityKey(requirement) === getScheduledLessonIdentityKey(className, lesson);
}

export function requirementsHaveSameIdentity(a: LessonRequirement, b: LessonRequirement): boolean {
  return getRequirementIdentityKey(a) === getRequirementIdentityKey(b);
}
