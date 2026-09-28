/**
 * ReplacementPicker - Modal for selecting a replacement lesson
 * Shows lessons that can be placed in the selected slot
 */

import { Modal } from '@/components/common/Modal';
import type { Day, LessonNumber, LessonRequirement } from '@/types';
import { LessonSelectionList } from './LessonSelectionList';

interface ReplacementPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (lesson: LessonRequirement) => void;
  className: string;
  day: Day;
  lessonNum: LessonNumber;
  /** Current lesson being replaced - used to filter it from options */
  currentLesson?: {
    subject: string;
    teacher: string;
    teacher2?: string;
    group?: string;
  };
}

export function ReplacementPicker({
  isOpen,
  onClose,
  onSelect,
  className,
  day,
  lessonNum,
  currentLesson,
}: ReplacementPickerProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Заменить урок (${day} урок ${lessonNum})`}
      size="medium"
    >
      <LessonSelectionList
        className={className}
        day={day}
        lessonNum={lessonNum}
        currentLesson={currentLesson}
        onSelect={onSelect}
        onClose={onClose}
        unscheduledLabel="Нерасставленные занятия"
        movableLabel="Можно переместить"
        showMovableHint
        isOpen={isOpen}
      />
    </Modal>
  );
}
