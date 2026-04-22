/**
 * EditorPage - Main schedule editor layout
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { Day, LessonNumber, Room, ScheduledLesson, CellRef, LessonRequirement, Teacher } from '@/types';
import { useUIStore, useDataStore, useScheduleStore, usePartnerStore } from '@/stores';
import { useShallow } from 'zustand/react/shallow';
import { createVersion, updateVersionSchedule, updateVersionMetadata } from '@/db';
import { exportToJson, saveJsonFile } from '@/db/import-export';
import { getAvailableRooms, isRoomAvailable, getUnscheduledLessons, mergeWithTemporaryLessons, createScheduledLesson, getSlotLessons } from '@/logic';
import { ClassSelector, groupClassesByGrade } from './ClassSelector';
import { ScheduleGrid } from './ScheduleGrid';
import { UnscheduledPanel } from './UnscheduledPanel';
import { ProtocolPanel } from './ProtocolPanel';
import { RoomPicker } from './RoomPicker';
import { ReplacementPanel } from './ReplacementPanel';
import { AddTemporaryLessonModal } from './AddTemporaryLessonModal';
import { AbsentPanel } from './AbsentPanel';
import { RoomPanel } from './RoomPanel';
import { ValidationPanel } from './ValidationPanel';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from '@/components/common/ContextMenu';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { HintBar } from '@/components/common/HintBar';
import { useToast } from '@/components/common/Toast';
import { usePickerState } from '@/hooks/usePickerState';
import { useEditorKeyboard } from '@/hooks/useEditorKeyboard';
import styles from './EditorPage.module.css';

export function EditorPage() {
  const {
    currentClass, setCurrentClass, selectedLesson, selectLesson,
    contextMenu, closeContextMenu, selectedCells, clearCellSelection,
    copiedLesson, setCopiedLesson, movingLesson, setMovingLesson,
    clearMovingLesson, absentTeacher,
  } = useUIStore(useShallow((s) => ({
    currentClass: s.currentClass,
    setCurrentClass: s.setCurrentClass,
    selectedLesson: s.selectedLesson,
    selectLesson: s.selectLesson,
    contextMenu: s.contextMenu,
    closeContextMenu: s.closeContextMenu,
    selectedCells: s.selectedCells,
    clearCellSelection: s.clearCellSelection,
    copiedLesson: s.copiedLesson,
    setCopiedLesson: s.setCopiedLesson,
    movingLesson: s.movingLesson,
    setMovingLesson: s.setMovingLesson,
    clearMovingLesson: s.clearMovingLesson,
    absentTeacher: s.absentTeacher,
  })));

  const { classes, gapExcludedClasses, requirements, teachers, rooms } = useDataStore(useShallow((s) => ({
    classes: s.classes,
    gapExcludedClasses: s.gapExcludedClasses,
    requirements: s.lessonRequirements,
    teachers: s.teachers,
    rooms: s.rooms,
  })));

  const {
    assignLesson, removeLesson, removeLessons, changeRoom, undo, redo,
    historyIndex, historyLength, schedule, versionId, versionType, versionName,
    isDirty, jsonIsDirty, markSaved, markJsonSaved, temporaryLessons,
    lessonStatuses, acknowledgedConflictKeys, mondayDate, versionDaysPerWeek,
  } = useScheduleStore(useShallow((s) => ({
    assignLesson: s.assignLesson,
    removeLesson: s.removeLesson,
    removeLessons: s.removeLessons,
    changeRoom: s.changeRoom,
    undo: s.undo,
    redo: s.redo,
    historyIndex: s.historyIndex,
    historyLength: s.history.length,
    schedule: s.schedule,
    versionId: s.versionId,
    versionType: s.versionType,
    versionName: s.versionName,
    isDirty: s.isDirty,
    jsonIsDirty: s.jsonIsDirty,
    markSaved: s.markSaved,
    markJsonSaved: s.markJsonSaved,
    temporaryLessons: s.temporaryLessons,
    lessonStatuses: s.lessonStatuses,
    acknowledgedConflictKeys: s.acknowledgedConflictKeys,
    mondayDate: s.mondayDate,
    versionDaysPerWeek: s.versionDaysPerWeek,
  })));

  const { partnerData, clearPartnerFile } = usePartnerStore(useShallow((s) => ({
    partnerData: s.partnerData,
    clearPartnerFile: s.clearPartnerFile,
  })));
  const restorePartnerClassLessons = useScheduleStore((s) => s.restorePartnerClassLessons);

  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  // Track substitution metadata across the replacement → room picker flow
  const substitutionRef = useRef<{ originalTeacher: string; isUnionSubstitution?: boolean } | null>(null);

  // Track force-override flag across the shift+click → room picker flow
  const forceOverrideRef = useRef(false);

  // Student count for current class (used for room capacity validation)
  // For group lessons, skip capacity check (any group fits any room)
  const currentClassStudentCount = useMemo(() => {
    if (!currentClass) return undefined;
    if (selectedLesson?.type === 'group') return undefined;
    return classes.find(c => c.name === currentClass)?.studentCount;
  }, [currentClass, classes, selectedLesson]);

  // Contextual hint based on current editor state
  const hintText = useMemo(() => {
    if (movingLesson) return 'Кликните по ячейке, куда переместить занятие. Esc — отмена';
    if (absentTeacher) return 'Отметьте уроки, требующие замены';
    if (copiedLesson) return 'Нажмите на ячейку для вставки (можно вставлять несколько раз). Esc — выйти из режима копирования';
    if (selectedCells.length > 0) return `Выделено: ${selectedCells.length}. Delete — удалить, Ctrl+клик — добавить ещё`;
    if (selectedLesson) return (versionType === 'weekly' || versionType === 'technical')
      ? 'Нажмите на ячейку для назначения. Shift+клик на запрет — поставить вопреки.'
      : 'Нажмите на свободную ячейку сетки для назначения.';
    return 'Выберите занятие из панели «Занятия» справа или нажмите на ячейку';
  }, [movingLesson, absentTeacher, copiedLesson, selectedCells.length, selectedLesson, versionType]);

  // Room picker state - supports both single cell and bulk assignment
  const roomPicker = usePickerState<{
    day: Day;
    lessonNum: LessonNumber;
    bulkCells?: CellRef[]; // If set, assign to all these cells
  }>();

  // Replacement picker state
  const replacementPicker = usePickerState<{
    day: Day;
    lessonNum: LessonNumber;
    lessonIndex: number;
    currentLesson?: {
      subject: string;
      teacher: string;
      group?: string;
    };
  }>();

  // Change room picker state
  const changeRoomPicker = usePickerState<{
    day: Day;
    lessonNum: LessonNumber;
    lessonIndex: number;
    subject: string;
    teacher: string;
    isGroup: boolean;
  }>();

  // Move target room picker state
  const moveTargetPicker = usePickerState<{
    day: Day;
    lessonNum: LessonNumber;
  }>();

  // Partner modal state (Z35-4 / Z39-3: open AddTemporaryLessonModal from ReplacementPanel partner section)
  const [partnerModal, setPartnerModal] = useState<{
    teacher: string;
    subject: string;
    /** Source slot — used on confirm to remove original group lessons and open room picker */
    sourceDay: Day;
    sourceLessonNum: LessonNumber;
  } | null>(null);

  // Paste warning state (replaces window.confirm/alert to avoid React crash)
  const [pasteWarning, setPasteWarning] = useState<{
    type: 'extra' | 'roomBusy';
    message: string;
    day: Day;
    lessonNum: LessonNumber;
    lesson: ScheduledLesson;
    /** For roomBusy: lesson with room cleared */
    lessonWithoutRoom?: ScheduledLesson;
  } | null>(null);

  // Set initial class if none selected — pick the first non-partner, non-excluded class
  useEffect(() => {
    if (!currentClass && classes.length > 0) {
      const ownClassNames = classes.filter(c => !c.isPartner).map(c => c.name);
      const sorted = groupClassesByGrade(ownClassNames.length > 0 ? ownClassNames : classes.map(c => c.name), gapExcludedClasses);
      const firstClass = sorted[0]?.[1][0] ?? classes[0].name;
      setCurrentClass(firstClass);
    }
  }, [currentClass, classes, gapExcludedClasses, setCurrentClass]);

  // Keyboard shortcuts (Delete, Escape, Ctrl+Z/Y)
  const { handleDeleteSelected } = useEditorKeyboard({
    selectedCells,
    schedule,
    removeLessons,
    clearSelectedCells: clearCellSelection,
    setSelectedLesson: selectLesson,
    setCopiedLesson,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < historyLength - 1,
    onUndoEmpty: () => showToast('Нечего отменять', 'info'),
    onRedoEmpty: () => showToast('Нечего повторить', 'info'),
    closeContextMenu,
    clearMovingLesson,
    closeMoveTargetPicker: moveTargetPicker.close,
  });

  // Handle room selection for lesson assignment (single or bulk)
  const handleRoomSelect = useCallback(
    (room: Room) => {
      if (!selectedLesson || !roomPicker.data) return;

      // Bulk assignment mode
      if (roomPicker.data.bulkCells && roomPicker.data.bulkCells.length > 0) {
        for (const cell of roomPicker.data.bulkCells) {
          const lesson = createScheduledLesson(selectedLesson, room.shortName);
          assignLesson({
            className: cell.className,
            day: cell.day,
            lessonNum: cell.lessonNum,
            lesson,
          });
        }
        clearCellSelection();
      } else if (currentClass) {
        // Single cell assignment
        const opts = {
          originalTeacher: substitutionRef.current?.originalTeacher,
          isSubstitution: substitutionRef.current ? true : undefined,
          isUnionSubstitution: substitutionRef.current?.isUnionSubstitution ? true : undefined,
          forceOverride: forceOverrideRef.current ? true : undefined,
        };
        substitutionRef.current = null;
        forceOverrideRef.current = false;
        const lesson = createScheduledLesson(selectedLesson, room.shortName, opts);

        assignLesson({
          className: currentClass,
          day: roomPicker.data.day,
          lessonNum: roomPicker.data.lessonNum,
          lesson,
        });
      }

      roomPicker.close();
      selectLesson(null);
    },
    [selectedLesson, roomPicker, currentClass, assignLesson, selectLesson, clearCellSelection]
  );

  // Clear partner file and restore saved partner class schedules
  const handleClearPartnerFile = useCallback(async () => {
    const savedSchedule = await clearPartnerFile();
    if (savedSchedule && Object.keys(savedSchedule).length > 0) {
      restorePartnerClassLessons(savedSchedule);
    }
  }, [clearPartnerFile, restorePartnerClassLessons]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const name = versionName || `Расписание ${new Date().toLocaleDateString('ru-RU')}`;

      if (versionId) {
        // Update existing version
        await updateVersionSchedule(versionId, schedule, undefined, temporaryLessons, lessonStatuses, acknowledgedConflictKeys);
        await updateVersionMetadata(versionId, { name });
        markSaved(versionId, name);
      } else {
        // Create new version
        const version = await createVersion({
          name,
          type: versionType,
          schedule,
          temporaryLessons,
          lessonStatuses,
          acknowledgedConflictKeys,
          mondayDate: mondayDate ?? undefined,
          daysPerWeek: versionDaysPerWeek ?? undefined,
        });
        markSaved(version.id, name);
      }
      showToast('Расписание сохранено', 'success');
    } catch (err) {
      console.error('Save error:', err);
      showToast('Ошибка сохранения', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, versionId, versionName, versionType, schedule, temporaryLessons, lessonStatuses, acknowledgedConflictKeys, mondayDate, versionDaysPerWeek, markSaved, showToast]);

  const handleSaveJson = useCallback(async () => {
    try {
      const json = await exportToJson();
      const date = new Date().toISOString().slice(0, 10);
      await saveJsonFile(json, `timetable-${date}.json`);
      markJsonSaved();
      showToast('Файл скачан', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка экспорта';
      showToast(msg, 'error');
    }
  }, [markJsonSaved, showToast]);

  // Handle cell click to assign lesson (or paste copied lesson)
  const handleAssignLesson = useCallback(
    (day: Day, lessonNum: LessonNumber) => {
      // Move mode: user clicked target cell, open room picker
      if (movingLesson && currentClass) {
        moveTargetPicker.open({ day, lessonNum });
        return;
      }

      // Paste copied lesson (duplicate semantics: source stays, copy added)
      if (copiedLesson && currentClass) {
        const req = copiedLesson.requirement;

        // Build the lesson to paste
        const lesson = createScheduledLesson(req, copiedLesson.room);

        // Check remaining count using current schedule (source not removed)
        const mergedReqs = mergeWithTemporaryLessons(requirements, temporaryLessons);
        const unscheduled = getUnscheduledLessons(mergedReqs, schedule, currentClass);
        const remaining = unscheduled.find(u => u.requirement.id === req.id)?.remaining ?? 0;

        if (remaining <= 0) {
          setPasteWarning({
            type: 'extra',
            message: `Все занятия «${req.subject} ${req.teacher}» для класса ${currentClass} уже расставлены. Добавить лишнее занятие?`,
            day, lessonNum, lesson,
          });
          return;
        }

        // Check room availability
        if (lesson.room) {
          const roomFree = isRoomAvailable(schedule, rooms, lesson.room, day, lessonNum);
          if (!roomFree) {
            let occupant = '';
            for (const [cn, classSchedule] of Object.entries(schedule)) {
              const slotLessons = classSchedule[day]?.[lessonNum]?.lessons ?? [];
              for (const l of slotLessons) {
                if (l.room === lesson.room) {
                  occupant = `${l.subject} ${l.teacher} (${cn})`;
                  break;
                }
              }
              if (occupant) break;
            }
            setPasteWarning({
              type: 'roomBusy',
              message: `Кабинет ${lesson.room} занят: ${occupant}. Вставить без кабинета?`,
              day, lessonNum, lesson,
              lessonWithoutRoom: { ...lesson, room: '' },
            });
            return;
          }
        }

        assignLesson({ className: currentClass, day, lessonNum, lesson });
        // Keep copy mode active for multi-paste (Z31-4) — Esc or selecting another lesson exits
        return;
      }

      // Normal flow: open room picker for selected lesson
      if (!selectedLesson) return;
      roomPicker.open({ day, lessonNum });
    },
    [movingLesson, copiedLesson, selectedLesson, currentClass, schedule, rooms, requirements, temporaryLessons, assignLesson, setCopiedLesson, roomPicker, moveTargetPicker]
  );

  // Handle quick assign (double-click) - auto-select first available room
  const handleQuickAssign = useCallback(
    (day: Day, lessonNum: LessonNumber) => {
      if (!selectedLesson || !currentClass) return;

      const availableRooms = getAvailableRooms(schedule, rooms, day, lessonNum);
      if (availableRooms.length === 0) {
        // No rooms available, open picker to show message
        roomPicker.open({ day, lessonNum });
        return;
      }

      // Auto-select first available room
      const room = availableRooms[0];
      const lesson = createScheduledLesson(selectedLesson, room.shortName);

      assignLesson({
        className: currentClass,
        day,
        lessonNum,
        lesson,
      });

      selectLesson(null);
    },
    [selectedLesson, currentClass, schedule, rooms, assignLesson, selectLesson, roomPicker]
  );

  // Handle force-assign (Shift+click on banned/busy cell in weekly mode)
  const handleForceAssign = useCallback(
    (day: Day, lessonNum: LessonNumber) => {
      forceOverrideRef.current = true;
      handleAssignLesson(day, lessonNum);
    },
    [handleAssignLesson]
  );

  // Context menu handlers
  const handleRemoveLesson = useCallback(() => {
    if (!contextMenu.cellRef || contextMenu.lessonIndex === null) return;
    removeLesson({
      className: contextMenu.cellRef.className,
      day: contextMenu.cellRef.day,
      lessonNum: contextMenu.cellRef.lessonNum,
      lessonIndex: contextMenu.lessonIndex,
    });
    closeContextMenu();
  }, [contextMenu, removeLesson, closeContextMenu]);

  // Open replacement picker
  const handleOpenReplace = useCallback(() => {
    if (!contextMenu.cellRef || contextMenu.lessonIndex === null) return;
    const { className, day, lessonNum } = contextMenu.cellRef;
    const lessons = schedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
    const currentLessonData = lessons[contextMenu.lessonIndex];

    replacementPicker.open({
      day,
      lessonNum,
      lessonIndex: contextMenu.lessonIndex,
      currentLesson: currentLessonData ? {
        subject: currentLessonData.subject,
        teacher: currentLessonData.teacher,
        group: currentLessonData.group,
      } : undefined,
    });
    closeContextMenu();
  }, [contextMenu, schedule, closeContextMenu, replacementPicker]);

  // Open change room picker
  const handleOpenChangeRoom = useCallback(() => {
    if (!contextMenu.cellRef || contextMenu.lessonIndex === null) return;
    const { className, day, lessonNum } = contextMenu.cellRef;
    const lessons = schedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
    const lesson = lessons[contextMenu.lessonIndex];
    if (!lesson) return;

    changeRoomPicker.open({
      day,
      lessonNum,
      lessonIndex: contextMenu.lessonIndex,
      subject: lesson.subject,
      teacher: lesson.teacher,
      isGroup: !!lesson.group,
    });
    closeContextMenu();
  }, [contextMenu, schedule, closeContextMenu, changeRoomPicker]);

  // Handle copy lesson from context menu
  const handleCopyLesson = useCallback(() => {
    if (!contextMenu.cellRef || contextMenu.lessonIndex === null) return;
    const { className: cellClass, day, lessonNum } = contextMenu.cellRef;
    const lessons = schedule[cellClass]?.[day]?.[lessonNum]?.lessons ?? [];
    const lesson = lessons[contextMenu.lessonIndex];
    if (!lesson) return;

    // Find the matching requirement
    const mergedReqs = mergeWithTemporaryLessons(requirements, temporaryLessons);
    const req = mergedReqs.find(r =>
      r.id === lesson.requirementId ||
      (r.subject === lesson.subject &&
       r.teacher === lesson.teacher &&
       (r.type === 'class' || r.classOrGroup === lesson.group))
    );
    if (!req) return;

    setCopiedLesson({
      requirement: req,
      room: lesson.room,
      sourceRef: {
        className: cellClass,
        day,
        lessonNum,
        lessonIndex: contextMenu.lessonIndex,
      },
    });
    closeContextMenu();
  }, [contextMenu, schedule, requirements, temporaryLessons, setCopiedLesson, closeContextMenu]);

  // Handle move lesson from context menu
  const handleStartMove = useCallback(() => {
    if (!contextMenu.cellRef || contextMenu.lessonIndex === null) return;
    const { className: cellClass, day, lessonNum } = contextMenu.cellRef;
    const lessons = schedule[cellClass]?.[day]?.[lessonNum]?.lessons ?? [];
    const lesson = lessons[contextMenu.lessonIndex];
    if (!lesson) return;

    // Find the matching requirement
    const mergedReqs = mergeWithTemporaryLessons(requirements, temporaryLessons);
    const req = mergedReqs.find(r =>
      r.id === lesson.requirementId ||
      (r.subject === lesson.subject &&
       r.teacher === lesson.teacher &&
       (r.type === 'class' || r.classOrGroup === lesson.group))
    );
    if (!req) return;

    setMovingLesson({
      sourceRef: { className: cellClass, day, lessonNum, lessonIndex: contextMenu.lessonIndex },
      requirement: req,
      room: lesson.room,
      teacher: lesson.teacher,
      originalTeacher: lesson.originalTeacher,
      isSubstitution: lesson.isSubstitution,
    });
    closeContextMenu();
  }, [contextMenu, schedule, requirements, temporaryLessons, setMovingLesson, closeContextMenu]);

  // Handle room selection for change room
  const handleChangeRoomSelect = useCallback(
    (room: Room) => {
      if (!changeRoomPicker.data || !currentClass) return;
      changeRoom({
        className: currentClass,
        day: changeRoomPicker.data.day,
        lessonNum: changeRoomPicker.data.lessonNum,
        lessonIndex: changeRoomPicker.data.lessonIndex,
        newRoom: room.shortName,
      });
      changeRoomPicker.close();
    },
    [changeRoomPicker, currentClass, changeRoom]
  );

  // Handle room selection for move operation
  const handleMoveRoomSelect = useCallback(
    (room: Room) => {
      if (!movingLesson || !moveTargetPicker.data || !currentClass) return;

      // Remove from source
      removeLesson(movingLesson.sourceRef);

      // Assign at target with new room, preserving substitution metadata
      const lesson = createScheduledLesson(movingLesson.requirement, room.shortName, {
        originalTeacher: movingLesson.originalTeacher,
        isSubstitution: movingLesson.isSubstitution,
      });
      assignLesson({
        className: currentClass,
        day: moveTargetPicker.data.day,
        lessonNum: moveTargetPicker.data.lessonNum,
        lesson,
      });

      moveTargetPicker.close();
      clearMovingLesson();
    },
    [movingLesson, moveTargetPicker, currentClass, removeLesson, assignLesson, clearMovingLesson]
  );

  // Handle replacement selection - removes old lesson, opens room picker for new
  const handleReplacementSelect = useCallback(
    (lesson: LessonRequirement) => {
      if (!replacementPicker.data || !currentClass) return;

      // Remove the old lesson first
      removeLesson({
        className: currentClass,
        day: replacementPicker.data.day,
        lessonNum: replacementPicker.data.lessonNum,
        lessonIndex: replacementPicker.data.lessonIndex,
      });

      // Select the new lesson and open room picker
      selectLesson(lesson);
      roomPicker.open({
        day: replacementPicker.data.day,
        lessonNum: replacementPicker.data.lessonNum,
      });

      replacementPicker.close();
    },
    [replacementPicker, currentClass, removeLesson, selectLesson, roomPicker]
  );

  // Handle substitute teacher selection from replacement panel
  const handleSubstituteSelect = useCallback(
    (teacher: Teacher) => {
      if (!replacementPicker.data || !currentClass) return;

      // Remember this is a substitution
      substitutionRef.current = {
        originalTeacher: replacementPicker.data.currentLesson?.teacher ?? '',
      };

      // Remove old lesson
      removeLesson({
        className: currentClass,
        day: replacementPicker.data.day,
        lessonNum: replacementPicker.data.lessonNum,
        lessonIndex: replacementPicker.data.lessonIndex,
      });

      // Create synthetic requirement for the substitute teacher
      const group = replacementPicker.data.currentLesson?.group;
      const syntheticReq: LessonRequirement = {
        id: `substitute-${teacher.name}`,
        type: group ? 'group' : 'class',
        classOrGroup: group ?? currentClass,
        subject: replacementPicker.data.currentLesson?.subject ?? '',
        teacher: teacher.name,
        countPerWeek: 1,
        ...(group ? { className: currentClass } : {}),
      };

      // Select and open room picker (same flow as handleReplacementSelect)
      selectLesson(syntheticReq);
      roomPicker.open({
        day: replacementPicker.data.day,
        lessonNum: replacementPicker.data.lessonNum,
      });
      replacementPicker.close();
    },
    [replacementPicker, currentClass, removeLesson, selectLesson, roomPicker]
  );

  // Handle union (профсоюз) substitute teacher selection — same flow but marks isUnionSubstitution
  const handleUnionSubstituteSelect = useCallback(
    (teacher: Teacher) => {
      if (!replacementPicker.data || !currentClass) return;

      substitutionRef.current = {
        originalTeacher: replacementPicker.data.currentLesson?.teacher ?? '',
        isUnionSubstitution: true,
      };

      removeLesson({
        className: currentClass,
        day: replacementPicker.data.day,
        lessonNum: replacementPicker.data.lessonNum,
        lessonIndex: replacementPicker.data.lessonIndex,
      });

      const group = replacementPicker.data.currentLesson?.group;
      const syntheticReq: LessonRequirement = {
        id: `union-substitute-${teacher.name}`,
        type: group ? 'group' : 'class',
        classOrGroup: group ?? currentClass,
        subject: replacementPicker.data.currentLesson?.subject ?? '',
        teacher: teacher.name,
        countPerWeek: 1,
        ...(group ? { className: currentClass } : {}),
      };

      selectLesson(syntheticReq);
      roomPicker.open({
        day: replacementPicker.data.day,
        lessonNum: replacementPicker.data.lessonNum,
      });
      replacementPicker.close();
    },
    [replacementPicker, currentClass, removeLesson, selectLesson, roomPicker]
  );

  // Handle partner select (Z35-4 / Z39-3): open AddTemporaryLessonModal with pre-filled teacher + subject
  const handlePartnerSelect = useCallback((teacher: string, subject: string) => {
    if (!replacementPicker.data) return;
    setPartnerModal({
      teacher,
      subject,
      sourceDay: replacementPicker.data.day,
      sourceLessonNum: replacementPicker.data.lessonNum,
    });
    replacementPicker.close();
  }, [replacementPicker]);

  // Handle partner merge saved (Z39-3): remove original group lessons + auto-open room picker
  const handlePartnerMergeSaved = useCallback((lesson: LessonRequirement) => {
    if (!partnerModal || !currentClass) return;
    const { sourceDay, sourceLessonNum } = partnerModal;

    // Remove all original lessons at the source slot
    const originals = getSlotLessons(schedule, currentClass, sourceDay, sourceLessonNum);
    if (originals.length > 0) {
      removeLessons(
        originals.map((_, i) => ({ className: currentClass, day: sourceDay, lessonNum: sourceLessonNum, lessonIndex: i }))
          .reverse()
      );
    }

    // Select the new merged lesson and open room picker at the same slot
    selectLesson(lesson);
    roomPicker.open({ day: sourceDay, lessonNum: sourceLessonNum });
  }, [partnerModal, currentClass, schedule, removeLessons, selectLesson, roomPicker]);

  // Handle bulk assign - open room picker for all selected cells
  const handleBulkAssign = useCallback(() => {
    if (!selectedLesson || selectedCells.length === 0) return;
    // Use first cell's day/lessonNum for room picker display, but assign to all cells
    const firstCell = selectedCells[0];
    roomPicker.open({
      day: firstCell.day,
      lessonNum: firstCell.lessonNum,
      bulkCells: selectedCells,
    });
  }, [selectedLesson, selectedCells, roomPicker]);

  // Check if bulk assign is available
  const canBulkAssign = selectedLesson && selectedCells.length > 0;

  return (
    <div className={styles.page}>
      <div className={styles.sidebar}>
        <ClassSelector />
        <ValidationPanel />
        <ProtocolPanel />
      </div>

      <div className={styles.main}>
        {currentClass ? (
          <>
            <div className={styles.gridHeader}>
              <h2 className={styles.className}>{currentClass}</h2>
              <div className={styles.headerActions}>
                {canBulkAssign && (
                  <Button
                    variant="primary"
                    size="small"
                    onClick={handleBulkAssign}
                    title={`Назначить "${selectedLesson?.subject}" на ${selectedCells.length} ячеек`}
                  >
                    Назначить ({selectedCells.length})
                  </Button>
                )}
                {partnerData && (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={handleClearPartnerFile}
                    title="Убрать загруженный JSON партнёра"
                  >
                    Отменить JSON партнёра
                  </Button>
                )}
                <Button
                  variant={isDirty ? 'danger' : 'secondary'}
                  size="small"
                  onClick={handleSave}
                  disabled={isSaving}
                  title="Сохранить расписание в браузере"
                >
                  {isSaving ? 'Сохранение...' : isDirty ? 'Сохранить действие*' : 'Сохранить действие'}
                </Button>
                <Button
                  variant={jsonIsDirty ? 'danger' : 'secondary'}
                  size="small"
                  onClick={handleSaveJson}
                  title={"Сохранить все данные в JSON-файл на диск.\n\nДанные в браузере теряются при:\n• очистке данных сайта или истории браузера\n• режиме инкогнито (при закрытии окна)\n• смене браузера или переустановке\n\nСохраняйте файл регулярно."}
                >
                  Сохранить файл
                </Button>
              </div>
            </div>
            {(movingLesson || absentTeacher || copiedLesson || selectedCells.length > 0 || selectedLesson) && <HintBar text={hintText} />}
            <ScheduleGrid
              className={currentClass}
              onAssignLesson={handleAssignLesson}
              onQuickAssign={handleQuickAssign}
              onNavigateToClass={setCurrentClass}
              onForceAssign={handleForceAssign}
            />
          </>
        ) : (
          <div className={styles.placeholder}>
            Выберите класс для редактирования расписания
          </div>
        )}
      </div>

      <div className={styles.rightPanel}>
        {currentClass && <UnscheduledPanel className={currentClass} />}
        {(versionType === 'weekly' || versionType === 'technical' || versionType === 'template') && <AbsentPanel />}
        {(versionType === 'weekly' || versionType === 'technical' || versionType === 'template') && <RoomPanel />}
        {replacementPicker.isOpen && currentClass && replacementPicker.data && (
          <ReplacementPanel
            className={currentClass}
            day={replacementPicker.data.day}
            lessonNum={replacementPicker.data.lessonNum}
            lessonIndex={replacementPicker.data.lessonIndex}
            currentLesson={replacementPicker.data.currentLesson}
            onSelect={handleReplacementSelect}
            onSubstituteSelect={handleSubstituteSelect}
            onUnionSubstituteSelect={handleUnionSubstituteSelect}
            onPartnerSelect={handlePartnerSelect}
            onClose={replacementPicker.close}
          />
        )}
      </div>

      {/* Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        x={contextMenu.position?.x ?? 0}
        y={contextMenu.position?.y ?? 0}
        onClose={closeContextMenu}
      >
        {contextMenu.lessonIndex !== null && (
          <>
            <ContextMenuItem onClick={handleCopyLesson}>
              Копировать
            </ContextMenuItem>
            <ContextMenuItem onClick={handleOpenReplace}>
              Заменить
            </ContextMenuItem>
            <ContextMenuItem onClick={handleStartMove}>
              Переместить
            </ContextMenuItem>
            <ContextMenuItem onClick={handleOpenChangeRoom}>
              Поменять кабинет
            </ContextMenuItem>
            <ContextMenuItem onClick={handleRemoveLesson}>
              Удалить занятие
            </ContextMenuItem>
            <ContextMenuDivider />
          </>
        )}
        {selectedCells.length > 0 && (
          <>
            <ContextMenuItem onClick={() => { handleDeleteSelected(); closeContextMenu(); }}>
              Удалить все выделенные ({selectedCells.length})
            </ContextMenuItem>
            <ContextMenuDivider />
          </>
        )}
        <ContextMenuItem onClick={closeContextMenu}>Отмена</ContextMenuItem>
      </ContextMenu>

      {/* Room Picker Modal */}
      {roomPicker.isOpen && roomPicker.data && (
        <RoomPicker
          isOpen={true}
          onClose={roomPicker.close}
          onSelect={handleRoomSelect}
          day={roomPicker.data.day}
          lessonNum={roomPicker.data.lessonNum}
          preferredSubject={selectedLesson?.subject}
          preferredRoom={selectedLesson ? teachers[selectedLesson.teacher]?.defaultRoom : undefined}
          studentCount={currentClassStudentCount}
        />
      )}

      {/* Change Room Picker Modal */}
      {changeRoomPicker.isOpen && changeRoomPicker.data && (
        <RoomPicker
          isOpen={true}
          onClose={changeRoomPicker.close}
          onSelect={handleChangeRoomSelect}
          day={changeRoomPicker.data.day}
          lessonNum={changeRoomPicker.data.lessonNum}
          preferredSubject={changeRoomPicker.data.subject}
          preferredRoom={teachers[changeRoomPicker.data.teacher]?.defaultRoom}
          studentCount={changeRoomPicker.data.isGroup ? undefined : currentClassStudentCount}
        />
      )}

      {/* Move Target Room Picker Modal */}
      {moveTargetPicker.isOpen && moveTargetPicker.data && movingLesson && (
        <RoomPicker
          isOpen={true}
          onClose={() => { moveTargetPicker.close(); clearMovingLesson(); }}
          onSelect={handleMoveRoomSelect}
          day={moveTargetPicker.data.day}
          lessonNum={moveTargetPicker.data.lessonNum}
          preferredSubject={movingLesson.requirement.subject}
          preferredRoom={teachers[movingLesson.teacher]?.defaultRoom}
          studentCount={currentClassStudentCount}
        />
      )}

      {/* Partner modal: AddTemporaryLessonModal pre-filled from ReplacementPanel partner (Z35-4 / Z39-3) */}
      {currentClass && (
        <AddTemporaryLessonModal
          isOpen={!!partnerModal}
          onClose={() => setPartnerModal(null)}
          currentClass={currentClass}
          initialTeacher={partnerModal?.teacher}
          initialSubject={partnerModal?.subject}
          onSaved={handlePartnerMergeSaved}
        />
      )}

      {pasteWarning && (
        <Modal
          isOpen={true}
          onClose={() => setPasteWarning(null)}
          title="Вставка занятия"
          size="small"
          footer={
            <div style={{ display: 'flex', gap: 'var(--spacing-xs)', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="small" onClick={() => setPasteWarning(null)}>
                Отмена
              </Button>
              {pasteWarning.type === 'extra' ? (
                <Button variant="primary" size="small" onClick={() => {
                  if (!currentClass) return;
                  assignLesson({ className: currentClass, day: pasteWarning.day, lessonNum: pasteWarning.lessonNum, lesson: pasteWarning.lesson });
                  setPasteWarning(null);
                  // Keep copy mode active for multi-paste (Z31-4)
                }}>
                  Добавить
                </Button>
              ) : (
                <Button variant="primary" size="small" onClick={() => {
                  if (!currentClass) return;
                  assignLesson({ className: currentClass, day: pasteWarning.day, lessonNum: pasteWarning.lessonNum, lesson: pasteWarning.lessonWithoutRoom! });
                  setPasteWarning(null);
                  // Keep copy mode active for multi-paste (Z31-4)
                }}>
                  Вставить без кабинета
                </Button>
              )}
            </div>
          }
        >
          <p>{pasteWarning.message}</p>
        </Modal>
      )}
    </div>
  );
}
