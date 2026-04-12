/**
 * Tests for partnerStore actions and state transitions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DB functions
vi.mock('@/db/partnerFiles', () => ({
  getPartnerFileJson: vi.fn().mockResolvedValue(null),
  getSavedPartnerScheduleJson: vi.fn().mockResolvedValue(null),
  savePartnerFileToDB: vi.fn().mockResolvedValue(undefined),
  clearPartnerFileFromDB: vi.fn().mockResolvedValue(undefined),
}));

import { usePartnerStore } from './partnerStore';
import * as partnerFilesMock from '@/db/partnerFiles';
import type { PartnerAvailabilityFile } from '@/types/partner';
import type { Schedule } from '@/types/schedule';

const validFile: PartnerAvailabilityFile = {
  formatVersion: '1',
  exportedAt: '2026-03-02T10:00:00Z',
  versionType: 'template',
  versionName: 'Шаблон 2025–2026',
  slots: {
    'Иванова Т.С.': [
      { day: 'Пн', lesson: 1 },
      { day: 'Ср', lesson: 3 },
    ],
    'Козлова М.И.': [
      { day: 'Вт', lesson: 2 },
    ],
  },
};

const validJson = JSON.stringify(validFile);

const sampleSavedSchedule: Schedule = {
  '5а': {
    'Пн': {
      1: { lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Математика', teacher: 'Иванова Т.С.', room: '101' }] },
    },
  },
};

describe('partnerStore', () => {
  beforeEach(() => {
    usePartnerStore.setState({
      partnerData: null,
      matchedTeachers: new Set(),
      partnerBusySet: new Set(),
      savedPartnerSchedule: null,
    });
    vi.clearAllMocks();
    vi.mocked(partnerFilesMock.getPartnerFileJson).mockResolvedValue(null);
    vi.mocked(partnerFilesMock.getSavedPartnerScheduleJson).mockResolvedValue(null);
  });

  describe('loadPartnerFile', () => {
    it('populates state after loading', async () => {
      const ourTeachers = ['Иванова Т.С.', 'Петрова А.П.'];
      await usePartnerStore.getState().loadPartnerFile(validJson, ourTeachers);

      const state = usePartnerStore.getState();
      expect(state.partnerData).not.toBeNull();
      expect(state.partnerData?.versionName).toBe('Шаблон 2025–2026');
      expect(state.matchedTeachers.size).toBe(1);
      expect(state.matchedTeachers.has('Иванова Т.С.')).toBe(true);
    });

    it('saves JSON and savedPartnerScheduleJson to IDB', async () => {
      await usePartnerStore.getState().loadPartnerFile(validJson, ['Иванова Т.С.'], sampleSavedSchedule);
      expect(partnerFilesMock.savePartnerFileToDB).toHaveBeenCalledWith(
        validJson,
        JSON.stringify(sampleSavedSchedule)
      );
    });

    it('saves undefined savedJson when no savedSchedule provided', async () => {
      await usePartnerStore.getState().loadPartnerFile(validJson, ['Иванова Т.С.']);
      expect(partnerFilesMock.savePartnerFileToDB).toHaveBeenCalledWith(validJson, undefined);
    });

    it('stores savedPartnerSchedule in state', async () => {
      await usePartnerStore.getState().loadPartnerFile(validJson, ['Иванова Т.С.'], sampleSavedSchedule);
      expect(usePartnerStore.getState().savedPartnerSchedule).toEqual(sampleSavedSchedule);
    });

    it('preserves existing savedPartnerSchedule on "Обновить" (second load)', async () => {
      // First load — sets the restore point
      await usePartnerStore.getState().loadPartnerFile(validJson, ['Иванова Т.С.'], sampleSavedSchedule);

      // Second load ("Обновить") — provides different schedule, but original must be kept
      const newSchedule: Schedule = { '6б': {} };
      await usePartnerStore.getState().loadPartnerFile(validJson, ['Иванова Т.С.'], newSchedule);

      // Original restore point is preserved
      expect(usePartnerStore.getState().savedPartnerSchedule).toEqual(sampleSavedSchedule);
    });

    it('throws on invalid JSON', async () => {
      await expect(
        usePartnerStore.getState().loadPartnerFile('not json', ['Иванова Т.С.'])
      ).rejects.toThrow();
    });
  });

  describe('isPartnerBusy', () => {
    it('returns true for matched teacher at busy slot', async () => {
      const ourTeachers = ['Иванова Т.С.'];
      await usePartnerStore.getState().loadPartnerFile(validJson, ourTeachers);

      expect(usePartnerStore.getState().isPartnerBusy('Иванова Т.С.', 'Пн', 1)).toBe(true);
      expect(usePartnerStore.getState().isPartnerBusy('Иванова Т.С.', 'Ср', 3)).toBe(true);
    });

    it('returns false for matched teacher at free slot', async () => {
      await usePartnerStore.getState().loadPartnerFile(validJson, ['Иванова Т.С.']);
      expect(usePartnerStore.getState().isPartnerBusy('Иванова Т.С.', 'Вт', 5)).toBe(false);
    });

    it('returns false for non-matched teacher even if slot exists in file', async () => {
      // Козлова is in partner file but not in our teachers
      await usePartnerStore.getState().loadPartnerFile(validJson, ['Иванова Т.С.']);
      expect(usePartnerStore.getState().isPartnerBusy('Козлова М.И.', 'Вт', 2)).toBe(false);
    });

    it('returns false when no partner data loaded', () => {
      expect(usePartnerStore.getState().isPartnerBusy('Иванова Т.С.', 'Пн', 1)).toBe(false);
    });
  });

  describe('clearPartnerFile', () => {
    it('resets state to null/empty', async () => {
      await usePartnerStore.getState().loadPartnerFile(validJson, ['Иванова Т.С.'], sampleSavedSchedule);
      await usePartnerStore.getState().clearPartnerFile();

      const state = usePartnerStore.getState();
      expect(state.partnerData).toBeNull();
      expect(state.matchedTeachers.size).toBe(0);
      expect(state.partnerBusySet.size).toBe(0);
      expect(state.savedPartnerSchedule).toBeNull();
    });

    it('returns the saved schedule for the caller to restore', async () => {
      await usePartnerStore.getState().loadPartnerFile(validJson, ['Иванова Т.С.'], sampleSavedSchedule);
      const returned = await usePartnerStore.getState().clearPartnerFile();
      expect(returned).toEqual(sampleSavedSchedule);
    });

    it('returns null when no saved schedule was stored', async () => {
      await usePartnerStore.getState().loadPartnerFile(validJson, ['Иванова Т.С.']);
      const returned = await usePartnerStore.getState().clearPartnerFile();
      expect(returned).toBeNull();
    });

    it('calls clearPartnerFileFromDB', async () => {
      await usePartnerStore.getState().clearPartnerFile();
      expect(partnerFilesMock.clearPartnerFileFromDB).toHaveBeenCalled();
    });
  });

  describe('initFromDb', () => {
    it('loads saved data and builds busy set', async () => {
      vi.mocked(partnerFilesMock.getPartnerFileJson).mockResolvedValue(validJson);
      await usePartnerStore.getState().initFromDb(['Иванова Т.С.']);

      const state = usePartnerStore.getState();
      expect(state.partnerData).not.toBeNull();
      expect(state.matchedTeachers.has('Иванова Т.С.')).toBe(true);
    });

    it('restores savedPartnerSchedule from IDB', async () => {
      vi.mocked(partnerFilesMock.getPartnerFileJson).mockResolvedValue(validJson);
      vi.mocked(partnerFilesMock.getSavedPartnerScheduleJson).mockResolvedValue(
        JSON.stringify(sampleSavedSchedule)
      );
      await usePartnerStore.getState().initFromDb(['Иванова Т.С.']);

      expect(usePartnerStore.getState().savedPartnerSchedule).toEqual(sampleSavedSchedule);
    });

    it('sets savedPartnerSchedule to null when IDB has no saved schedule', async () => {
      vi.mocked(partnerFilesMock.getPartnerFileJson).mockResolvedValue(validJson);
      vi.mocked(partnerFilesMock.getSavedPartnerScheduleJson).mockResolvedValue(null);
      await usePartnerStore.getState().initFromDb(['Иванова Т.С.']);

      expect(usePartnerStore.getState().savedPartnerSchedule).toBeNull();
    });

    it('stays null when no data saved', async () => {
      vi.mocked(partnerFilesMock.getPartnerFileJson).mockResolvedValue(null);
      await usePartnerStore.getState().initFromDb(['Иванова Т.С.']);

      expect(usePartnerStore.getState().partnerData).toBeNull();
    });

    it('does not crash when saved JSON is corrupt', async () => {
      vi.mocked(partnerFilesMock.getPartnerFileJson).mockResolvedValue('corrupt{data');
      await expect(
        usePartnerStore.getState().initFromDb(['Иванова Т.С.'])
      ).resolves.not.toThrow();
      expect(usePartnerStore.getState().partnerData).toBeNull();
    });
  });
});
