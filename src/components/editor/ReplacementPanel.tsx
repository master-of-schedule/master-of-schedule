/**
 * ReplacementPanel - Panel for selecting a replacement lesson
 * Shows lessons that can be placed in the selected slot
 * Displayed below UnscheduledPanel in the right sidebar
 */

import { useMemo } from 'react';
import type { Day, LessonNumber, LessonRequirement, Teacher } from '@/types';
import { useDataStore, useScheduleStore } from '@/stores';
import { getSubstituteTeachers, getFreeTeachersAtSlot } from '@/logic';
import { LessonSelectionList } from './LessonSelectionList';
import styles from './ReplacementPanel.module.css';

interface PartnerTeacher {
  name: string;
  subject: string;
  room: string;
}

interface ReplacementPanelProps {
  className: string;
  day: Day;
  lessonNum: LessonNumber;
  lessonIndex: number;
  currentLesson?: {
    subject: string;
    teacher: string;
    group?: string;
  };
  onSelect: (lesson: LessonRequirement) => void;
  onSubstituteSelect: (teacher: Teacher) => void;
  onUnionSubstituteSelect: (teacher: Teacher) => void;
  /** Called when user clicks a co-teacher (partner) in the same slot */
  onPartnerSelect?: (teacher: string, subject: string) => void;
  onClose: () => void;
}

export function ReplacementPanel({
  className,
  day,
  lessonNum,
  currentLesson,
  onSelect,
  onSubstituteSelect,
  onUnionSubstituteSelect,
  onPartnerSelect,
  onClose,
}: ReplacementPanelProps) {
  const schedule = useScheduleStore((state) => state.schedule);
  const versionType = useScheduleStore((state) => state.versionType);
  const teachers = useDataStore((state) => state.teachers);

  const substituteTeachers = useMemo(() => {
    if (!currentLesson) return [];
    return getSubstituteTeachers(schedule, teachers, currentLesson.subject, day, lessonNum, className, currentLesson.teacher);
  }, [schedule, teachers, currentLesson, day, lessonNum, className]);

  const unionTeachers = useMemo(() => {
    if (!currentLesson || versionType === 'template') return undefined;
    const substituteNames = substituteTeachers.map((t) => t.name);
    return getFreeTeachersAtSlot(schedule, teachers, day, lessonNum, currentLesson.teacher, substituteNames);
  }, [schedule, teachers, currentLesson, day, lessonNum, substituteTeachers, versionType]);

  // Partner teachers: others already teaching in the same slot for the same class
  const partnerTeachers = useMemo<PartnerTeacher[]>(() => {
    if (!currentLesson || !onPartnerSelect) return [];
    const lessons = schedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
    return lessons
      .filter(l => l.teacher !== currentLesson.teacher)
      .map(l => ({ name: l.teacher, subject: l.subject, room: l.room }));
  }, [schedule, className, day, lessonNum, currentLesson, onPartnerSelect]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h3 className={styles.title}>Замена ({day} ур.{lessonNum})</h3>
          <button className={styles.closeButton} onClick={onClose} title="Закрыть">
            ×
          </button>
        </div>
      </div>

      <div className={styles.content}>
        <LessonSelectionList
          className={className}
          day={day}
          lessonNum={lessonNum}
          currentLesson={currentLesson}
          onSelect={onSelect}
          onClose={onClose}
          substituteTeachers={substituteTeachers}
          onSubstituteSelect={onSubstituteSelect}
          unionTeachers={unionTeachers}
          onUnionSubstituteSelect={onUnionSubstituteSelect}
          partnerTeachers={partnerTeachers}
          onPartnerSelect={onPartnerSelect}
        />
      </div>
    </div>
  );
}
