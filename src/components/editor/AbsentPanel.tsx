/**
 * AbsentPanel - Mark absent teachers and highlight their lessons
 * Session-only tool for weekly and technical schedule types
 *
 * Captures a snapshot of the teacher's lessons when selected.
 * The snapshot persists even when lessons are deleted from the grid,
 * so the user can track which absences have been handled.
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { DAYS } from '@/types';
import type { Day, LessonNumber } from '@/types';
import { useScheduleStore, useUIStore, useDataStore } from '@/stores';
import { absentCellKey } from '@/stores/uiStore';
import { getTeacherLessonsOnDay } from '@/logic';
import { DatalistInput } from '@/components/common/DatalistInput';
import styles from './AbsentPanel.module.css';

export function AbsentPanel() {
  const schedule = useScheduleStore((state) => state.schedule);
  const teachers = useDataStore((state) => state.teachers);
  const absentTeacher = useUIStore((state) => state.absentTeacher);
  const absentDay = useUIStore((state) => state.absentDay);
  const absentMarkedCells = useUIStore((state) => state.absentMarkedCells);
  const absentLessons = useUIStore((state) => state.absentLessons);
  const { setAbsentTeacher, setAbsentLessons, toggleAbsentCell, clearAbsentMarked } = useUIStore();

  // Sorted teacher names + set for O(1) lookup
  const teacherNameSet = useRef(new Set<string>());
  const teacherNames = (() => {
    const names = Object.values(teachers).map(t => t.name).sort((a, b) => a.localeCompare(b, 'ru'));
    teacherNameSet.current = new Set(names);
    return names;
  })();

  // Local input state for type-ahead
  const [teacherInput, setTeacherInput] = useState(absentTeacher ?? '');

  // Sync local input when store value changes externally (e.g., cleared)
  useEffect(() => {
    setTeacherInput(absentTeacher ?? '');
  }, [absentTeacher]);

  // Capture snapshot when both teacher and day are set and snapshot is empty
  useEffect(() => {
    if (absentTeacher && absentDay && absentLessons.length === 0) {
      const lessons = getTeacherLessonsOnDay(schedule, absentTeacher, absentDay);
      if (lessons.length > 0) {
        setAbsentLessons(lessons.map(({ className, lessonNum, lessons: ls }) => ({
          className,
          lessonNum,
          subjects: ls.map(l => l.subject),
        })));
      }
    }
  }, [absentTeacher, absentDay, absentLessons.length, schedule, setAbsentLessons]);

  const handleTeacherInputChange = useCallback((value: string) => {
    setTeacherInput(value);
    setAbsentTeacher(teacherNameSet.current.has(value) ? value : null, absentDay);
  }, [absentDay, setAbsentTeacher]);

  const handleTeacherBlur = useCallback(() => {
    if (!teacherNameSet.current.has(teacherInput)) {
      setTeacherInput(absentTeacher ?? '');
    }
  }, [teacherInput, absentTeacher]);

  const handleDayChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const day = (e.target.value || null) as Day | null;
    setAbsentTeacher(absentTeacher, day);
  }, [absentTeacher, setAbsentTeacher]);

  const handleToggle = useCallback((className: string, day: Day, lessonNum: LessonNumber) => {
    toggleAbsentCell(className, day, lessonNum);
  }, [toggleAbsentCell]);

  const markedCount = absentMarkedCells.size;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Учитель</h3>
        {markedCount > 0 && (
          <button className={styles.clearButton} onClick={clearAbsentMarked} title="Очистить все отметки">
            Сброс ({markedCount})
          </button>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.selectors}>
          <DatalistInput
            id="absent-teacher-options"
            className={styles.select}
            options={teacherNames}
            value={teacherInput}
            onChange={handleTeacherInputChange}
            onBlur={handleTeacherBlur}
            placeholder="Учитель..."
          />

          <select
            className={styles.select}
            value={absentDay ?? ''}
            onChange={handleDayChange}
          >
            <option value="">День...</option>
            {DAYS.map(day => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        </div>

        {absentTeacher && absentDay && (
          <div className={styles.list}>
            {absentLessons.length === 0 ? (
              <div className={styles.empty}>Нет уроков</div>
            ) : (
              absentLessons.map(({ className, lessonNum, subjects }) => {
                const key = absentCellKey(className, absentDay, lessonNum);
                const isChecked = absentMarkedCells.has(key);

                return (
                  <label key={key} className={`${styles.item} ${isChecked ? styles.checked : ''}`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggle(className, absentDay, lessonNum)}
                      className={styles.checkbox}
                    />
                    <span className={styles.lessonNum}>Ур. {lessonNum}</span>
                    <span className={styles.className}>{className}</span>
                    <span className={styles.subject}>
                      {subjects.join(', ')}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
