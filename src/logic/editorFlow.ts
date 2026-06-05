import type {
  CellRef,
  Day,
  LessonNumber,
  LessonRequirement,
} from '@/types';

export interface CopiedLessonData {
  requirement: LessonRequirement;
  room: string;
  sourceRef: CellRef & { lessonIndex: number };
}

export interface MovingLessonData {
  sourceRef: CellRef & { lessonIndex: number };
  requirement: LessonRequirement;
  room: string;
  teacher: string;
  originalTeacher?: string;
  isSubstitution?: boolean;
}

export type EditorInteraction =
  | { type: 'idle' }
  | { type: 'assigning'; lesson: LessonRequirement }
  | { type: 'copying'; lesson: CopiedLessonData }
  | { type: 'moving'; lesson: MovingLessonData };

export type EditorInteractionEvent =
  | { type: 'SELECT_LESSON'; lesson: LessonRequirement }
  | { type: 'START_COPY'; lesson: CopiedLessonData }
  | { type: 'START_MOVE'; lesson: MovingLessonData }
  | { type: 'CANCEL' };

export function reduceEditorInteraction(
  _state: EditorInteraction,
  event: EditorInteractionEvent
): EditorInteraction {
  switch (event.type) {
    case 'SELECT_LESSON':
      return { type: 'assigning', lesson: event.lesson };
    case 'START_COPY':
      return { type: 'copying', lesson: event.lesson };
    case 'START_MOVE':
      return { type: 'moving', lesson: event.lesson };
    case 'CANCEL':
      return { type: 'idle' };
  }
}

export function getAssigningLesson(
  interaction: EditorInteraction
): LessonRequirement | null {
  return interaction.type === 'assigning' ? interaction.lesson : null;
}

export function getCopiedLesson(
  interaction: EditorInteraction
): CopiedLessonData | null {
  return interaction.type === 'copying' ? interaction.lesson : null;
}

export function getMovingLesson(
  interaction: EditorInteraction
): MovingLessonData | null {
  return interaction.type === 'moving' ? interaction.lesson : null;
}

export function getInteractionRequirement(
  interaction: EditorInteraction
): LessonRequirement | null {
  switch (interaction.type) {
    case 'idle':
      return null;
    case 'assigning':
      return interaction.lesson;
    case 'copying':
    case 'moving':
      return interaction.lesson.requirement;
  }
}

export interface RoomDialogData {
  day: Day;
  lessonNum: LessonNumber;
  bulkCells?: CellRef[];
}

export interface ReplacementDialogData {
  day: Day;
  lessonNum: LessonNumber;
  lessonIndex: number;
  currentLesson?: {
    subject: string;
    teacher: string;
    group?: string;
  };
}

export interface ChangeRoomDialogData {
  day: Day;
  lessonNum: LessonNumber;
  lessonIndex: number;
  subject: string;
  teacher: string;
  isGroup: boolean;
}

export interface MoveRoomDialogData {
  day: Day;
  lessonNum: LessonNumber;
}

export type EditorDialog =
  | { type: 'none' }
  | { type: 'room'; data: RoomDialogData }
  | { type: 'replacement'; data: ReplacementDialogData }
  | { type: 'changeRoom'; data: ChangeRoomDialogData }
  | { type: 'moveRoom'; data: MoveRoomDialogData };

export type EditorDialogEvent =
  | { type: 'OPEN_ROOM'; data: RoomDialogData }
  | { type: 'OPEN_REPLACEMENT'; data: ReplacementDialogData }
  | { type: 'OPEN_CHANGE_ROOM'; data: ChangeRoomDialogData }
  | { type: 'OPEN_MOVE_ROOM'; data: MoveRoomDialogData }
  | { type: 'CLOSE' };

export function reduceEditorDialog(
  _state: EditorDialog,
  event: EditorDialogEvent
): EditorDialog {
  switch (event.type) {
    case 'OPEN_ROOM':
      return { type: 'room', data: event.data };
    case 'OPEN_REPLACEMENT':
      return { type: 'replacement', data: event.data };
    case 'OPEN_CHANGE_ROOM':
      return { type: 'changeRoom', data: event.data };
    case 'OPEN_MOVE_ROOM':
      return { type: 'moveRoom', data: event.data };
    case 'CLOSE':
      return { type: 'none' };
  }
}
