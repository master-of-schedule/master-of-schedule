/**
 * GridCell - A single cell in the schedule grid
 * Displays lessons and handles interactions
 */

import { memo, useCallback } from 'react';
import type { ScheduledLesson, Day, LessonNumber, CellStatusInfo } from '@/types';
import { extractGroupIndex, formatRoom } from '@/utils/formatLesson';
import styles from './GridCell.module.css';

interface GridCellProps {
  day: Day;
  lessonNum: LessonNumber;
  lessons: ScheduledLesson[];
  status: CellStatusInfo;
  isSelected: boolean;
  isHighlighted: boolean;
  isMovableHighlighted: boolean;
  isFocused: boolean;
  isDifferentFromTemplate?: boolean;
  isAbsentMarked?: boolean;
  hasPartnerConflict?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu: (e: React.MouseEvent, lessonIndex: number | null) => void;
  onCtrlClick: () => void;
  onAltClick?: () => void;
  onNavigateToClass?: (className: string) => void;
}

export const GridCell = memo(function GridCell({
  day,
  lessonNum,
  lessons,
  status,
  isSelected,
  isHighlighted,
  isMovableHighlighted,
  isFocused,
  isDifferentFromTemplate,
  isAbsentMarked,
  hasPartnerConflict,
  onClick,
  onDoubleClick,
  onContextMenu,
  onCtrlClick,
  onAltClick,
  onNavigateToClass,
}: GridCellProps) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.altKey) {
      e.preventDefault();
      onAltClick?.();
    } else if (e.ctrlKey || e.metaKey) {
      onCtrlClick();
    } else {
      onClick();
    }
  }, [onClick, onCtrlClick, onAltClick]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }, [onClick]);

  // Determine cell background color based on status
  const getStatusClass = () => {
    switch (status.status) {
      case 'same':
        return styles.statusSame;
      case 'teacher_banned':
        return styles.statusBanned;
      case 'teacher_busy':
        return styles.statusBusy;
      case 'partner_busy':
        return styles.statusPartnerBusy;
      case 'class_occupied':
        return styles.statusOccupied;
      default:
        return '';
    }
  };

  const classNames = [
    styles.cell,
    getStatusClass(),
    isSelected && styles.selected,
    isHighlighted && styles.highlighted,
    isMovableHighlighted && styles.movableHighlighted,
    isFocused && styles.focused,
    isDifferentFromTemplate && styles.differentFromTemplate,
    isAbsentMarked && styles.absentMarked,
    hasPartnerConflict && styles.partnerConflict,
  ].filter(Boolean).join(' ');

  // Handle context menu on cell background (empty space not covered by lesson divs)
  const handleCellContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, lessons.length > 0 ? 0 : null);
  }, [lessons.length, onContextMenu]);

  // Handle context menu on specific lesson
  const handleLessonContextMenu = useCallback((e: React.MouseEvent, lessonIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, lessonIndex);
  }, [onContextMenu]);

  return (
    <div
      className={classNames}
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={handleCellContextMenu}
      onKeyDown={handleKeyDown}
      role="gridcell"
      tabIndex={0}
      aria-label={`${day} урок ${lessonNum}`}
      data-day={day}
      data-lesson={lessonNum}
    >
      {lessons.some(l => l.forceOverride) && (
        <span className={styles.forceOverrideIndicator} title="Поставлено в обход запретов">!</span>
      )}

      {lessons.map((lesson, index) => {
        const groupIndex = extractGroupIndex(lesson.group);
        return (
          <div
            key={lesson.id || index}
            className={styles.lesson}
            onContextMenu={(e) => handleLessonContextMenu(e, index)}
          >
            <span className={styles.subject}>
              {lesson.subject}
              {groupIndex && <span className={styles.group}> ({groupIndex})</span>}
            </span>
            <span className={styles.teacher}>
              {lesson.teacher}{lesson.teacher2 ? ` / ${lesson.teacher2}` : ''}
            </span>
            <span className={styles.room}>{formatRoom(lesson.room)}</span>
            {lesson.isSubstitution && <span className={styles.substitution}>(зам)</span>}
          </div>
        );
      })}

      {/* Show conflict hint for teacher_busy status */}
      {status.status === 'teacher_busy' && (
        <div className={styles.conflictHint}>
          {status.conflictSubject}{' '}
          <button
            className={styles.conflictLink}
            onClick={(e) => {
              e.stopPropagation();
              if (status.conflictClass && onNavigateToClass) {
                onNavigateToClass(status.conflictClass);
              }
            }}
            title={`Перейти к ${status.conflictClass}`}
          >
            {status.conflictClass}
          </button>
        </div>
      )}

      {/* Show hint for partner_busy status */}
      {status.status === 'partner_busy' && (
        <div className={styles.conflictHint}>
          {status.teacherName} занят(а) у партнёра
        </div>
      )}
    </div>
  );
});
