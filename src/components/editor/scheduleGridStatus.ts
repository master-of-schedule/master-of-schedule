import type { LessonRequirement, CellRef } from '@/types';

interface GridCopiedLesson {
  requirement: LessonRequirement;
  room: string;
  sourceRef: CellRef & { lessonIndex: number };
}

interface GridMovingLesson {
  sourceRef: CellRef & { lessonIndex: number };
  requirement: LessonRequirement;
  room: string;
  teacher: string;
  originalTeacher?: string;
  isSubstitution?: boolean;
}

export function getActiveGridStatusLesson(
  selectedLesson: LessonRequirement | null,
  copiedLesson: GridCopiedLesson | null,
  movingLesson: GridMovingLesson | null
): LessonRequirement | null {
  return selectedLesson ?? copiedLesson?.requirement ?? movingLesson?.requirement ?? null;
}
