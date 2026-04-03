/**
 * LessonSelectionList — Shared lesson list for replacement panel and picker.
 * Computes available lessons, renders unscheduled and movable sections.
 */

import { useMemo, useState } from 'react';
import { useDataStore, useScheduleStore, useUIStore } from '@/stores';
import { getAvailableLessonsForSlot } from '@/logic';
import { extractGroupIndex } from '@/utils/formatLesson';
import type { Day, LessonNumber, LessonRequirement, Teacher } from '@/types';
import styles from './ReplacementPanel.module.css';

interface LessonSelectionListProps {
  className: string;
  day: Day;
  lessonNum: LessonNumber;
  currentLesson?: {
    subject: string;
    teacher: string;
    group?: string;
  };
  onSelect: (lesson: LessonRequirement) => void;
  onClose: () => void;
  unscheduledLabel?: string;
  movableLabel?: string;
  showMovableHint?: boolean;
  /** Set to true when used inside a modal (skips computation when not open) */
  isOpen?: boolean;
  /** Substitute teachers who can cover the current lesson's subject */
  substituteTeachers?: Teacher[];
  /** Callback when a substitute teacher is selected */
  onSubstituteSelect?: (teacher: Teacher) => void;
  /** Free teachers who can't teach the subject — union (профсоюз) substitutions */
  unionTeachers?: Teacher[];
  /** Callback when a union teacher is selected */
  onUnionSubstituteSelect?: (teacher: Teacher) => void;
  /** Co-teachers already teaching in the same slot (group partners) */
  partnerTeachers?: { name: string; subject: string; room: string }[];
  /** Callback when a partner teacher is clicked — opens AddTemporaryLessonModal with pre-filled data */
  onPartnerSelect?: (teacher: string, subject: string) => void;
}

export function LessonSelectionList({
  className,
  day,
  lessonNum,
  currentLesson,
  onSelect,
  onClose,
  unscheduledLabel = 'Нерасставленные',
  movableLabel = 'Переместить',
  showMovableHint = false,
  isOpen = true,
  substituteTeachers,
  onSubstituteSelect,
  unionTeachers,
  onUnionSubstituteSelect,
  partnerTeachers,
  onPartnerSelect,
}: LessonSelectionListProps) {
  const schedule = useScheduleStore((state) => state.schedule);
  const teachers = useDataStore((state) => state.teachers);
  const lessonRequirements = useDataStore((state) => state.lessonRequirements);
  const setHighlightedMovableTeacher = useUIStore((state) => state.setHighlightedMovableTeacher);

  const availableLessons = useMemo(() => {
    if (!isOpen) return { unscheduled: [], movable: [] };
    return getAvailableLessonsForSlot(
      lessonRequirements,
      schedule,
      teachers,
      className,
      day,
      lessonNum,
      currentLesson
    );
  }, [isOpen, lessonRequirements, schedule, teachers, className, day, lessonNum, currentLesson]);

  // Extract unique teacher names from movable lessons
  const movableTeachers = useMemo(() => {
    const names = new Set<string>();
    for (const { lesson } of availableLessons.movable) {
      names.add(lesson.teacher);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [availableLessons.movable]);

  const handleMovableTeacherClick = (teacherName: string) => {
    setHighlightedMovableTeacher(teacherName);
    onClose();
  };

  const [unionExpanded, setUnionExpanded] = useState(false);

  const hasSubstitutes = (substituteTeachers?.length ?? 0) > 0;
  const hasUnion = (unionTeachers?.length ?? 0) > 0;
  const hasPartners = (partnerTeachers?.length ?? 0) > 0 && !!onPartnerSelect;
  const hasOptions = availableLessons.unscheduled.length > 0 || availableLessons.movable.length > 0 || hasSubstitutes || hasUnion || hasPartners;

  if (!hasOptions) {
    return <div className={styles.empty}>Нет доступных уроков для замены</div>;
  }

  return (
    <>
      {availableLessons.unscheduled.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>{unscheduledLabel}</h4>
          <div className={styles.list}>
            {availableLessons.unscheduled.map((lesson) => {
              const groupIndex = lesson.type === 'group' ? extractGroupIndex(lesson.classOrGroup) : undefined;
              return (
                <button
                  key={lesson.id}
                  className={styles.item}
                  onClick={() => onSelect(lesson)}
                  title="Выбрать для назначения"
                >
                  <span className={styles.subject}>
                    {lesson.subject}
                    {groupIndex && <span className={styles.group}> ({groupIndex})</span>}
                  </span>
                  <span className={styles.teacher}>{lesson.teacher}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {movableTeachers.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>{movableLabel}</h4>
          {showMovableHint && (
            <p className={styles.hint}>Нажмите, чтобы показать в сетке</p>
          )}
          <div className={styles.list}>
            {movableTeachers.map((teacherName) => (
              <button
                key={teacherName}
                className={`${styles.item} ${styles.movableItem}`}
                onClick={() => handleMovableTeacherClick(teacherName)}
                title="Показать уроки учителя в сетке"
              >
                <span className={styles.teacher}>{teacherName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {hasSubstitutes && onSubstituteSelect && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Замещающие учителя</h4>
          <div className={styles.list}>
            {substituteTeachers!.map((teacher) => {
              const groupIndex = currentLesson?.group ? extractGroupIndex(currentLesson.group) : undefined;
              return (
                <button
                  key={teacher.id}
                  className={`${styles.item} ${styles.substituteItem}`}
                  onClick={() => onSubstituteSelect(teacher)}
                >
                  <span className={styles.subject}>
                    {currentLesson?.subject ?? ''}
                    {groupIndex && <span className={styles.group}> ({groupIndex})</span>}
                    {' '}{teacher.name}
                  </span>
                  {teacher.defaultRoom && (
                    <span className={styles.teacher}>каб. {teacher.defaultRoom}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasPartners && onPartnerSelect && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Напарники в этом уроке</h4>
          <div className={styles.list}>
            {partnerTeachers!.map((partner) => (
              <button
                key={partner.name}
                className={`${styles.item} ${styles.substituteItem}`}
                onClick={() => onPartnerSelect(partner.name, partner.subject)}
                title="Создать занятие с этим учителем"
              >
                <span className={styles.subject}>{partner.subject} {partner.name}</span>
                {partner.room && (
                  <span className={styles.teacher}>каб. {partner.room}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasUnion && onUnionSubstituteSelect && (
        <div className={styles.section}>
          <button
            className={styles.collapsibleHeader}
            onClick={() => setUnionExpanded((v) => !v)}
            aria-expanded={unionExpanded}
          >
            <span>Другие (проф.)</span>
            <span className={styles.collapsibleCount}>{unionTeachers!.length}</span>
            <span className={styles.collapsibleChevron}>{unionExpanded ? '▲' : '▼'}</span>
          </button>
          {unionExpanded && (
            <div className={styles.list}>
              {unionTeachers!.map((teacher) => (
                <button
                  key={teacher.id}
                  className={`${styles.item} ${styles.unionItem}`}
                  onClick={() => onUnionSubstituteSelect(teacher)}
                >
                  <span className={styles.teacher}>{teacher.name}</span>
                  {teacher.defaultRoom && (
                    <span className={styles.teacher}>каб. {teacher.defaultRoom}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
