/**
 * UnscheduledPanel - List of lessons that haven't been scheduled yet
 */

import { useMemo, useCallback, useState } from 'react';
import type { LessonRequirement, RestorableLessonReason, UnscheduledLesson } from '@/types';
import { useScheduleStore, useUIStore, useDataStore } from '@/stores';
import {
  computeMergedTemps,
  buildWeeklyLessonGroups,
  getAssigningLesson,
  getAssigningRemovedLessonIds,
  getUnscheduledLessons,
  mergeWithTemporaryLessons,
} from '@/logic';
import { extractGroupIndex } from '@/utils/formatLesson';
import { ContextMenu, ContextMenuItem } from '@/components/common/ContextMenu';
import { AddTemporaryLessonModal } from './AddTemporaryLessonModal';
import styles from './UnscheduledPanel.module.css';

interface UnscheduledPanelProps {
  className: string;
}

type WeeklyRowKind = 'mustReturn' | 'withdrawn' | 'sick' | 'completed';

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  requirement: LessonRequirement | null;
  removalIds: string[];
  remaining: number;
  kind: Exclude<WeeklyRowKind, 'sick'> | null;
}

const CLOSED_CONTEXT_MENU: ContextMenuState = {
  isOpen: false,
  x: 0,
  y: 0,
  requirement: null,
  removalIds: [],
  remaining: 0,
  kind: null,
};

