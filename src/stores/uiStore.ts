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
import {
  reduceEditorInteraction,
  type CopiedLessonData,
  type EditorInteraction,
  type MovingLessonData,
} from '@/logic/editorFlow';

interface UIState {
  // Navigation
  activeTab: AppTab;
  currentClass: string | null;

  // Editor interaction
  interaction: EditorInteraction;
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

  // Export page persistent state (survives tab switches within session)
  exportView: 'classes' | 'teachers' | 'rooms';
  exportSelectedDay: Day | null;

  // Actions - Navigation
  setActiveTab: (tab: AppTab) => void;
  /** Switch active class and cancel the current editor interaction. */
  setCurrentClass: (className: string | null) => void;

  // Actions - Selection
  /** Select a lesson from the unscheduled panel, replacing any copy or move interaction. */
  selectLesson: (lesson: LessonRequirement | null) => void;
  selectCell: (cellRef: CellRef) => void;
  selectContextCell: (cellRef: CellRef) => void;
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
  setCopiedLesson: (lesson: CopiedLessonData | null) => void;

  // Actions - Moving lesson
  setMovingLesson: (data: MovingLessonData | null) => void;
  cancelInteraction: () => void;

  // Actions - Export
  setExportView: (view: 'classes' | 'teachers' | 'rooms') => void;
  setExportSelectedDay: (day: Day | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Initial state
  activeTab: 'start',
  currentClass: null,
  interaction: { type: 'idle' },
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
  exportView: 'classes',
  exportSelectedDay: null,

  // Navigation
  setActiveTab: (tab) => set({ activeTab: tab }),

  setCurrentClass: (className) => set({
    currentClass: className,
    interaction: { type: 'idle' },
    selectedCells: [],
    showReplacementPanel: false,
  }),

  // Selection
  selectLesson: (lesson) => set((state) => ({
    interaction: reduceEditorInteraction(
      state.interaction,
      lesson ? { type: 'SELECT_LESSON', lesson } : { type: 'CANCEL' }
    ),
    selectedCells: [],
  })),

  selectCell: (cellRef) => set({
    selectedCells: [cellRef],
    interaction: { type: 'idle' },
  }),

  selectContextCell: (cellRef) => set({
    selectedCells: [cellRef],
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
      interaction: { type: 'idle' },
    };
  }),

  clearCellSelection: () => set({ selectedCells: [] }),

  clearAllSelection: () => set({
    interaction: { type: 'idle' },
    selectedCells: [],
    showReplacementPanel: false,
    replacementForCell: null,
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
  setCopiedLesson: (lesson) => set((state) => ({
    interaction: reduceEditorInteraction(
      state.interaction,
      lesson ? { type: 'START_COPY', lesson } : { type: 'CANCEL' }
    ),
    selectedCells: [],
    showReplacementPanel: false,
    replacementForCell: null,
  })),

  // Moving lesson
  setMovingLesson: (data) => set((state) => ({
    interaction: reduceEditorInteraction(
      state.interaction,
      data ? { type: 'START_MOVE', lesson: data } : { type: 'CANCEL' }
    ),
    selectedCells: [],
    showReplacementPanel: false,
    replacementForCell: null,
  })),
  cancelInteraction: () => set((state) => ({
    interaction: reduceEditorInteraction(state.interaction, { type: 'CANCEL' }),
  })),

  // Export
  setExportView: (view) => set({ exportView: view }),
  setExportSelectedDay: (day) => set({ exportSelectedDay: day }),
}));

// Selectors for common checks
export const useIsLessonSelected = () =>
  useUIStore((state) => state.interaction.type === 'assigning');

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
    state.interaction.type !== 'idle' || state.selectedCells.length > 0
  );

/** Build the key used in absentMarkedCells set */
export function absentCellKey(className: string, day: Day, lessonNum: number): string {
  return `${className}|${day}|${lessonNum}`;
}
