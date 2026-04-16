/**
 * Partner Store — tracks partner availability data in memory
 * Persists the raw JSON to IndexedDB, rebuilds lookup Set on load
 */

import { create } from 'zustand';
import type { Day, LessonNumber } from '@/types';
import type { Schedule } from '@/types/schedule';
import type { PartnerAvailabilityFile } from '@/types/partner';
import {
  parsePartnerFile,
  computeMatchedTeachers,
  buildPartnerBusySet,
} from '@/logic/partner';
import {
  getPartnerFileJson,
  getSavedPartnerScheduleJson,
  savePartnerFileToDB,
  clearPartnerFileFromDB,
} from '@/db/partnerFiles';

interface PartnerState {
  partnerData: PartnerAvailabilityFile | null;
  matchedTeachers: Set<string>;
  partnerBusySet: Set<string>;
  /**
   * Snapshot of the isPartner classes' schedule as it was before the partner JSON
   * was loaded. Null if no partner file is active or no partner classes had lessons.
   * Used to restore the schedule on clearPartnerFile().
   */
  savedPartnerSchedule: Schedule | null;
  /**
   * Set when initFromDb() fails to parse the stored partner file (corrupt or incompatible).
   * Null when no error occurred. Cleared on the next successful load or clearPartnerFile().
   */
  loadError: string | null;

  /**
   * Load + validate a partner JSON string, build the busy set, persist to IDB.
   * Throws a user-friendly Error if the JSON is invalid.
   *
   * @param savedSchedule - Current schedule slice for isPartner classes, captured
   *   by the caller before clearing those classes. If a savedPartnerSchedule is
   *   already in state (user clicked "Обновить"), the existing one is preserved so
   *   we always restore to the original pre-partner state.
   */
  loadPartnerFile: (json: string, ourTeacherNames: string[], savedSchedule?: Schedule) => Promise<void>;

  /** Clear partner data from memory and IDB. Returns the saved schedule for the caller to restore. */
  clearPartnerFile: () => Promise<Schedule | null>;

  /**
   * Re-load partner data from IDB on app start.
   * Must be called after teacher names are available.
   */
  initFromDb: (ourTeacherNames: string[]) => Promise<void>;

  /** O(1) check whether a teacher is busy at a given slot per the partner data */
  isPartnerBusy: (teacher: string, day: Day, lesson: LessonNumber) => boolean;
}

export const usePartnerStore = create<PartnerState>((set, get) => ({
  partnerData: null,
  matchedTeachers: new Set(),
  partnerBusySet: new Set(),
  savedPartnerSchedule: null,
  loadError: null,

  loadPartnerFile: async (json, ourTeacherNames, savedSchedule) => {
    const parsed = parsePartnerFile(json);
    const matchedTeachers = computeMatchedTeachers(parsed.slots, ourTeacherNames);
    const partnerBusySet = buildPartnerBusySet(parsed, matchedTeachers);

    // Preserve the existing restore point if one is already set (user clicked "Обновить")
    const existing = get().savedPartnerSchedule;
    const scheduleToSave = existing ?? savedSchedule ?? null;

    const savedJson = scheduleToSave ? JSON.stringify(scheduleToSave) : undefined;
    await savePartnerFileToDB(json, savedJson);

    set({ partnerData: parsed, matchedTeachers, partnerBusySet, savedPartnerSchedule: scheduleToSave, loadError: null });
  },

  clearPartnerFile: async () => {
    const { savedPartnerSchedule } = get();
    await clearPartnerFileFromDB();
    set({ partnerData: null, matchedTeachers: new Set(), partnerBusySet: new Set(), savedPartnerSchedule: null, loadError: null });
    return savedPartnerSchedule;
  },

  initFromDb: async (ourTeacherNames) => {
    const json = await getPartnerFileJson();
    if (!json) return;

    try {
      const parsed = parsePartnerFile(json);
      const matchedTeachers = computeMatchedTeachers(parsed.slots, ourTeacherNames);
      const partnerBusySet = buildPartnerBusySet(parsed, matchedTeachers);

      const savedJson = await getSavedPartnerScheduleJson();
      const savedPartnerSchedule: Schedule | null = savedJson ? JSON.parse(savedJson) : null;

      set({ partnerData: parsed, matchedTeachers, partnerBusySet, savedPartnerSchedule });
    } catch (e) {
      // Saved file is corrupt or from incompatible version — clear it and surface the error
      await clearPartnerFileFromDB();
      set({ loadError: e instanceof Error ? e.message : 'Повреждённый файл партнёра' });
    }
  },

  isPartnerBusy: (teacher, day, lesson) => {
    return get().partnerBusySet.has(`${teacher}|${day}|${lesson}`);
  },
}));
