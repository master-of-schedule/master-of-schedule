/**
 * ScheduleGrid - The 5x8 schedule grid for a single class
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { GridCell } from './GridCell';
import { DAYS, LESSON_NUMBERS } from '@/types';
import type { Day, LessonNumber, CellStatusInfo } from '@/types';
import { useScheduleStore, useUIStore, useDataStore, usePartnerStore } from '@/stores';
import { getCellStatus, getSlotLessons } from '@/logic';
import { formatDayWithDate } from '@/utils/dateFormat';
import styles from './ScheduleGrid.module.css';

interface ScheduleGridProps {
  className: string;
  onAssignLesson?: (day: Day, lessonNum: LessonNumber) => void;
  onQuickAssign?: (day: Day, lessonNum: LessonNumber) => void;
  onNavigateToClass?: (className: string) => void;
  onForceAssign?: (day: Day, lessonNum: LessonNumber) => void;
}

export function ScheduleGrid({ className, onAssignLesson, onQuickAssign, onNavigateToClass, onForceAssign }: ScheduleGridProps) {
  const schedule = useScheduleStore((state) => state.schedule);
  const versionType = useScheduleStore((state) => state.versionType);
  const mondayDate = useScheduleStore((state) => state.mondayDate);
  const versionDaysPerWeek = useScheduleStore((state) => state.versionDaysPerWeek);
  const settingsDaysPerWeek = useDataStore((state) => state.daysPerWeek);
  const settingsLessonsPerDay = useDataStore((state) => state.lessonsPerDay);
  const effectiveDays = DAYS.slice(0, versionDaysPerWeek ?? settingsDaysPerWeek);
  const effectiveLessons = LESSON_NUMBERS.slice(0, settingsLessonsPerDay);
  const selectedLesson = useUIStore((state) => state.selectedLesson);
  const selectedCells = useUIStore((state) => state.selectedCells);
  const searchResults = useUIStore((state) => state.searchResults);
  const focusedCell = useUIStore((state) => state.focusedCell);
  const teachers = useDataStore((state) => state.teachers);
  const groups = useDataStore((state) => state.groups);

  const partnerBusySet = usePartnerStore((state) => state.partnerBusySet);
  const isPartnerBusy = usePartnerStore((state) => state.isPartnerBusy);
  const classes = useDataStore((state) => state.classes);
  const partnerClassNames = useMemo(
    () => new Set(classes.filter(c => c.isPartner).map(c => c.name)),
    [classes]
  );

  const highlightedMovableCell = useUIStore((state) => state.highlightedMovableCell);
  const highlightedMovableTeacher = useUIStore((state) => state.highlightedMovableTeacher);
  const absentDay = useUIStore((state) => state.absentDay);
  const absentLessons = useUIStore((state) => state.absentLessons);
  const { openContextMenu, selectCell, toggleCellSelection, setFocusedCell, moveFocus, clearCellSelection, clearHighlightedMovableCell, clearHighlightedMovableTeacher } = useUIStore();
  const gridRef = useRef<HTMLDivElement>(null);

  // Check if a cell is selected
  const isCellSelected = useCallback(
    (day: Day, lessonNum: LessonNumber) =>
      selectedCells.some(
        (c) => c.className === className && c.day === day && c.lessonNum === lessonNum
      ),
    [selectedCells, className]
  );

  // Check if a cell is highlighted by search
  const isCellHighlighted = useCallback(
    (day: Day, lessonNum: LessonNumber) =>
      searchResults.some(
        (r) =>
          r.cellRef.className === className &&
          r.cellRef.day === day &&
          r.cellRef.lessonNum === lessonNum
      ),
    [searchResults, className]
  );

  // Check if a cell is focused
  const isCellFocused = useCallback(
    (day: Day, lessonNum: LessonNumber) =>
      focusedCell?.day === day && focusedCell?.lessonNum === lessonNum,
    [focusedCell]
  );

  // Check if a cell is the highlighted movable cell or contains a highlighted teacher
  const isCellMovableHighlighted = useCallback(
    (day: Day, lessonNum: LessonNumber) => {
      if (
        highlightedMovableCell?.className === className &&
        highlightedMovableCell?.day === day &&
        highlightedMovableCell?.lessonNum === lessonNum
      ) {
        return true;
      }
      if (highlightedMovableTeacher) {
        const lessons = getSlotLessons(schedule, className, day, lessonNum);
        return lessons.some(l => l.teacher === highlightedMovableTeacher || l.teacher2 === highlightedMovableTeacher);
      }
      return false;
    },
    [highlightedMovableCell, highlightedMovableTeacher, schedule, className]
  );

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input field
      const activeElement = document.activeElement;
      const isInputFocused = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';
      if (isInputFocused) return;

      // Only handle if grid is focused or a cell is focused
      if (!gridRef.current?.contains(document.activeElement) && !focusedCell) {
        return;
      }

      const maxDayIdx = effectiveDays.length - 1;
      const maxLessonIdx = effectiveLessons.length - 1;
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          moveFocus('up', maxDayIdx, maxLessonIdx);
          break;
        case 'ArrowDown':
          e.preventDefault();
          moveFocus('down', maxDayIdx, maxLessonIdx);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          moveFocus('left', maxDayIdx, maxLessonIdx);
          break;
        case 'ArrowRight':
          e.preventDefault();
          moveFocus('right', maxDayIdx, maxLessonIdx);
          break;
        case 'Enter':
          if (focusedCell) {
            e.preventDefault();
            handleCellClick(focusedCell.day, focusedCell.lessonNum as LessonNumber);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedCell, moveFocus, effectiveDays.length, effectiveLessons.length]);

  const copiedLesson = useUIStore((state) => state.copiedLesson);
  const movingLesson = useUIStore((state) => state.movingLesson);

  // Get cell status based on selected lesson or copied lesson
  const getCellStatusForLesson = useCallback(
    (day: Day, lessonNum: LessonNumber): CellStatusInfo => {
      const activeLesson = selectedLesson ?? copiedLesson?.requirement ?? null;
      if (!activeLesson) {
        return { status: 'available' };
      }
      return getCellStatus(schedule, teachers, activeLesson, className, day, lessonNum, partnerBusySet, groups, partnerClassNames);
    },
    [schedule, teachers, selectedLesson, copiedLesson, className, partnerBusySet, groups, partnerClassNames]
  );

  // Handle cell click
  const handleCellClick = useCallback(
    (day: Day, lessonNum: LessonNumber) => {
      // Set focus to clicked cell
      setFocusedCell(day, lessonNum);
      // Clear any highlighted movable cell/teacher
      clearHighlightedMovableCell();
      clearHighlightedMovableTeacher();

      if (movingLesson) {
        // Moving a lesson — forward to EditorPage which opens room picker
        onAssignLesson?.(day, lessonNum);
      } else if (selectedLesson || copiedLesson) {
        // If a lesson is selected or copied, try to assign/paste it
        const status = getCellStatusForLesson(day, lessonNum);
        if (status.status === 'available' && onAssignLesson) {
          onAssignLesson(day, lessonNum);
        }
      } else {
        // Select the cell
        selectCell({ className, day, lessonNum });
      }
    },
    [selectedLesson, copiedLesson, movingLesson, getCellStatusForLesson, className, selectCell, onAssignLesson, setFocusedCell, clearHighlightedMovableCell, clearHighlightedMovableTeacher]
  );

  // Handle context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, day: Day, lessonNum: LessonNumber, lessonIndex: number | null) => {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY, { className, day, lessonNum }, lessonIndex);
    },
    [className, openContextMenu]
  );

  // Handle Ctrl+click for multi-select
  const handleCtrlClick = useCallback(
    (day: Day, lessonNum: LessonNumber) => {
      toggleCellSelection({ className, day, lessonNum });
    },
    [className, toggleCellSelection]
  );

  // Handle double-click for quick assign
  const handleDoubleClick = useCallback(
    (day: Day, lessonNum: LessonNumber) => {
      if (selectedLesson && onQuickAssign) {
        const status = getCellStatusForLesson(day, lessonNum);
        if (status.status === 'available') {
          onQuickAssign(day, lessonNum);
        }
      }
    },
    [selectedLesson, getCellStatusForLesson, onQuickAssign]
  );

  // Handle Shift+click for force-place (weekly mode only, on banned/busy cells)
  const handleShiftClick = useCallback(
    (day: Day, lessonNum: LessonNumber) => {
      if (versionType !== 'weekly' && versionType !== 'technical') return;
      if (!selectedLesson) return;
      const status = getCellStatusForLesson(day, lessonNum);
      if (status.status !== 'teacher_banned' && status.status !== 'teacher_busy') return;
      onForceAssign?.(day, lessonNum);
    },
    [versionType, selectedLesson, getCellStatusForLesson, onForceAssign]
  );

  const gridClassNames = styles.grid;
  const gridColumns = `var(--grid-row-header-width) repeat(${effectiveDays.length}, 1fr)`;

  return (
    <div ref={gridRef} className={gridClassNames} role="grid" aria-label={`Расписание класса ${className}`}>
      {/* Header row with days */}
      <div className={styles.headerRow} style={{ gridTemplateColumns: gridColumns }} onClick={() => { clearCellSelection(); clearHighlightedMovableCell(); clearHighlightedMovableTeacher(); }}>
        <div className={styles.cornerCell}></div>
        {effectiveDays.map((day, index) => (
          <div key={day} className={styles.dayHeader} role="columnheader">
            {versionType === 'weekly' && mondayDate
              ? formatDayWithDate(day, mondayDate, index)
              : day}
          </div>
        ))}
      </div>

      {/* Lesson rows */}
      {effectiveLessons.map((lessonNum) => (
        <div key={lessonNum} className={styles.row} style={{ gridTemplateColumns: gridColumns }} role="row">
          <div className={styles.lessonHeader} role="rowheader" onClick={() => { clearCellSelection(); clearHighlightedMovableCell(); clearHighlightedMovableTeacher(); }}>
            {lessonNum}
          </div>
          {effectiveDays.map((day) => {
            const lessons = getSlotLessons(schedule, className, day, lessonNum);
            const hasPartnerConflict = lessons.some(l =>
              isPartnerBusy(l.teacher, day, lessonNum) ||
              (l.teacher2 ? isPartnerBusy(l.teacher2, day, lessonNum) : false)
            );
            return (
              <GridCell
                key={`${day}-${lessonNum}`}
                day={day}
                lessonNum={lessonNum}
                lessons={lessons}
                status={getCellStatusForLesson(day, lessonNum)}
                isSelected={isCellSelected(day, lessonNum)}
                isHighlighted={isCellHighlighted(day, lessonNum)}
                isMovableHighlighted={isCellMovableHighlighted(day, lessonNum)}
                isFocused={isCellFocused(day, lessonNum)}
                isDifferentFromTemplate={false}
                isAbsentMarked={absentDay === day && absentLessons.some(l => l.className === className && l.lessonNum === lessonNum)}
                hasPartnerConflict={hasPartnerConflict}
                onClick={() => handleCellClick(day, lessonNum)}
                onDoubleClick={() => handleDoubleClick(day, lessonNum)}
                onContextMenu={(e, lessonIndex) => handleContextMenu(e, day, lessonNum, lessonIndex)}
                onCtrlClick={() => handleCtrlClick(day, lessonNum)}
                onShiftClick={() => handleShiftClick(day, lessonNum)}
                onNavigateToClass={onNavigateToClass}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
