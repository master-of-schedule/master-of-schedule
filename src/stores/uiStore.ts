/**
 * UI Store - User interface state
 * Selection, navigation, modals, search
 */

import { create } from 'zustand';
import type {
  AppTab,
  CellRef,
  LessonRequirement,
  Day,
  LessonNumber,
  ContextMenuState,
  ModalType,
  SearchResult,
} from '@/types';
import { DAYS, LESSON_NUMBERS } from '@/types';

interface UIState {
  // Navigation
  activeTab: AppTab;
  currentClass: string | null;

  // Selection
  selectedLesson: LessonRequirement | null;
  selectedCells: CellRef[];

  // Context menu
  contextMenu: ContextMenuState;

  // Modal
  activeModal: ModalType;
  modalData: unknown;

  // Search
  searchQuery: string;
  searchResults: SearchResult[];

  // Replacement panel
  showReplacementPanel: boolean;
  replacementForCell: CellRef | null;

  // Absent teacher tracking (session-only)
  absentTeacher: string | null;
  absentDay: Day | null;
  absentMarkedCells: Set<string>;
  absentLessons: Array<{ className: string; lessonNum: LessonNumber; subjects: string[] }>;

  // Room schedule panel (session-only)
  roomPanelRoom: string | null;
  roomPanelDay: Day | null;
  roomPanelMarkedCells: Set<string>;
  roomPanelLessons: Array<{ className: string; lessonNum: LessonNumber; subjects: string[] }>;

  // Keyboard navigation
  focusedCell: { day: Day; lessonNum: number } | null;

  // Highlighted movable cell (when user clicks movable option in replacement picker)
  highlightedMovableCell: CellRef | null;

  // Highlighted movable teacher (all their lessons in the grid get highlighted)
  highlightedMovableTeacher: string | null;

  // Copied lesson for grid paste (move semantics: sourceRef tracks where it was copied from)
  copiedLesson: {
    requirement: LessonRequirement;
    room: string;
    sourceRef: { className: string; day: Day; lessonNum: LessonNumber; lessonIndex: number };
  } | null;

  // Moving lesson: user chose "Переместить" from context menu, awaiting target cell click
  movingLesson: {
    sourceRef: { className: string; day: Day; lessonNum: LessonNumber; lessonIndex: number };
    requirement: LessonRequirement;
    room: string;
    teacher: string;
    originalTeacher?: string;
    isSubstitution?: boolean;
  } | null;

  // Export page persistent state (survives tab switches within session)
  exportView: 'classes' | 'teachers' | 'rooms';
  exportSelectedDay: Day | null;

  // Actions - Navigation
  setActiveTab: (tab: AppTab) => void;
  /** Switch active class. Clears selectedLesson, selectedCells, showReplacementPanel, movingLesson, copiedLesson. */
  setCurrentClass: (className: string | null) => void;

  // Actions - Selection
  /** Select a lesson from the unscheduled panel. Clears selectedCells, movingLesson, copiedLesson. */
  selectLesson: (lesson: LessonRequirement | null) => void;
  selectCell: (cellRef: CellRef) => void;
  toggleCellSelection: (cellRef: CellRef) => void;
  clearCellSelection: () => void;
  clearAllSelection: () => void;

  // Actions - Context menu
  openContextMenu: (x: number, y: number, cellRef: CellRef, lessonIndex: number | null) => void;
  closeContextMenu: () => void;

  // Actions - Modal
  openModal: (modal: ModalType, data?: unknown) => void;
  closeModal: () => void;

  // Actions - Search
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  clearSearch: () => void;

  // Actions - Replacement panel
  showReplacements: (cellRef: CellRef) => void;
  hideReplacements: () => void;

  // Actions - Absent teacher
  setAbsentTeacher: (teacher: string | null, day: Day | null) => void;
  setAbsentLessons: (lessons: Array<{ className: string; lessonNum: LessonNumber; subjects: string[] }>) => void;
  toggleAbsentCell: (className: string, day: Day, lessonNum: number) => void;
  clearAbsentMarked: () => void;

  // Actions - Room panel
  setRoomPanel: (room: string | null, day: Day | null) => void;
  setRoomPanelLessons: (lessons: Array<{ className: string; lessonNum: LessonNumber; subjects: string[] }>) => void;
  toggleRoomPanelCell: (className: string, day: Day, lessonNum: number) => void;
  clearRoomPanelMarked: () => void;

  // Actions - Keyboard navigation
  setFocusedCell: (day: Day, lessonNum: number) => void;
  clearFocusedCell: () => void;
  moveFocus: (direction: 'up' | 'down' | 'left' | 'right', maxDayIndex?: number, maxLessonIndex?: number) => void;

