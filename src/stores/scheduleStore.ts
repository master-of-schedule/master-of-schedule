/**
 * Schedule Store - Current schedule state with undo/redo history (Protocol)
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useDataStore } from './dataStore';
import type {
  Schedule,
  ScheduledLesson,
  Substitution,
  VersionType,
  Day,
  LessonNumber,
  LessonRequirement,
  HistoryEntry,
  HistoryActionType,
} from '@/types';
import { describeAction } from '@/types';
import { generateId } from '@/utils/generateId';
import {
  addLessonToSlot,
  removeLessonFromSlot,
  updateLessonRoom,
  cloneSchedule,
} from '@/logic';

interface ScheduleState {
  // Current schedule
  schedule: Schedule;

  // Version info
  versionId: string | null;
  versionType: VersionType;
  versionName: string;
  mondayDate: Date | null; // For weekly schedules
  versionDaysPerWeek: number | null; // Per-version day count override (weekly schedules)
  isDirty: boolean;
  /** JSON file has not been exported since the last schedule change */
  jsonIsDirty: boolean;

  // Base template for diff highlighting (weekly schedules only)
  baseTemplateId: string | null;
  baseTemplateSchedule: Schedule | null;

  // History (Protocol)
  history: HistoryEntry[];
  historyIndex: number; // Current position in history (-1 = no history)

  // Substitutions
  substitutions: Substitution[];

  // Temporary extra lessons (per-version, not in master requirements)
  temporaryLessons: LessonRequirement[];

  // Per-lesson statuses (sick / completed) — weekly schedules only
  lessonStatuses: Record<string, 'sick' | 'completed' | 'completed2'>;

  /**
   * Acknowledged conflict keys for the current version.
   * Persisted to IndexedDB on save; restored on load.
   * Cleared for a slot when a lesson is assigned to or removed from that slot.
   * Does NOT clear on: undo/redo (history restores schedule only), room changes.
   */
  acknowledgedConflictKeys: string[];

  // Actions - Schedule modification
  assignLesson: (params: {
    className: string;
    day: Day;
    lessonNum: LessonNumber;
    lesson: ScheduledLesson;
  }) => void;

  removeLesson: (params: {
    className: string;
    day: Day;
    lessonNum: LessonNumber;
    lessonIndex: number;
  }) => void;

  removeLessons: (params: {
    className: string;
    day: Day;
    lessonNum: LessonNumber;
    lessonIndex: number;
  }[]) => void;

  changeRoom: (params: {
    className: string;
    day: Day;
    lessonNum: LessonNumber;
    lessonIndex: number;
    newRoom: string;
  }) => void;

  replaceLesson: (params: {
    className: string;
    day: Day;
    lessonNum: LessonNumber;
    lessonIndex: number;
    newLesson: ScheduledLesson;
  }) => void;

  // Actions - Substitution
  addSubstitution: (substitution: Substitution) => void;
  removeSubstitution: (id: string) => void;

  // Actions - Temporary lessons
  addTemporaryLesson: (lesson: LessonRequirement) => void;
  removeTemporaryLesson: (id: string) => void;

  // Actions - Lesson statuses
  setLessonStatus: (id: string, status: 'sick' | 'completed' | 'completed2') => void;
  clearLessonStatus: (id: string) => void;

  // Actions - History
  undo: () => void;
  redo: () => void;
  undoAll: () => void;
  goToHistoryEntry: (index: number) => void;
  clearHistory: () => void;

  // Actions - Conflict acknowledgement
  acknowledgeConflict: (key: string) => void;
  clearConflictAcks: (day: Day, lessonNum: LessonNumber) => void;

  // Actions - Version management
  newSchedule: (type: VersionType, mondayDate?: Date, baseTemplateId?: string, baseTemplateSchedule?: Schedule, daysPerWeek?: number, name?: string) => void;
  loadSchedule: (params: {
    schedule: Schedule;
    versionId: string;
    versionType: VersionType;
    versionName: string;
    mondayDate?: Date;
    versionDaysPerWeek?: number;
    substitutions?: Substitution[];
    temporaryLessons?: LessonRequirement[];
    lessonStatuses?: Record<string, 'sick' | 'completed' | 'completed2'>;
    acknowledgedConflictKeys?: string[];
    baseTemplateId?: string;
    baseTemplateSchedule?: Schedule;
  }) => void;
  markSaved: (versionId: string, versionName: string) => void;
  markJsonSaved: () => void;
  updateVersionName: (name: string) => void;

  // Helpers
  getHistoryDescription: (index: number) => string;
}


