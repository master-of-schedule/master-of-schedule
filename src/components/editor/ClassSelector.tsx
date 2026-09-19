/**
 * ClassSelector - Navigation panel for switching between classes
 */

import { useMemo } from 'react';
import { useUIStore, useDataStore, useScheduleStore } from '@/stores';
import { getClassesWithRemaining, mergeWithTemporaryLessons } from '@/logic';
import { groupClassesByGrade } from './classSelection';
import styles from './ClassSelector.module.css';

export function ClassSelector() {
  const classes = useDataStore((state) => state.classes);
  const gapExcludedClasses = useDataStore((state) => state.gapExcludedClasses);
  const requirements = useDataStore((state) => state.lessonRequirements);
  const temporaryLessons = useScheduleStore((state) => state.temporaryLessons);
  const currentClass = useUIStore((state) => state.currentClass);
  const setCurrentClass = useUIStore((state) => state.setCurrentClass);
  const schedule = useScheduleStore((state) => state.schedule);
  const lessonStatuses = useScheduleStore((state) => state.lessonStatuses);

  // Group own classes by grade, then partner classes by grade (appended at end).
  // Partner grade groups use 'partner:<grade>' keys so the render can identify them.
  const groupedClasses = useMemo(() => {
    const ownClassNames = classes.filter(c => !c.isPartner).map(c => c.name);
    const partnerClassNames = classes.filter(c => c.isPartner).map(c => c.name);
    const grouped = groupClassesByGrade(ownClassNames, gapExcludedClasses);
    if (partnerClassNames.length > 0) {
      const partnerGraded = groupClassesByGrade(partnerClassNames, []);
      for (const [grade, names] of partnerGraded) {
        grouped.push([`partner:${grade}`, names]);
      }
    }
    return grouped;
  }, [classes, gapExcludedClasses]);

  // Track which classes have remaining unscheduled lessons (excluding lessons
  // covered by a 'sick'/'completed' status)
  const classesWithRemaining = useMemo(() => {
    const merged = mergeWithTemporaryLessons(requirements, temporaryLessons);
    return getClassesWithRemaining(classes.map(c => c.name), merged, schedule, lessonStatuses);
  }, [classes, requirements, temporaryLessons, schedule, lessonStatuses]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Классы</h3>
      </div>

      <div className={styles.list}>
        {groupedClasses.map(([grade, classNames], idx) => {
          const isPartner = grade.startsWith('partner:');
          const isFirstPartner = isPartner && !groupedClasses[idx - 1]?.[0].startsWith('partner:');
          return (
            <div key={grade} className={`${styles.group} ${isFirstPartner ? styles.partnerGroup : ''}`}>
              {isFirstPartner && <div className={styles.groupLabel}>Партнёр</div>}
              <div className={styles.classButtons}>
                {classNames.map((className) => (
                  <button
                    key={className}
                    className={`${styles.classButton} ${currentClass === className ? styles.active : ''} ${classesWithRemaining.has(className) ? styles.hasRemaining : ''} ${isPartner ? styles.partner : ''}`}
                    onClick={() => setCurrentClass(className)}
                  >
                    {className}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {classes.length === 0 && (
          <div className={styles.empty}>
            Нет данных о классах
            <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', marginTop: 'var(--spacing-xs)' }}>
              Загрузите данные на главной странице
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