  // Actions - Highlighted movable cell/teacher
  setHighlightedMovableCell: (cellRef: CellRef | null) => void;
  clearHighlightedMovableCell: () => void;
  setHighlightedMovableTeacher: (teacher: string | null) => void;
  clearHighlightedMovableTeacher: () => void;

  // Actions - Copied lesson
  setCopiedLesson: (lesson: {
    requirement: LessonRequirement;
    room: string;
    sourceRef: { className: string; day: Day; lessonNum: LessonNumber; lessonIndex: number };
  } | null) => void;

  // Actions - Moving lesson
  setMovingLesson: (data: {
    sourceRef: { className: string; day: Day; lessonNum: LessonNumber; lessonIndex: number };
    requirement: LessonRequirement;
    room: string;
    teacher: string;
    originalTeacher?: string;
    isSubstitution?: boolean;
  } | null) => void;
  clearMovingLesson: () => void;

  // Actions - Export
  setExportView: (view: 'classes' | 'teachers' | 'rooms') => void;
  setExportSelectedDay: (day: Day | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Initial state
  activeTab: 'start',
  currentClass: null,
  selectedLesson: null,
  selectedCells: [],
  contextMenu: {
    isOpen: false,
    position: null,
    cellRef: null,
    lessonIndex: null,
  },
  activeModal: null,
  modalData: null,
  searchQuery: '',
  searchResults: [],
  showReplacementPanel: false,
  replacementForCell: null,
  absentTeacher: null,
  absentDay: null,
  absentMarkedCells: new Set<string>(),
  absentLessons: [],
  roomPanelRoom: null,
  roomPanelDay: null,
  roomPanelMarkedCells: new Set<string>(),
  roomPanelLessons: [],
  focusedCell: null,
  highlightedMovableCell: null,
  highlightedMovableTeacher: null,
  copiedLesson: null,
  movingLesson: null,
  exportView: 'classes',
  exportSelectedDay: null,

  // Navigation
  setActiveTab: (tab) => set({ activeTab: tab }),

  setCurrentClass: (className) => set({
    currentClass: className,
    selectedLesson: null,
    selectedCells: [],
    showReplacementPanel: false,
    movingLesson: null,
    copiedLesson: null,
  }),

  // Selection
  selectLesson: (lesson) => set({
    selectedLesson: lesson,
    selectedCells: [],
    copiedLesson: null,
    movingLesson: null,
  }),

  selectCell: (cellRef) => set({
    selectedCells: [cellRef],
    selectedLesson: null,
  }),

  toggleCellSelection: (cellRef) => set((state) => {
    const exists = state.selectedCells.some(
      c => c.className === cellRef.className &&
           c.day === cellRef.day &&
           c.lessonNum === cellRef.lessonNum
    );

    if (exists) {
      return {
        selectedCells: state.selectedCells.filter(
          c => !(c.className === cellRef.className &&
                 c.day === cellRef.day &&
                 c.lessonNum === cellRef.lessonNum)
        ),
      };
    }

    return {
      selectedCells: [...state.selectedCells, cellRef],
      selectedLesson: null,
    };
  }),

  clearCellSelection: () => set({ selectedCells: [] }),

  clearAllSelection: () => set({
    selectedLesson: null,
    selectedCells: [],
    showReplacementPanel: false,
    replacementForCell: null,
    copiedLesson: null,
    movingLesson: null,
  }),

  // Context menu
  openContextMenu: (x, y, cellRef, lessonIndex) => set({
    contextMenu: {
      isOpen: true,
      position: { x, y },
      cellRef,
      lessonIndex,
    },
  }),

  closeContextMenu: () => set({
    contextMenu: {
      isOpen: false,
      position: null,
      cellRef: null,
      lessonIndex: null,
    },
  }),

  // Modal
  openModal: (modal, data) => set({
    activeModal: modal,
    modalData: data,
  }),

  closeModal: () => set({
    activeModal: null,
    modalData: null,
  }),

  // Search
  setSearchQuery: (query) => set({ searchQuery: query }),

  setSearchResults: (results) => set({ searchResults: results }),

  clearSearch: () => set({
    searchQuery: '',
    searchResults: [],
  }),

  // Replacement panel
  showReplacements: (cellRef) => set({
    showReplacementPanel: true,
    replacementForCell: cellRef,
  }),

  hideReplacements: () => set({
    showReplacementPanel: false,
    replacementForCell: null,
  }),

  // Absent teacher
  setAbsentTeacher: (teacher, day) => set({
    absentTeacher: teacher,
    absentDay: day,
    // Clear snapshot when teacher/day changes — will be re-captured by AbsentPanel
    absentLessons: [],
  }),

  setAbsentLessons: (lessons) => set({ absentLessons: lessons }),

  toggleAbsentCell: (className, day, lessonNum) => set((state) => {
    const key = `${className}|${day}|${lessonNum}`;
    const next = new Set(state.absentMarkedCells);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    return { absentMarkedCells: next };
  }),

  clearAbsentMarked: () => set({
    absentTeacher: null,
    absentDay: null,
    absentMarkedCells: new Set<string>(),
    absentLessons: [],
  }),

  // Room panel
  setRoomPanel: (room, day) => set({
    roomPanelRoom: room,
    roomPanelDay: day,
    roomPanelLessons: [],
  }),

  setRoomPanelLessons: (lessons) => set({ roomPanelLessons: lessons }),

  toggleRoomPanelCell: (className, day, lessonNum) => set((state) => {
    const key = `${className}|${day}|${lessonNum}`;
    const next = new Set(state.roomPanelMarkedCells);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    return { roomPanelMarkedCells: next };
  }),

  clearRoomPanelMarked: () => set({
    roomPanelRoom: null,
    roomPanelDay: null,
    roomPanelMarkedCells: new Set<string>(),
    roomPanelLessons: [],
  }),

  // Keyboard navigation
  setFocusedCell: (day, lessonNum) => set({ focusedCell: { day, lessonNum } }),

  clearFocusedCell: () => set({ focusedCell: null }),

  moveFocus: (direction, maxDayIndex, maxLessonIndex) => set((state) => {
    if (!state.focusedCell) {
      // Start at first cell if no focus
      return { focusedCell: { day: DAYS[0], lessonNum: LESSON_NUMBERS[0] } };
    }

    const { day, lessonNum } = state.focusedCell;
    const dayIndex = DAYS.indexOf(day);
    const lessonIndex = LESSON_NUMBERS.indexOf(lessonNum as typeof LESSON_NUMBERS[number]);
    const maxDay = maxDayIndex ?? DAYS.length - 1;
    const maxLesson = maxLessonIndex ?? LESSON_NUMBERS.length - 1;

    let newDayIndex = dayIndex;
    let newLessonIndex = lessonIndex;

    switch (direction) {
      case 'up':
        newLessonIndex = Math.max(0, lessonIndex - 1);
        break;
      case 'down':
        newLessonIndex = Math.min(maxLesson, lessonIndex + 1);
        break;
      case 'left':
        newDayIndex = Math.max(0, dayIndex - 1);
        break;
      case 'right':
        newDayIndex = Math.min(maxDay, dayIndex + 1);
        break;
    }

    return {
      focusedCell: {
        day: DAYS[newDayIndex],
        lessonNum: LESSON_NUMBERS[newLessonIndex],
      },
    };
  }),

  // Highlighted movable cell/teacher
  setHighlightedMovableCell: (cellRef) => set({ highlightedMovableCell: cellRef }),
  clearHighlightedMovableCell: () => set({ highlightedMovableCell: null }),
  setHighlightedMovableTeacher: (teacher) => set({ highlightedMovableTeacher: teacher }),
  clearHighlightedMovableTeacher: () => set({ highlightedMovableTeacher: null }),

  // Copied lesson
  setCopiedLesson: (lesson) => set({
    copiedLesson: lesson,
    movingLesson: null,
    selectedLesson: null,
    selectedCells: [],
    showReplacementPanel: false,
    replacementForCell: null,
  }),

  // Moving lesson
  setMovingLesson: (data) => set({
    movingLesson: data,
    copiedLesson: null,
    selectedLesson: null,
    selectedCells: [],
    showReplacementPanel: false,
    replacementForCell: null,
  }),
  clearMovingLesson: () => set({ movingLesson: null }),

  // Export
  setExportView: (view) => set({ exportView: view }),
  setExportSelectedDay: (day) => set({ exportSelectedDay: day }),
}));

// Selectors for common checks
export const useIsLessonSelected = () =>
  useUIStore((state) => state.selectedLesson !== null);

export const useIsCellSelected = (cellRef: CellRef) =>
  useUIStore((state) =>
    state.selectedCells.some(
      c => c.className === cellRef.className &&
           c.day === cellRef.day &&
           c.lessonNum === cellRef.lessonNum
    )
  );

export const useHasSelection = () =>
  useUIStore((state) =>
    state.selectedLesson !== null || state.selectedCells.length > 0
  );

/** Build the key used in absentMarkedCells set */
export function absentCellKey(className: string, day: Day, lessonNum: number): string {
  return `${className}|${day}|${lessonNum}`;
}
