/**
 * UnscheduledPanel - List of lessons that haven't been scheduled yet
 */

import { useMemo, useCallback, useState } from 'react';
import type { LessonRequirement, UnscheduledLesson } from '@/types';
import { useScheduleStore, useUIStore, useDataStore } from '@/stores';
import { getUnscheduledLessons, mergeWithTemporaryLessons, getLessonKey } from '@/logic';
import { extractGroupIndex } from '@/utils/formatLesson';
import { ContextMenu, ContextMenuItem } from '@/components/common/ContextMenu';
import { AddTemporaryLessonModal } from './AddTemporaryLessonModal';
import styles from './UnscheduledPanel.module.css';

interface UnscheduledPanelProps {
  className: string;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  targetId: string | null;
}

export function UnscheduledPanel({ className }: UnscheduledPanelProps) {
  const schedule = useScheduleStore((state) => state.schedule);
  const lessonRequirements = useDataStore((state) => state.lessonRequirements);
  const temporaryLessons = useScheduleStore((state) => state.temporaryLessons);
  const removeTemporaryLesson = useScheduleStore((state) => state.removeTemporaryLesson);
  const versionType = useScheduleStore((state) => state.versionType);
  const lessonStatuses = useScheduleStore((state) => state.lessonStatuses);
  const setLessonStatus = useScheduleStore((state) => state.setLessonStatus);
  const clearLessonStatus = useScheduleStore((state) => state.clearLessonStatus);
  const selectedLesson = useUIStore((state) => state.selectedLesson);
  const selectLesson = useUIStore((state) => state.selectLesson);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>({ isOpen: false, x: 0, y: 0, targetId: null });

  // Merge global requirements with temporary lessons for correct counting
  const mergedRequirements = useMemo(
    () => mergeWithTemporaryLessons(lessonRequirements, temporaryLessons),
    [lessonRequirements, temporaryLessons]
  );

  // Track which requirement IDs came from temporary lessons
  const temporaryIds = useMemo(
    () => new Set(temporaryLessons.map(l => l.id)),
    [temporaryLessons]
  );

  // Get unscheduled lessons for this class.
  // Also detect which unscheduled entries have temporary lessons merged into them
  // so we can show the "×" button on the correct row.
  const { unscheduled, mergedTempsByEntryId } = useMemo(() => {
    const list = getUnscheduledLessons(mergedRequirements, schedule, className);
    const mergedTemps = new Map<string, LessonRequirement>();

    for (const temp of temporaryLessons) {
      const isForThisClass =
        (temp.type === 'class' && temp.classOrGroup === className) ||
        (temp.type === 'group' && temp.className === className);
      if (!isForThisClass) continue;

      // Temp is already in list by its own ID (standalone new subject/teacher)
      if (list.some(item => item.requirement.id === temp.id)) continue;

      // Check if temp was merged into an existing entry (same lesson key + classOrGroup).
      // When merged, getUnscheduledLessons returns the entry under the ORIGINAL requirement's ID.
      const tempKey = getLessonKey({
        subject: temp.subject,
        teacher: temp.teacher,
        group: temp.type === 'group' ? temp.classOrGroup : undefined,
      });
      const mergedEntry = list.find(item => {
        if (item.requirement.classOrGroup !== temp.classOrGroup) return false;
        const itemKey = getLessonKey({
          subject: item.requirement.subject,
          teacher: item.requirement.teacher,
          group: item.requirement.type === 'group' ? item.requirement.classOrGroup : undefined,
        });
        return itemKey === tempKey;
      });

      if (mergedEntry) {
        // Temp was merged into this entry — show × button on that entry, not a phantom 0-count row
        mergedTemps.set(mergedEntry.requirement.id, temp);
      } else {
        // Temp is fully scheduled (no entry in list at all) — add with remaining=0 for × button
        list.push({ requirement: temp, remaining: 0 });
      }
    }

    return { unscheduled: list, mergedTempsByEntryId: mergedTemps };
  }, [mergedRequirements, schedule, className, temporaryLessons]);

  const isCompleted = useCallback(
    (id: string) => lessonStatuses[id] === 'completed' || lessonStatuses[id] === 'completed2',
    [lessonStatuses]
  );

  // Filter out completed lessons from the main list
  const visibleLessons = useMemo(
    () => unscheduled.filter(item => !isCompleted(item.requirement.id)),
    [unscheduled, isCompleted]
  );

  // Completed lessons shown at bottom with badge
  const completedLessons = useMemo(
    () => unscheduled.filter(item => isCompleted(item.requirement.id)),
    [unscheduled, isCompleted]
  );

  // Handle lesson click
  const handleLessonClick = useCallback(
    (requirement: LessonRequirement) => {
      // Toggle selection
      if (selectedLesson?.id === requirement.id) {
        selectLesson(null);
      } else {
        selectLesson(requirement);
      }
    },
    [selectedLesson, selectLesson]
  );

  // Handle removing a temporary lesson
  const handleRemoveTemporary = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (selectedLesson?.id === id) {
        selectLesson(null);
      }
      removeTemporaryLesson(id);
    },
    [removeTemporaryLesson, selectedLesson, selectLesson]
  );

  // Context menu handlers
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (versionType !== 'weekly') return;
      e.preventDefault();
      e.stopPropagation();
      setCtxMenu({ isOpen: true, x: e.clientX, y: e.clientY, targetId: id });
    },
    [versionType]
  );

  const closeContextMenu = useCallback(() => {
    setCtxMenu({ isOpen: false, x: 0, y: 0, targetId: null });
  }, []);

  const handleMarkCompleted = useCallback((count: 1 | 2) => {
    if (ctxMenu.targetId) {
      setLessonStatus(ctxMenu.targetId, count === 2 ? 'completed2' : 'completed');
    }
    closeContextMenu();
  }, [ctxMenu.targetId, setLessonStatus, closeContextMenu]);

  const handleClearCompleted = useCallback(() => {
    if (ctxMenu.targetId) {
      clearLessonStatus(ctxMenu.targetId);
    }
    closeContextMenu();
  }, [ctxMenu.targetId, clearLessonStatus, closeContextMenu]);

  // Group by subject for better organization
  const groupedLessons = useMemo(() => {
    const groups = new Map<string, UnscheduledLesson[]>();

    for (const item of visibleLessons) {
      const key = item.requirement.subject;
      const existing = groups.get(key) ?? [];
      existing.push(item);
      groups.set(key, existing);
    }

    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  }, [visibleLessons]);

  const showAddButton = versionType !== 'template';
  const isWeekly = versionType === 'weekly';
  const targetStatus = ctxMenu.targetId ? lessonStatuses[ctxMenu.targetId] : undefined;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Занятия</h3>
        {showAddButton && (
          <button
            className={styles.addButton}
            onClick={() => setIsAddModalOpen(true)}
            title="Добавить временное занятие"
          >
            +
          </button>
        )}
      </div>

      <div className={styles.list}>
        {visibleLessons.length === 0 && completedLessons.length === 0 ? (
          <div className={styles.empty}>
            Все занятия расставлены
            {showAddButton && (
              <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', marginTop: 'var(--spacing-xs)' }}>
                Нажмите «+» для добавления временного занятия
              </span>
            )}
          </div>
        ) : (
          <>
            {groupedLessons.map(([subject, items]) => (
              <div key={subject} className={styles.group}>
                {items.map((item) => {
                  const isSelected = selectedLesson?.id === item.requirement.id;
                  const isSubstitution = item.requirement.type === 'group';
                  const isTemporary = temporaryIds.has(item.requirement.id);
                  const mergedTemp = mergedTempsByEntryId.get(item.requirement.id);
                  const isSick = lessonStatuses[item.requirement.id] === 'sick';

                  return (
                    <button
                      key={item.requirement.id}
                      className={`${styles.lesson} ${isSelected ? styles.selected : ''} ${isTemporary || mergedTemp ? styles.temporary : ''} ${isSick ? styles.sick : ''}`}
                      onClick={() => handleLessonClick(item.requirement)}
                      onContextMenu={(e) => handleContextMenu(e, item.requirement.id)}
                    >
                      <span className={styles.subject}>
                        {item.requirement.subject}
                        {isSubstitution && (
                          <span className={styles.groupIndex}>
                            ({extractGroupIndex(item.requirement.classOrGroup)})
                          </span>
                        )}
                      </span>
                      <span className={styles.teacher}>{item.requirement.teacher}</span>
                      <span className={styles.lessonCount}>{item.remaining}</span>
                      {(isTemporary || mergedTemp) && (
                        <button
                          className={styles.removeButton}
                          onClick={(e) => handleRemoveTemporary(e, mergedTemp?.id ?? item.requirement.id)}
                          title="Удалить временное занятие"
                        >
                          ×
                        </button>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
            {completedLessons.map((item) => {
              const conductedCount = lessonStatuses[item.requirement.id] === 'completed2' ? 2 : 1;
              const isSubstitution = item.requirement.type === 'group';
              return (
                <button
                  key={item.requirement.id}
                  className={`${styles.lesson} ${styles.conducted}`}
                  onContextMenu={(e) => handleContextMenu(e, item.requirement.id)}
                  onClick={() => {}}
                >
                  <span className={styles.subject}>
                    {item.requirement.subject}
                    {isSubstitution && (
                      <span className={styles.groupIndex}>
                        ({extractGroupIndex(item.requirement.classOrGroup)})
                      </span>
                    )}
                  </span>
                  <span className={styles.teacher}>{item.requirement.teacher}</span>
                  <span className={styles.conductedBadge}>✓{conductedCount}</span>
                </button>
              );
            })}
          </>
        )}
      </div>

      {isWeekly && (
        <ContextMenu isOpen={ctxMenu.isOpen} x={ctxMenu.x} y={ctxMenu.y} onClose={closeContextMenu}>
          {targetStatus === 'completed' || targetStatus === 'completed2' ? (
            <ContextMenuItem onClick={handleClearCompleted}>Снять отметку</ContextMenuItem>
          ) : (
            <>
              <ContextMenuItem onClick={() => handleMarkCompleted(1)}>Проведено (1 занятие)</ContextMenuItem>
              <ContextMenuItem onClick={() => handleMarkCompleted(2)}>Проведено (2 занятия)</ContextMenuItem>
            </>
          )}
          <ContextMenuItem onClick={closeContextMenu}>Отмена</ContextMenuItem>
        </ContextMenu>
      )}

      <AddTemporaryLessonModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        currentClass={className}
      />
    </div>
  );
}
