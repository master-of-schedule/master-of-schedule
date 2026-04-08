/**
 * ClassSelector - Navigation panel for switching between classes
 */

import { useMemo } from 'react';
import { useUIStore, useDataStore, useScheduleStore } from '@/stores';
import { getTotalUnscheduledCount, mergeWithTemporaryLessons } from '@/logic';
import styles from './ClassSelector.module.css';

/** Groups class names by grade, placing fully gap-excluded grade groups at the bottom. */
export function groupClassesByGrade(
  classNames: string[],
  gapExcluded: string[]
): [string, string[]][] {
  const groups = new Map<string, string[]>();
  const excludedSet = new Set(gapExcluded);

  for (const name of classNames) {
    const grade = name.match(/^\d+/)?.[0] ?? 'Другие';
    const existing = groups.get(grade) ?? [];
    existing.push(name);
    groups.set(grade, existing);
  }

  const sortByGrade = (a: [string, string[]], b: [string, string[]]) => {
    const numA = parseInt(a[0], 10);
    const numB = parseInt(b[0], 10);
    if (isNaN(numA) && isNaN(numB)) return a[0].localeCompare(b[0], 'ru');
    if (isNaN(numA)) return 1;
    if (isNaN(numB)) return -1;
    return numA - numB;
  };

  const entries = Array.from(groups.entries());
  const normal = entries.filter(([, names]) => names.some(n => !excludedSet.has(n)));
  const allExcluded = entries.filter(([, names]) => names.every(n => excludedSet.has(n)));

  return [...normal.sort(sortByGrade), ...allExcluded.sort(sortByGrade)];
}

export function ClassSelector() {
  const classes = useDataStore((state) => state.classes);
  const gapExcludedClasses = useDataStore((state) => state.gapExcludedClasses);
  const requirements = useDataStore((state) => state.lessonRequirements);
  const temporaryLessons = useScheduleStore((state) => state.temporaryLessons);
  const currentClass = useUIStore((state) => state.currentClass);
  const setCurrentClass = useUIStore((state) => state.setCurrentClass);
  const schedule = useScheduleStore((state) => state.schedule);
  const versionType = useScheduleStore((state) => state.versionType);

  const partnerClassNameSet = useMemo(
    () => new Set(classes.filter(c => c.isPartner).map(c => c.name)),
    [classes]
  );

  // Group own classes by grade (partner classes excluded), partner classes appended at end
  const groupedClasses = useMemo(() => {
    const ownClassNames = classes.filter(c => !c.isPartner).map(c => c.name);
    const partnerClassNames = classes.filter(c => c.isPartner).map(c => c.name);
    const grouped = groupClassesByGrade(ownClassNames, gapExcludedClasses);
    if (partnerClassNames.length > 0) {
      grouped.push(['Партнёр', partnerClassNames]);
    }
    return grouped;
  }, [classes, gapExcludedClasses]);

  // For template type, track which classes have remaining unscheduled lessons
  const classesWithRemaining = useMemo(() => {
    if (versionType !== 'template') return new Set<string>();
    const merged = mergeWithTemporaryLessons(requirements, temporaryLessons);
    const result = new Set<string>();
    for (const cls of classes) {
      if (getTotalUnscheduledCount(merged, schedule, cls.name) > 0) {
        result.add(cls.name);
      }
    }
    return result;
  }, [versionType, classes, requirements, temporaryLessons, schedule]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Классы</h3>
      </div>

      <div className={styles.list}>
        {groupedClasses.map(([grade, classNames]) => (
          <div key={grade} className={styles.group}>
            <div className={styles.classButtons}>
              {classNames.map((className) => (
                <button
                  key={className}
                  className={`${styles.classButton} ${currentClass === className ? styles.active : ''} ${classesWithRemaining.has(className) ? styles.hasRemaining : ''} ${partnerClassNameSet.has(className) ? styles.partner : ''}`}
                  onClick={() => setCurrentClass(className)}
                >
                  {className}
                </button>
              ))}
            </div>
          </div>
        ))}

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
