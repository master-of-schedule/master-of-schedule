/**
 * ValidationPanel - Shows schedule conflicts, gaps (windows), and validation warnings
 */

import { useMemo, useState } from 'react';
import type { ScheduleConflict, ScheduleGap } from '@/logic';
import { useScheduleStore, useDataStore, useUIStore } from '@/stores';
import { validateSchedule, findGaps } from '@/logic';
import { GapExclusionsModal } from './GapExclusionsModal';
import styles from './ValidationPanel.module.css';

function getConflictIcon(type: ScheduleConflict['type']): string {
  switch (type) {
    case 'teacher_double_booked':
      return '👤';
    case 'room_double_booked':
      return '🚪';
    case 'force_override_ban':
      return '⚠️';
    default:
      return '⚠';
  }
}

function getConflictLabel(type: ScheduleConflict['type']): string {
  switch (type) {
    case 'teacher_double_booked':
      return 'Учитель в двух классах';
    case 'room_double_booked':
      return 'Кабинет занят';
    case 'force_override_ban':
      return 'Поставлено вопреки запрету';
    default:
      return 'Конфликт';
  }
}

export function ValidationPanel() {
  const schedule = useScheduleStore((state) => state.schedule);
  const teachers = useDataStore((state) => state.teachers);
  const groups = useDataStore((state) => state.groups);
  const gapExcludedClasses = useDataStore((state) => state.gapExcludedClasses);
  const setCurrentClass = useUIStore((state) => state.setCurrentClass);
  const setFocusedCell = useUIStore((state) => state.setFocusedCell);
  const acknowledgedConflictKeys = useUIStore((state) => state.acknowledgedConflictKeys);
  const acknowledgeConflict = useUIStore((state) => state.acknowledgeConflict);
  const [showGaps, setShowGaps] = useState(false);
  const [showExclusions, setShowExclusions] = useState(false);

  // Validate schedule
  const allConflicts = useMemo(
    () => validateSchedule(schedule, teachers),
    [schedule, teachers]
  );

  // Filter out acknowledged conflicts
  const conflicts = useMemo(
    () => allConflicts.filter(c => {
      const key = `${c.type}|${c.day}|${c.lessonNum}|${c.details}`;
      return !acknowledgedConflictKeys.includes(key);
    }),
    [allConflicts, acknowledgedConflictKeys]
  );

  // Find gaps
  const excludeSet = useMemo(
    () => new Set(gapExcludedClasses),
    [gapExcludedClasses]
  );
  const gaps = useMemo(
    () => findGaps(schedule, teachers, excludeSet, Object.values(groups)),
    [schedule, teachers, excludeSet, groups]
  );

  const classGaps = gaps.filter(g => g.type === 'class');
  const groupGaps = gaps.filter(g => g.type === 'group');

  const handleGapClick = (gap: ScheduleGap) => {
    if (gap.type === 'class') {
      setCurrentClass(gap.name);
      setFocusedCell(gap.day, gap.lessonNum);
    }
  };

  const hasIssues = conflicts.length > 0 || gaps.length > 0;

  if (!hasIssues) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.title}>Проверка</h3>
          <span className={styles.okBadge}>OK</span>
        </div>
        <div className={styles.empty}>
          Конфликтов и окон не обнаружено
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Проверка</h3>
        <div className={styles.badges}>
          {conflicts.length > 0 && (
            <span className={styles.errorBadge}>{conflicts.length}</span>
          )}
          {gaps.length > 0 && (
            <button
              className={`${styles.gapBadge} ${gaps.length > 0 ? styles.gapBadgeActive : ''}`}
              onClick={() => setShowGaps(!showGaps)}
              title={showGaps ? 'Скрыть окна' : 'Показать окна'}
            >
              Окна: {gaps.length}
            </button>
          )}
          <button
            className={styles.gearButton}
            onClick={() => setShowExclusions(true)}
            title="Исключения из поиска окон"
          >
            &#9881;
          </button>
        </div>
      </div>
      <div className={styles.list}>
        {conflicts.map((conflict, index) => {
          const key = `${conflict.type}|${conflict.day}|${conflict.lessonNum}|${conflict.details}`;
          // Show "Верно" button for force_override_ban conflicts and teacher_double_booked
          // where the slot contains a force-override lesson
          const slotLessons = Object.values(schedule).flatMap(cls =>
            cls[conflict.day]?.[conflict.lessonNum]?.lessons ?? []
          );
          const hasForceOverride = slotLessons.some(l => l.forceOverride);
          const canAcknowledge = conflict.type === 'force_override_ban' ||
            (conflict.type === 'teacher_double_booked' && hasForceOverride);
          return (
            <div key={`c-${index}`} className={styles.conflict}>
              <span className={styles.icon}>{getConflictIcon(conflict.type)}</span>
              <div className={styles.info}>
                <span className={styles.label}>{getConflictLabel(conflict.type)}</span>
                <span className={styles.details}>
                  {conflict.day}, ур. {conflict.lessonNum}
                </span>
                <span className={styles.description}>{conflict.details}</span>
              </div>
              {canAcknowledge && (
                <button
                  className={styles.acknowledgeButton}
                  onClick={() => acknowledgeConflict(key)}
                  title="Подтвердить — это намеренно"
                >
                  Верно
                </button>
              )}
            </div>
          );
        })}
        {showGaps && classGaps.length > 0 && (
          <>
            <div className={styles.gapSectionTitle}>Окна в классах ({classGaps.length})</div>
            {classGaps.map((gap, index) => (
              <div
                key={`gc-${index}`}
                className={styles.gap}
                onClick={() => handleGapClick(gap)}
              >
                <span className={styles.gapName}>{gap.name}</span>
                <span className={styles.gapDetails}>{gap.day} ур. {gap.lessonNum}</span>
              </div>
            ))}
          </>
        )}
        {showGaps && groupGaps.length > 0 && (
          <>
            <div className={styles.gapSectionTitle}>Окна в группах ({groupGaps.length})</div>
            {groupGaps.map((gap, index) => (
              <div
                key={`gg-${index}`}
                className={styles.gap}
              >
                <span className={styles.gapName}>{gap.name}</span>
                <span className={styles.gapDetails}>{gap.day} ур. {gap.lessonNum}</span>
              </div>
            ))}
          </>
        )}
      </div>
      {showExclusions && (
        <GapExclusionsModal onClose={() => setShowExclusions(false)} />
      )}
    </div>
  );
}