export function UnscheduledPanel({ className }: UnscheduledPanelProps) {
  const schedule = useScheduleStore((state) => state.schedule);
  const lessonRequirements = useDataStore((state) => state.lessonRequirements);
  const temporaryLessons = useScheduleStore((state) => state.temporaryLessons);
  const removedLessons = useScheduleStore((state) => state.removedLessons);
  const removeTemporaryLesson = useScheduleStore((state) => state.removeTemporaryLesson);
  const versionType = useScheduleStore((state) => state.versionType);
  const markLessonsCompleted = useScheduleStore((state) => state.markLessonsCompleted);
  const clearCompletedLessons = useScheduleStore((state) => state.clearCompletedLessons);
  const interaction = useUIStore((state) => state.interaction);
  const selectedLesson = getAssigningLesson(interaction);
  const selectedRemovedLessonIds = getAssigningRemovedLessonIds(interaction);
  const selectLesson = useUIStore((state) => state.selectLesson);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>(CLOSED_CONTEXT_MENU);

  const mergedRequirements = useMemo(
    () => mergeWithTemporaryLessons(lessonRequirements, temporaryLessons),
    [lessonRequirements, temporaryLessons]
  );

  const temporaryIds = useMemo(
    () => new Set(temporaryLessons.map(lesson => lesson.id)),
    [temporaryLessons]
  );

  const { unscheduled, mergedTempsByEntryId } = useMemo(() => {
    const list = getUnscheduledLessons(mergedRequirements, schedule, className);
    return computeMergedTemps(list, temporaryLessons, className);
  }, [mergedRequirements, schedule, className, temporaryLessons]);

  const weeklyGroups = useMemo(
    () => buildWeeklyLessonGroups(unscheduled, removedLessons, className),
    [unscheduled, removedLessons, className]
  );

  const handleLessonClick = useCallback(
    (requirement: LessonRequirement, removedLessonIds: string[] = []) => {
      if (selectedLesson?.id === requirement.id && selectedRemovedLessonIds[0] === removedLessonIds[0]) {
        selectLesson(null);
      } else {
        selectLesson(requirement, removedLessonIds);
      }
    },
    [selectedLesson, selectedRemovedLessonIds, selectLesson]
  );

  const handleRemoveTemporary = useCallback(
    (event: React.MouseEvent, id: string) => {
      event.stopPropagation();
      if (selectedLesson?.id === id) selectLesson(null);
      removeTemporaryLesson(id);
    },
    [removeTemporaryLesson, selectedLesson, selectLesson]
  );

  const handleContextMenu = useCallback(
    (
      event: React.MouseEvent,
      requirement: LessonRequirement,
      removalIds: string[],
      remaining: number,
      kind: Exclude<WeeklyRowKind, 'sick'>,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setCtxMenu({ isOpen: true, x: event.clientX, y: event.clientY, requirement, removalIds, remaining, kind });
    },
    []
  );

  const closeContextMenu = useCallback(() => setCtxMenu(CLOSED_CONTEXT_MENU), []);

  const handleMarkCompleted = useCallback((count: 1 | 2) => {
    if (ctxMenu.requirement && ctxMenu.kind && ctxMenu.kind !== 'completed') {
      const implicitReason: RestorableLessonReason = ctxMenu.kind === 'mustReturn' ? 'temporary' : 'withdrawn';
      markLessonsCompleted({
        requirement: ctxMenu.requirement,
        className,
        removalIds: ctxMenu.removalIds,
        count: Math.min(count, ctxMenu.remaining),
        implicitReason,
      });
    }
    closeContextMenu();
  }, [ctxMenu, className, markLessonsCompleted, closeContextMenu]);

  const handleClearCompleted = useCallback(() => {
    if (ctxMenu.requirement && ctxMenu.removalIds.length > 0) {
      clearCompletedLessons({ requirement: ctxMenu.requirement, className, removalIds: ctxMenu.removalIds });
    }
    closeContextMenu();
  }, [ctxMenu, className, clearCompletedLessons, closeContextMenu]);

  const groupedLessons = useMemo(() => {
    const groups = new Map<string, UnscheduledLesson[]>();
    for (const item of unscheduled) {
      const existing = groups.get(item.requirement.subject) ?? [];
      existing.push(item);
      groups.set(item.requirement.subject, existing);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  }, [unscheduled]);

  const showAddButton = versionType !== 'template';
  const isWeekly = versionType === 'weekly';
  const weeklyCount = weeklyGroups.temporary.length + weeklyGroups.withdrawn.length +
    weeklyGroups.sick.length + weeklyGroups.completed.length;

  const renderWeeklyGroup = (title: string, items: typeof weeklyGroups.temporary, kind: WeeklyRowKind) => {
    if (items.length === 0) return null;
    const isSick = kind === 'sick';
    const isCompleted = kind === 'completed';

    return (
      <section className={styles.removalGroup} aria-label={title}>
        <h4 className={styles.removalGroupTitle}>{title}</h4>
        {items.map((item) => {
          const isSelected = !isSick && !isCompleted && selectedLesson?.id === item.requirement.id &&
            selectedRemovedLessonIds[0] === item.removalIds[0];
          const isGroup = item.requirement.type === 'group';
          const isTemporary = temporaryIds.has(item.requirement.id);
          const mergedTemp = mergedTempsByEntryId.get(item.requirement.id);
          const classNames = [
            styles.lesson,
            isCompleted ? styles.conducted : styles[kind],
            isSelected ? styles.selected : '',
            isTemporary || mergedTemp ? styles.temporary : '',
          ].filter(Boolean).join(' ');
          const content = (
            <>
              <span className={styles.subject}>
                {item.requirement.subject}
                {isGroup && <span className={styles.groupIndex}>({extractGroupIndex(item.requirement.classOrGroup)})</span>}
              </span>
              <span className={styles.teacher}>{item.requirement.teacher}</span>
              {isCompleted
                ? <span className={styles.conductedBadge}>✓{item.remaining}</span>
                : <span className={styles.lessonCount}>{item.remaining}</span>}
              {!isSick && !isCompleted && (isTemporary || mergedTemp) && (
                <button
                  className={styles.removeButton}
                  onClick={(event) => handleRemoveTemporary(event, mergedTemp?.id ?? item.requirement.id)}
                  title="Удалить временное занятие"
                >×</button>
              )}
            </>
          );

          if (isSick) {
            return <div key={`${kind}-${item.requirement.id}`} className={classNames} aria-disabled="true">{content}</div>;
          }
          if (isCompleted) {
            return (
              <div
                key={`${kind}-${item.requirement.id}`}
                className={classNames}
                onContextMenu={(event) => handleContextMenu(event, item.requirement, item.removalIds, item.remaining, kind)}
              >{content}</div>
            );
          }
          return (
            <div
              key={`${kind}-${item.requirement.id}`}
              className={classNames}
              role="button"
              tabIndex={0}
              onClick={() => handleLessonClick(item.requirement, item.removalIds)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleLessonClick(item.requirement, item.removalIds);
                }
              }}
              onContextMenu={(event) => handleContextMenu(event, item.requirement, item.removalIds, item.remaining, kind)}
            >{content}</div>
          );
        })}
      </section>
    );
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Занятия</h3>
        {showAddButton && (
          <button className={styles.addButton} onClick={() => setIsAddModalOpen(true)} title="Добавить временное занятие">+</button>
        )}
      </div>

      <div className={styles.list}>
        {(isWeekly ? weeklyCount === 0 : unscheduled.length === 0) ? (
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
            {isWeekly ? (
              <>
                {renderWeeklyGroup('Временно удалённые — нужно вернуть', weeklyGroups.temporary, 'mustReturn')}
                {renderWeeklyGroup('Снятые', weeklyGroups.withdrawn, 'withdrawn')}
                {renderWeeklyGroup('Снятые по болезни', weeklyGroups.sick, 'sick')}
                {renderWeeklyGroup('Проведено', weeklyGroups.completed, 'completed')}
              </>
            ) : groupedLessons.map(([subject, items]) => (
              <div key={subject} className={styles.group}>
                {items.map((item) => {
                  const isSelected = selectedLesson?.id === item.requirement.id;
                  const isGroup = item.requirement.type === 'group';
                  const isTemporary = temporaryIds.has(item.requirement.id);
                  const mergedTemp = mergedTempsByEntryId.get(item.requirement.id);
                  return (
                    <button
                      key={item.requirement.id}
                      className={`${styles.lesson} ${isSelected ? styles.selected : ''} ${isTemporary || mergedTemp ? styles.temporary : ''}`}
                      onClick={() => handleLessonClick(item.requirement)}
                    >
                      <span className={styles.subject}>
                        {item.requirement.subject}
                        {isGroup && <span className={styles.groupIndex}>({extractGroupIndex(item.requirement.classOrGroup)})</span>}
                      </span>
                      <span className={styles.teacher}>{item.requirement.teacher}</span>
                      <span className={styles.lessonCount}>{item.remaining}</span>
                      {(isTemporary || mergedTemp) && (
                        <button
                          className={styles.removeButton}
                          onClick={(event) => handleRemoveTemporary(event, mergedTemp?.id ?? item.requirement.id)}
                          title="Удалить временное занятие"
                        >×</button>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>

      {isWeekly && (
        <ContextMenu isOpen={ctxMenu.isOpen} x={ctxMenu.x} y={ctxMenu.y} onClose={closeContextMenu}>
          {ctxMenu.kind === 'completed' ? (
            <ContextMenuItem onClick={handleClearCompleted}>Снять отметку</ContextMenuItem>
          ) : (
            <>
              <ContextMenuItem onClick={() => handleMarkCompleted(1)}>Проведено (1 занятие)</ContextMenuItem>
              {ctxMenu.remaining > 1 && (
                <ContextMenuItem onClick={() => handleMarkCompleted(2)}>Проведено (2 занятия)</ContextMenuItem>
              )}
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