/** Returns history up to and including the current index, discarding any redo entries. */
function truncateHistory(history: HistoryEntry[], historyIndex: number): HistoryEntry[] {
  return historyIndex < history.length - 1
    ? history.slice(0, historyIndex + 1)
    : [...history];
}

function createHistoryEntry(
  actionType: HistoryActionType,
  description: string,
  schedule: Schedule,
  substitutions: Substitution[]
): HistoryEntry {
  return {
    id: generateId(),
    timestamp: new Date(),
    actionType,
    description,
    schedule: cloneSchedule(schedule),
    substitutions: substitutions.map(s => ({ ...s })),
  };
}

export const useScheduleStore = create<ScheduleState>()(
  immer((set, get) => ({
    // Initial state
    schedule: {},
    versionId: null,
    versionType: 'technical',
    versionName: 'Новое расписание',
    mondayDate: null,
    versionDaysPerWeek: null,
    isDirty: false,
    jsonIsDirty: false,
    history: [],
    historyIndex: -1,
    substitutions: [],
    temporaryLessons: [],
    lessonStatuses: {},
    acknowledgedConflictKeys: [],
    baseTemplateId: null,
    baseTemplateSchedule: null,

    // Assign a lesson to a slot
    assignLesson: ({ className, day, lessonNum, lesson }) => {
      if (useDataStore.getState().isReadOnlyYear) return;
      const state = get();

      // If we're not at the end of history, truncate future entries
      const newHistory = truncateHistory(state.history, state.historyIndex);

      const newSchedule = addLessonToSlot(state.schedule, className, day, lessonNum, lesson);

      const description = describeAction('assign', {
        subject: lesson.subject,
        className,
        day,
        lessonNum,
      });

      newHistory.push(createHistoryEntry('assign', description, newSchedule, state.substitutions));

      set({
        schedule: newSchedule,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        isDirty: true,
        jsonIsDirty: true,
      });
    },

    // Remove a lesson from a slot
    removeLesson: ({ className, day, lessonNum, lessonIndex }) => {
      if (useDataStore.getState().isReadOnlyYear) return;
      const state = get();
      const lessons = state.schedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
      const lesson = lessons[lessonIndex];

      if (!lesson) return;

      const newHistory = truncateHistory(state.history, state.historyIndex);

      const newSchedule = removeLessonFromSlot(state.schedule, className, day, lessonNum, lessonIndex);

      const description = describeAction('remove', {
        subject: lesson.subject,
        className,
        day,
        lessonNum,
      });

      newHistory.push(createHistoryEntry('remove', description, newSchedule, state.substitutions));

      set({
        schedule: newSchedule,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        isDirty: true,
        jsonIsDirty: true,
      });
    },

    // Remove multiple lessons at once
    removeLessons: (items) => {
      if (useDataStore.getState().isReadOnlyYear) return;
      if (items.length === 0) return;

      const state = get();
      let newSchedule = state.schedule;

      // Sort by lessonIndex descending to avoid index shifting issues
      const sortedItems = [...items].sort((a, b) => b.lessonIndex - a.lessonIndex);

      for (const { className, day, lessonNum, lessonIndex } of sortedItems) {
        newSchedule = removeLessonFromSlot(newSchedule, className, day, lessonNum, lessonIndex);
      }

      const newHistory = truncateHistory(state.history, state.historyIndex);

      const uniqueClasses = [...new Set(items.map(i => i.className))].sort();
      const description = describeAction('multi_remove', {
        count: items.length,
        className: uniqueClasses.join(', '),
      });

      newHistory.push(createHistoryEntry('multi_remove', description, newSchedule, state.substitutions));

      set({
        schedule: newSchedule,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        isDirty: true,
        jsonIsDirty: true,
      });
    },

    // Change room for a lesson
    changeRoom: ({ className, day, lessonNum, lessonIndex, newRoom }) => {
      if (useDataStore.getState().isReadOnlyYear) return;
      const state = get();
      const lessons = state.schedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
      const lesson = lessons[lessonIndex];

      if (!lesson) return;

      const newHistory = truncateHistory(state.history, state.historyIndex);

      const newSchedule = updateLessonRoom(state.schedule, className, day, lessonNum, lessonIndex, newRoom);

      const description = describeAction('change_room', {
        subject: lesson.subject,
        className,
        room: newRoom,
      });

      newHistory.push(createHistoryEntry('change_room', description, newSchedule, state.substitutions));

      set({
        schedule: newSchedule,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        isDirty: true,
        jsonIsDirty: true,
      });
    },

    // Replace a lesson with another
    replaceLesson: ({ className, day, lessonNum, lessonIndex, newLesson }) => {
      if (useDataStore.getState().isReadOnlyYear) return;
      const state = get();

      // Remove old and add new
      let newSchedule = removeLessonFromSlot(state.schedule, className, day, lessonNum, lessonIndex);
      newSchedule = addLessonToSlot(newSchedule, className, day, lessonNum, newLesson);

      const newHistory = truncateHistory(state.history, state.historyIndex);

      const description = describeAction('substitute', {
        teacher: newLesson.teacher,
        className,
        day,
        lessonNum,
      });

      newHistory.push(createHistoryEntry('substitute', description, newSchedule, state.substitutions));

      set({
        schedule: newSchedule,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        isDirty: true,
        jsonIsDirty: true,
      });
    },

    // Add substitution record
    addSubstitution: (substitution) => {
      if (useDataStore.getState().isReadOnlyYear) return;
      set((state) => {
        state.substitutions.push(substitution);
      });
    },

    // Remove substitution record
    removeSubstitution: (id) => {
      if (useDataStore.getState().isReadOnlyYear) return;
      set((state) => {
        const index = state.substitutions.findIndex(s => s.id === id);
        if (index !== -1) {
          state.substitutions.splice(index, 1);
        }
      });
    },

    // Add a temporary lesson (per-version extra)
    addTemporaryLesson: (lesson) => {
      if (useDataStore.getState().isReadOnlyYear) return;
      set((state) => {
        state.temporaryLessons.push(lesson);
        state.isDirty = true;
        state.jsonIsDirty = true;
      });
    },

    // Remove a temporary lesson
    removeTemporaryLesson: (id) => {
      if (useDataStore.getState().isReadOnlyYear) return;
      set((state) => {
        const index = state.temporaryLessons.findIndex(l => l.id === id);
        if (index !== -1) {
          state.temporaryLessons.splice(index, 1);
          state.isDirty = true;
        }
      });
    },

    // Set lesson status (sick / completed)
    setLessonStatus: (id, status) => {
      if (useDataStore.getState().isReadOnlyYear) return;
      set((state) => {
        state.lessonStatuses[id] = status;
        state.isDirty = true;
        state.jsonIsDirty = true;
      });
    },

    // Clear lesson status (back to normal)
    clearLessonStatus: (id) => {
      if (useDataStore.getState().isReadOnlyYear) return;
      set((state) => {
        delete state.lessonStatuses[id];
        state.isDirty = true;
        state.jsonIsDirty = true;
      });
    },

    // Undo - go back one step in history
    undo: () => {
      if (useDataStore.getState().isReadOnlyYear) return;
      const state = get();
      if (state.historyIndex <= 0) return;

      const newIndex = state.historyIndex - 1;
      const entry = state.history[newIndex];

      set({
        schedule: cloneSchedule(entry.schedule),
        substitutions: entry.substitutions.map(s => ({ ...s })),
        historyIndex: newIndex,
        isDirty: true,
        jsonIsDirty: true,
      });
    },

    // Redo - go forward one step in history
    redo: () => {
      if (useDataStore.getState().isReadOnlyYear) return;
      const state = get();
      if (state.historyIndex >= state.history.length - 1) return;

      const newIndex = state.historyIndex + 1;
      const entry = state.history[newIndex];

      set({
        schedule: cloneSchedule(entry.schedule),
        substitutions: entry.substitutions.map(s => ({ ...s })),
        historyIndex: newIndex,
        isDirty: true,
        jsonIsDirty: true,
      });
    },

    // Undo all - go back to the beginning
    undoAll: () => {
      if (useDataStore.getState().isReadOnlyYear) return;
      const state = get();
      if (state.historyIndex <= 0 || state.history.length === 0) return;

      const entry = state.history[0];

      set({
        schedule: cloneSchedule(entry.schedule),
        substitutions: entry.substitutions.map(s => ({ ...s })),
        historyIndex: 0,
        isDirty: true,
        jsonIsDirty: true,
      });
    },

    // Jump to specific history entry
    goToHistoryEntry: (index) => {
      if (useDataStore.getState().isReadOnlyYear) return;
      const state = get();
      if (index < 0 || index >= state.history.length) return;

      const entry = state.history[index];

      set({
        schedule: cloneSchedule(entry.schedule),
        substitutions: entry.substitutions.map(s => ({ ...s })),
        historyIndex: index,
        isDirty: true,
        jsonIsDirty: true,
      });
    },

    // Clear history (after save)
    clearHistory: () => {
      const state = get();

      // Keep only current state as initial entry
      const currentEntry = createHistoryEntry(
        'import',
        'Сохранено',
        state.schedule,
        state.substitutions
      );

      set({
        history: [currentEntry],
        historyIndex: 0,
      });
    },

    // Conflict acknowledgement
    acknowledgeConflict: (key) => set((state) => ({
      acknowledgedConflictKeys: state.acknowledgedConflictKeys.includes(key)
        ? state.acknowledgedConflictKeys
        : [...state.acknowledgedConflictKeys, key],
      isDirty: true,
      jsonIsDirty: true,
    })),
    clearConflictAcks: (day, lessonNum) => set((state) => ({
      acknowledgedConflictKeys: state.acknowledgedConflictKeys.filter(
        k => !k.includes(`|${day}|${lessonNum}|`)
      ),
    })),

    // Create new empty schedule
    newSchedule: (type, mondayDate, baseTemplateId, baseTemplateSchedule, daysPerWeek, name) => {
      if (useDataStore.getState().isReadOnlyYear) return;
      const initialEntry = createHistoryEntry('import', 'Начало', {}, []);
      set({
        schedule: {},
        versionId: null,
        versionType: type,
        versionName: name?.trim() || 'Новое расписание',
        mondayDate: mondayDate ?? null,
        versionDaysPerWeek: daysPerWeek ?? null,
        isDirty: false,
        jsonIsDirty: false,
        history: [initialEntry],
        historyIndex: 0,
        substitutions: [],
        temporaryLessons: [],
        lessonStatuses: {},
        acknowledgedConflictKeys: [],
        baseTemplateId: baseTemplateId ?? null,
        baseTemplateSchedule: baseTemplateSchedule ? cloneSchedule(baseTemplateSchedule) : null,
      });
    },

    // Load existing schedule
    loadSchedule: ({ schedule, versionId, versionType, versionName, mondayDate, versionDaysPerWeek, substitutions, temporaryLessons, lessonStatuses, acknowledgedConflictKeys, baseTemplateId, baseTemplateSchedule }) => {
      const initialEntry = createHistoryEntry(
        'import',
        'Загружено',
        schedule,
        substitutions ?? []
      );

      set({
        schedule: cloneSchedule(schedule),
        versionId,
        versionType,
        versionName,
        mondayDate: mondayDate ?? null,
        versionDaysPerWeek: versionDaysPerWeek ?? null,
        isDirty: false,
        jsonIsDirty: false,
        history: [initialEntry],
        historyIndex: 0,
        substitutions: substitutions ?? [],
        temporaryLessons: temporaryLessons ?? [],
        lessonStatuses: lessonStatuses ?? {},
        acknowledgedConflictKeys: acknowledgedConflictKeys ?? [],
        baseTemplateId: baseTemplateId ?? null,
        baseTemplateSchedule: baseTemplateSchedule ? cloneSchedule(baseTemplateSchedule) : null,
      });
    },

    // Mark as saved
    markSaved: (versionId, versionName) => {
      set({
        versionId,
        versionName,
        isDirty: false,
      });
    },

    // Mark JSON file as saved (exported)
    markJsonSaved: () => {
      set({ jsonIsDirty: false });
    },

    // Update version name
    updateVersionName: (name) => {
      if (useDataStore.getState().isReadOnlyYear) return;
      set({
        versionName: name,
        isDirty: true,
        jsonIsDirty: true,
      });
    },

    // Get description for history entry
    getHistoryDescription: (index) => {
      const state = get();
      return state.history[index]?.description ?? '';
    },
  }))
);

// Selectors
export const useCanUndo = () =>
  useScheduleStore((state) => state.historyIndex > 0);

export const useCanRedo = () =>
  useScheduleStore((state) => state.historyIndex < state.history.length - 1);

export const useIsDirty = () =>
  useScheduleStore((state) => state.isDirty);

export const useScheduleSlot = (className: string, day: Day, lessonNum: LessonNumber) =>
  useScheduleStore((state) =>
    state.schedule[className]?.[day]?.[lessonNum]?.lessons ?? []
  );
