import type { LessonRequirement } from '@/types';

export function extractBaseClassName(classOrGroup: string): string {
  return classOrGroup.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export function getRequirementClassName(req: LessonRequirement): string {
  return req.type === 'group' && req.className
    ? req.className
    : extractBaseClassName(req.classOrGroup);
}
