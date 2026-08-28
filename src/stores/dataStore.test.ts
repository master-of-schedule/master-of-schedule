/**
 * Tests for dataStore mutation actions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock import-export module used by loadYearSnapshot
vi.mock('@/db/import-export', () => ({
  parseExportData: vi.fn(),
}));

// Mock partnerStore to prevent IDB access during reloadData
vi.mock('./partnerStore', () => ({
  usePartnerStore: {
    getState: () => ({
      initFromDb: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock the database functions
vi.mock('@/db', () => ({
  getAllTeachers: vi.fn().mockResolvedValue([]),
  getAllRooms: vi.fn().mockResolvedValue([]),
  getAllClasses: vi.fn().mockResolvedValue([]),
  getAllGroups: vi.fn().mockResolvedValue([]),
  getAllLessonRequirements: vi.fn().mockResolvedValue([]),
  replaceAllData: vi.fn().mockResolvedValue(undefined),
  getSettings: vi.fn().mockResolvedValue({}),
  updateSettings: vi.fn().mockResolvedValue(undefined),
  addTeacher: vi.fn().mockResolvedValue('teacher-123'),
  updateTeacher: vi.fn().mockResolvedValue(undefined),
  deleteTeacher: vi.fn().mockResolvedValue(undefined),
  addRoom: vi.fn().mockResolvedValue('room-123'),
  updateRoom: vi.fn().mockResolvedValue(undefined),
  deleteRoom: vi.fn().mockResolvedValue(undefined),
  addGroup: vi.fn().mockResolvedValue(undefined),
  updateGroup: vi.fn().mockResolvedValue(undefined),
  deleteGroup: vi.fn().mockResolvedValue(undefined),
  addClass: vi.fn().mockResolvedValue(undefined),
  updateClass: vi.fn().mockResolvedValue(undefined),
  deleteClass: vi.fn().mockResolvedValue(undefined),
  addLessonRequirement: vi.fn().mockResolvedValue('req-123'),
  updateLessonRequirement: vi.fn().mockResolvedValue(undefined),
  deleteLessonRequirement: vi.fn().mockResolvedValue(undefined),
  findVersionsUsingSubject: vi.fn().mockResolvedValue([]),
  // Cascade functions
  cascadeTeacherRename: vi.fn().mockResolvedValue(undefined),
  cascadeRoomRename: vi.fn().mockResolvedValue(undefined),
  cascadeClassRename: vi.fn().mockResolvedValue(undefined),
  cascadeGroupRenameInVersions: vi.fn().mockResolvedValue(undefined),
  cascadeSubjectRename: vi.fn().mockResolvedValue(undefined),
}));

import { useDataStore } from './dataStore';
import * as db from '@/db';
import * as importExport from '@/db/import-export';

describe('dataStore mutations', () => {
  beforeEach(() => {
    // Reset store state
    useDataStore.setState({
      teachers: {},
      rooms: {},
      classes: [],
      groups: [],
      lessonRequirements: [],
      isLoading: false,
      isLoaded: true,
      error: null,
      customSubjects: [],
    });
    vi.mocked(db.findVersionsUsingSubject).mockResolvedValue([]);
    vi.clearAllMocks();
  });

  describe('Teacher mutations', () => {
    it('addTeacher adds teacher to store and database', async () => {
      const { addTeacher } = useDataStore.getState();

      const newTeacher = {
        name: 'Иванова Т.С.',
        subjects: ['Математика'],
        bans: {},
      };

      const id = await addTeacher(newTeacher);

      expect(id).toBe('teacher-123');
      expect(db.addTeacher).toHaveBeenCalledWith(newTeacher);

      const { teachers } = useDataStore.getState();
      expect(teachers['Иванова Т.С.']).toBeDefined();
      expect(teachers['Иванова Т.С.'].name).toBe('Иванова Т.С.');
    });

    it('updateTeacher updates teacher in store and database', async () => {
      // Set up initial state
      useDataStore.setState({
        teachers: {
          'Иванова Т.С.': {
            id: 'teacher-1',
            name: 'Иванова Т.С.',
            subjects: ['Математика'],
            bans: {},
          },
        },
      });

      const { updateTeacher } = useDataStore.getState();

      await updateTeacher('teacher-1', { subjects: ['Математика', 'Алгебра'] });

      expect(db.updateTeacher).toHaveBeenCalledWith('teacher-1', {
        subjects: ['Математика', 'Алгебра'],
      });

      const { teachers } = useDataStore.getState();
      expect(teachers['Иванова Т.С.'].subjects).toEqual(['Математика', 'Алгебра']);
    });

    it('updateTeacher handles name change correctly', async () => {
      useDataStore.setState({
        teachers: {
          'Иванова Т.С.': {
            id: 'teacher-1',
            name: 'Иванова Т.С.',
            subjects: ['Математика'],
            bans: {},
          },
        },
      });

      const { updateTeacher } = useDataStore.getState();

      await updateTeacher('teacher-1', { name: 'Петрова А.П.' });

      const { teachers } = useDataStore.getState();
      expect(teachers['Иванова Т.С.']).toBeUndefined();
      expect(teachers['Петрова А.П.']).toBeDefined();
      expect(teachers['Петрова А.П.'].name).toBe('Петрова А.П.');
    });

    it('deleteTeacher removes teacher from store and database', async () => {
      useDataStore.setState({
        teachers: {
          'Иванова Т.С.': {
            id: 'teacher-1',
            name: 'Иванова Т.С.',
            subjects: ['Математика'],
            bans: {},
          },
        },
      });

      const { deleteTeacher } = useDataStore.getState();

      await deleteTeacher('teacher-1');

      expect(db.deleteTeacher).toHaveBeenCalledWith('teacher-1');

      const { teachers } = useDataStore.getState();
      expect(teachers['Иванова Т.С.']).toBeUndefined();
      expect(Object.keys(teachers)).toHaveLength(0);
    });
  });

  describe('Room mutations', () => {
    it('addRoom adds room to store and database', async () => {
      const { addRoom } = useDataStore.getState();

      const newRoom = {
        fullName: '114 Математика',
        shortName: '-114-',
        capacity: 30,
      };

      const id = await addRoom(newRoom);

      expect(id).toBe('room-123');
      expect(db.addRoom).toHaveBeenCalledWith(newRoom);

      const { rooms } = useDataStore.getState();
      expect(rooms['-114-']).toBeDefined();
      expect(rooms['-114-'].fullName).toBe('114 Математика');
    });

    it('updateRoom updates room in store and database', async () => {
      useDataStore.setState({
        rooms: {
          '-114-': {
            id: 'room-1',
            fullName: '114 Математика',
            shortName: '-114-',
            capacity: 30,
          },
        },
      });

      const { updateRoom } = useDataStore.getState();

      await updateRoom('room-1', { capacity: 35 });

      expect(db.updateRoom).toHaveBeenCalledWith('room-1', { capacity: 35 });

      const { rooms } = useDataStore.getState();
      expect(rooms['-114-'].capacity).toBe(35);
    });

    it('updateRoom handles shortName change correctly', async () => {
      useDataStore.setState({
        rooms: {
          '-114-': {
            id: 'room-1',
            fullName: '114 Математика',
            shortName: '-114-',
            capacity: 30,
          },
        },
      });

      const { updateRoom } = useDataStore.getState();

      await updateRoom('room-1', { shortName: '-115-' });

      const { rooms } = useDataStore.getState();
      expect(rooms['-114-']).toBeUndefined();
      expect(rooms['-115-']).toBeDefined();
    });

    it('deleteRoom removes room from store and database', async () => {
      useDataStore.setState({
        rooms: {
          '-114-': {
            id: 'room-1',
            fullName: '114 Математика',
            shortName: '-114-',
            capacity: 30,
          },
        },
      });

      const { deleteRoom } = useDataStore.getState();

      await deleteRoom('room-1');

      expect(db.deleteRoom).toHaveBeenCalledWith('room-1');

      const { rooms } = useDataStore.getState();
      expect(Object.keys(rooms)).toHaveLength(0);
    });
  });

  describe('Requirement mutations', () => {
    it('addRequirement adds requirement to store and database', async () => {
      const { addRequirement } = useDataStore.getState();

      const newReq = {
        type: 'class' as const,
        classOrGroup: '10а',
        subject: 'Математика',
        teacher: 'Иванова Т.С.',
        countPerWeek: 5,
      };

      const id = await addRequirement(newReq);

      expect(id).toBe('req-123');
      expect(db.addLessonRequirement).toHaveBeenCalledWith(newReq);

      const { lessonRequirements } = useDataStore.getState();
      expect(lessonRequirements).toHaveLength(1);
      expect(lessonRequirements[0].subject).toBe('Математика');
    });

    it('updateRequirement updates requirement in store and database', async () => {
      useDataStore.setState({
        lessonRequirements: [
          {
            id: 'req-1',
            type: 'class',
            classOrGroup: '10а',
            subject: 'Математика',
            teacher: 'Иванова Т.С.',
            countPerWeek: 5,
          },
        ],
      });

      const { updateRequirement } = useDataStore.getState();

      await updateRequirement('req-1', { countPerWeek: 6 });

      expect(db.updateLessonRequirement).toHaveBeenCalledWith('req-1', { countPerWeek: 6 });

      const { lessonRequirements } = useDataStore.getState();
      expect(lessonRequirements[0].countPerWeek).toBe(6);
    });

    it('deleteRequirement removes requirement from store and database', async () => {
      useDataStore.setState({
        lessonRequirements: [
          {
            id: 'req-1',
            type: 'class',
            classOrGroup: '10а',
            subject: 'Математика',
            teacher: 'Иванова Т.С.',
            countPerWeek: 5,
          },
        ],
      });

      const { deleteRequirement } = useDataStore.getState();

      await deleteRequirement('req-1');

      expect(db.deleteLessonRequirement).toHaveBeenCalledWith('req-1');

      const { lessonRequirements } = useDataStore.getState();
      expect(lessonRequirements).toHaveLength(0);
    });
  });

  describe('updateGroup — rename propagation (Z15-7)', () => {
    beforeEach(() => {
      useDataStore.setState({
        groups: [
          { id: 'g-1', name: '10а(д)', className: '10а', index: '(д)', parallelGroup: '10а(м)' },
          { id: 'g-2', name: '10а(м)', className: '10а', index: '(м)', parallelGroup: '10а(д)' },
        ],
        lessonRequirements: [
          { id: 'r-1', type: 'group', classOrGroup: '10а(д)', subject: 'Английский', teacher: 'Иванова Т.С.', countPerWeek: 3, className: '10а', parallelGroup: '10а(м)' },
          { id: 'r-2', type: 'group', classOrGroup: '10а(м)', subject: 'Английский', teacher: 'Петрова А.П.', countPerWeek: 3, className: '10а', parallelGroup: '10а(д)' },
          { id: 'r-3', type: 'class', classOrGroup: '10а', subject: 'Математика', teacher: 'Козлов И.И.', countPerWeek: 5, className: '10а' },
        ],
        teachers: {},
        rooms: {},
        classes: [],
        isLoading: false,
        isLoaded: true,
        error: null,
      });
    });

    it('propagates rename to lessonRequirements.classOrGroup', async () => {
      const { updateGroup } = useDataStore.getState();
      await updateGroup('g-1', { name: '10а(В.Е.)', index: '(В.Е.)' });

      const { lessonRequirements } = useDataStore.getState();
      const renamed = lessonRequirements.find(r => r.id === 'r-1');
      expect(renamed?.classOrGroup).toBe('10а(В.Е.)');
    });

    it('propagates rename to parallelGroup references in other requirements', async () => {
      const { updateGroup } = useDataStore.getState();
      await updateGroup('g-1', { name: '10а(В.Е.)', index: '(В.Е.)' });

      const { lessonRequirements } = useDataStore.getState();
      const sibling = lessonRequirements.find(r => r.id === 'r-2');
      expect(sibling?.parallelGroup).toBe('10а(В.Е.)');
    });

    it('updates parallelGroup reference in sibling group definition', async () => {
      const { updateGroup } = useDataStore.getState();
      await updateGroup('g-1', { name: '10а(В.Е.)', index: '(В.Е.)' });

      const { groups } = useDataStore.getState();
      const sibling = groups.find(g => g.id === 'g-2');
      expect(sibling?.parallelGroup).toBe('10а(В.Е.)');
    });

    it('does not affect unrelated requirements', async () => {
      const { updateGroup } = useDataStore.getState();
      await updateGroup('g-1', { name: '10а(В.Е.)', index: '(В.Е.)' });

      const { lessonRequirements } = useDataStore.getState();
      const unrelated = lessonRequirements.find(r => r.id === 'r-3');
      expect(unrelated?.classOrGroup).toBe('10а');
    });
  });

  // ─── DI-1: Uniqueness guards ────────────────────────────────────────────────

  describe('DI-1: Teacher uniqueness + cascade rename', () => {
    beforeEach(() => {
      useDataStore.setState({
        teachers: {
          'Иванова Т.С.': { id: 'teacher-1', name: 'Иванова Т.С.', subjects: [], bans: {} },
          'Петрова А.П.': { id: 'teacher-2', name: 'Петрова А.П.', subjects: [], bans: {} },
        },
        lessonRequirements: [
          { id: 'r-1', type: 'class', classOrGroup: '10а', subject: 'Математика', teacher: 'Иванова Т.С.', countPerWeek: 5 },
          { id: 'r-2', type: 'class', classOrGroup: '10б', subject: 'Русский', teacher: 'Петрова А.П.', countPerWeek: 3, teacher2: 'Иванова Т.С.' },
        ],
      });
    });

    it('addTeacher throws DUPLICATE_NAME for existing name', async () => {
      const { addTeacher } = useDataStore.getState();
      await expect(addTeacher({ name: 'Иванова Т.С.', subjects: [], bans: {} }))
        .rejects.toThrow('DUPLICATE_NAME');
    });

    it('addTeacher succeeds for unique name', async () => {
      const { addTeacher } = useDataStore.getState();
      await expect(addTeacher({ name: 'Козлов И.И.', subjects: [], bans: {} }))
        .resolves.toBe('teacher-123');
    });

    it('updateTeacher throws DUPLICATE_NAME when name conflicts with another teacher', async () => {
      const { updateTeacher } = useDataStore.getState();
      await expect(updateTeacher('teacher-1', { name: 'Петрова А.П.' }))
        .rejects.toThrow('DUPLICATE_NAME');
    });

    it('updateTeacher allows updating own name (no conflict with self)', async () => {
      const { updateTeacher } = useDataStore.getState();
      // Updating same teacher with same name — should not throw
      await expect(updateTeacher('teacher-1', { name: 'Иванова Т.С.' }))
        .resolves.toBeUndefined();
    });

    it('updateTeacher calls cascadeTeacherRename on name change', async () => {
      const { updateTeacher } = useDataStore.getState();
      await updateTeacher('teacher-1', { name: 'Иванова-Смит Т.С.' });
      expect(db.cascadeTeacherRename).toHaveBeenCalledWith('Иванова Т.С.', 'Иванова-Смит Т.С.');
    });

    it('updateTeacher re-keys teachers map on name change', async () => {
      const { updateTeacher } = useDataStore.getState();
      await updateTeacher('teacher-1', { name: 'Иванова-Смит Т.С.' });
      const { teachers } = useDataStore.getState();
      expect(teachers['Иванова Т.С.']).toBeUndefined();
      expect(teachers['Иванова-Смит Т.С.']).toBeDefined();
    });

    it('updateTeacher updates in-memory lessonRequirements.teacher on name change', async () => {
      const { updateTeacher } = useDataStore.getState();
      await updateTeacher('teacher-1', { name: 'Иванова-Смит Т.С.' });
      const { lessonRequirements } = useDataStore.getState();
      expect(lessonRequirements.find(r => r.id === 'r-1')?.teacher).toBe('Иванова-Смит Т.С.');
    });

    it('updateTeacher updates in-memory lessonRequirements.teacher2 on name change', async () => {
      const { updateTeacher } = useDataStore.getState();
      await updateTeacher('teacher-1', { name: 'Иванова-Смит Т.С.' });
      const { lessonRequirements } = useDataStore.getState();
      expect(lessonRequirements.find(r => r.id === 'r-2')?.teacher2).toBe('Иванова-Смит Т.С.');
    });

    it('updateTeacher does NOT call cascadeTeacherRename when name unchanged', async () => {
      const { updateTeacher } = useDataStore.getState();
      await updateTeacher('teacher-1', { subjects: ['Математика'] }); // no name change
      expect(db.cascadeTeacherRename).not.toHaveBeenCalled();
    });
  });

  describe('DI-1: Room uniqueness + cascade rename', () => {
    beforeEach(() => {
      useDataStore.setState({
        rooms: {
          '-114-': { id: 'room-1', fullName: '114 Математика', shortName: '-114-' },
          '-228-': { id: 'room-2', fullName: '228 История', shortName: '-228-' },
        },
        teachers: {
          'Иванова Т.С.': { id: 't-1', name: 'Иванова Т.С.', subjects: [], bans: {}, defaultRoom: '-114-' },
        },
      });
    });

    it('addRoom throws DUPLICATE_SHORTNAME for existing shortName', async () => {
      const { addRoom } = useDataStore.getState();
      await expect(addRoom({ fullName: 'Другой кабинет', shortName: '-114-' }))
        .rejects.toThrow('DUPLICATE_SHORTNAME');
    });

    it('addRoom succeeds for unique shortName', async () => {
      const { addRoom } = useDataStore.getState();
      await expect(addRoom({ fullName: 'Спортзал', shortName: '-спорт-' }))
        .resolves.toBe('room-123');
    });

    it('updateRoom throws DUPLICATE_SHORTNAME when shortName conflicts', async () => {
      const { updateRoom } = useDataStore.getState();
      await expect(updateRoom('room-1', { shortName: '-228-' }))
        .rejects.toThrow('DUPLICATE_SHORTNAME');
    });

    it('updateRoom calls cascadeRoomRename on shortName change', async () => {
      const { updateRoom } = useDataStore.getState();
      await updateRoom('room-1', { shortName: '-114б-' });
      expect(db.cascadeRoomRename).toHaveBeenCalledWith('-114-', '-114б-');
    });

    it('updateRoom updates in-memory teachers.defaultRoom on shortName change', async () => {
      const { updateRoom } = useDataStore.getState();
      await updateRoom('room-1', { shortName: '-114б-' });
      const { teachers } = useDataStore.getState();
      expect(teachers['Иванова Т.С.'].defaultRoom).toBe('-114б-');
    });

    it('updateRoom does NOT call cascadeRoomRename when shortName unchanged', async () => {
      const { updateRoom } = useDataStore.getState();
      await updateRoom('room-1', { fullName: 'Новое название' }); // no shortName change
      expect(db.cascadeRoomRename).not.toHaveBeenCalled();
    });
  });

  describe('DI-1: Class uniqueness + cascade rename', () => {
    beforeEach(() => {
      useDataStore.setState({
        classes: [
          { id: 'c-1', name: '10а' },
          { id: 'c-2', name: '10б' },
        ],
        groups: [
          { id: 'g-1', name: '10а(д)', className: '10а', index: '(д)' },
        ],
        lessonRequirements: [
          { id: 'r-1', type: 'class', classOrGroup: '10а', subject: 'Математика', teacher: 'Иванова Т.С.', countPerWeek: 5 },
          { id: 'r-2', type: 'group', classOrGroup: '10а(д)', subject: 'Английский', teacher: 'Петрова А.П.', countPerWeek: 3, className: '10а' },
        ],
      });
    });

    it('addClass throws DUPLICATE_NAME for existing class name', async () => {
      const { addClass } = useDataStore.getState();
      await expect(addClass({ name: '10а' }))
        .rejects.toThrow('DUPLICATE_NAME');
    });

    it('addClass succeeds for unique name', async () => {
      const { addClass } = useDataStore.getState();
      await expect(addClass({ name: '10в' })).resolves.toMatch(/^class-/);
    });

    it('updateClass throws DUPLICATE_NAME when name conflicts', async () => {
      const { updateClass } = useDataStore.getState();
      await expect(updateClass('c-1', { name: '10б' }))
        .rejects.toThrow('DUPLICATE_NAME');
    });

    it('updateClass calls cascadeClassRename on name change', async () => {
      const { updateClass } = useDataStore.getState();
      await updateClass('c-1', { name: '10в' });
      expect(db.cascadeClassRename).toHaveBeenCalledWith('10а', '10в');
    });

    it('updateClass updates in-memory lessonRequirements.classOrGroup for type=class', async () => {
      const { updateClass } = useDataStore.getState();
      await updateClass('c-1', { name: '10в' });
      const { lessonRequirements } = useDataStore.getState();
      expect(lessonRequirements.find(r => r.id === 'r-1')?.classOrGroup).toBe('10в');
    });

    it('updateClass updates in-memory lessonRequirements.className for type=group', async () => {
      const { updateClass } = useDataStore.getState();
      await updateClass('c-1', { name: '10в' });
      const { lessonRequirements } = useDataStore.getState();
      expect(lessonRequirements.find(r => r.id === 'r-2')?.className).toBe('10в');
    });

    it('updateClass updates in-memory groups.className', async () => {
      const { updateClass } = useDataStore.getState();
      await updateClass('c-1', { name: '10в' });
      const { groups } = useDataStore.getState();
      expect(groups.find(g => g.id === 'g-1')?.className).toBe('10в');
    });

    it('updateClass does NOT call cascadeClassRename when name unchanged', async () => {
      const { updateClass } = useDataStore.getState();
      await updateClass('c-1', { studentCount: 30 }); // no name change
      expect(db.cascadeClassRename).not.toHaveBeenCalled();
    });
  });

  describe('DI-1: Group uniqueness + version cascade', () => {
    beforeEach(() => {
      useDataStore.setState({
        groups: [
          { id: 'g-1', name: '10а(д)', className: '10а', index: '(д)', parallelGroup: '10а(м)' },
          { id: 'g-2', name: '10а(м)', className: '10а', index: '(м)', parallelGroup: '10а(д)' },
        ],
        lessonRequirements: [],
      });
    });

    it('addGroup throws DUPLICATE_NAME for existing group name', async () => {
      const { addGroup } = useDataStore.getState();
      await expect(addGroup({ name: '10а(д)', className: '10а', index: '(д)' }))
        .rejects.toThrow('DUPLICATE_NAME');
    });

    it('addGroup succeeds for unique name', async () => {
      const { addGroup } = useDataStore.getState();
      await expect(addGroup({ name: '10б(д)', className: '10б', index: '(д)' }))
        .resolves.toMatch(/^group-/);
    });

    it('updateGroup throws DUPLICATE_NAME when name conflicts', async () => {
      const { updateGroup } = useDataStore.getState();
      await expect(updateGroup('g-1', { name: '10а(м)', index: '(м)' }))
        .rejects.toThrow('DUPLICATE_NAME');
    });

    it('updateGroup calls cascadeGroupRenameInVersions on name change', async () => {
      const { updateGroup } = useDataStore.getState();
      await updateGroup('g-1', { name: '10а(дев)', index: '(дев)' });
      expect(db.cascadeGroupRenameInVersions).toHaveBeenCalledWith(
        '10а(д)', '10а(дев)', '10а', '(д)', '(дев)'
      );
    });

    it('updateGroup does NOT call cascadeGroupRenameInVersions when name unchanged', async () => {
      const { updateGroup } = useDataStore.getState();
      await updateGroup('g-1', { parallelGroup: undefined }); // no name change
      expect(db.cascadeGroupRenameInVersions).not.toHaveBeenCalled();
    });
  });

  describe('Z17-NYW: loadYearSnapshot + exitReadOnlyYear', () => {
    const mockExportData = {
      version: '3.6',
      exportedAt: '2025-01-01T00:00:00.000Z',
      teachers: [
        { id: 't-1', name: 'Иванова Т.С.', subjects: [], bans: {} },
        { id: 't-2', name: 'Петрова А.П.', subjects: [], bans: {} },
      ],
      rooms: [
        { id: 'r-1', fullName: '114 Математика', shortName: '-114-' },
      ],
      classes: [{ id: 'c-1', name: '10а' }],
      groups: [],
      lessonRequirements: [
        { id: 'req-1', type: 'class', classOrGroup: '10а', subject: 'Математика', teacher: 'Иванова Т.С.', countPerWeek: 5 },
      ],
      scheduleVersions: [
        { id: 'v-1', type: 'template', name: 'Основное', schedule: {}, createdAt: new Date() },
      ],
    };

    beforeEach(() => {
      vi.mocked(importExport.parseExportData).mockReturnValue(mockExportData as never);
      // Reset to normal state
      useDataStore.setState({
        teachers: {},
        rooms: {},
        classes: [],
        groups: [],
        lessonRequirements: [],
        isReadOnlyYear: false,
        readOnlyYearLabel: null,
        readOnlyVersions: [],
        isLoading: false,
        isLoaded: true,
        error: null,
      });
    });

    it('loadYearSnapshot sets isReadOnlyYear = true', () => {
      const { loadYearSnapshot } = useDataStore.getState();
      loadYearSnapshot('2024-2025', '{}');
      expect(useDataStore.getState().isReadOnlyYear).toBe(true);
    });

    it('loadYearSnapshot sets readOnlyYearLabel', () => {
      const { loadYearSnapshot } = useDataStore.getState();
      loadYearSnapshot('2024-2025', '{}');
      expect(useDataStore.getState().readOnlyYearLabel).toBe('2024-2025');
    });

    it('loadYearSnapshot populates entities from parsed export', () => {
      const { loadYearSnapshot } = useDataStore.getState();
      loadYearSnapshot('2024-2025', '{}');
      const state = useDataStore.getState();
      expect(Object.keys(state.teachers)).toEqual(['Иванова Т.С.', 'Петрова А.П.']);
      expect(Object.keys(state.rooms)).toEqual(['-114-']);
      expect(state.classes).toHaveLength(1);
      expect(state.lessonRequirements).toHaveLength(1);
    });

    it('loadYearSnapshot populates readOnlyVersions', () => {
      const { loadYearSnapshot } = useDataStore.getState();
      loadYearSnapshot('2024-2025', '{}');
      expect(useDataStore.getState().readOnlyVersions).toHaveLength(1);
      expect(useDataStore.getState().readOnlyVersions[0].id).toBe('v-1');
    });

    it('loadYearSnapshot with snapshot that has no versions => readOnlyVersions = []', () => {
      vi.mocked(importExport.parseExportData).mockReturnValue({
        ...mockExportData,
        scheduleVersions: undefined,
      } as never);
      const { loadYearSnapshot } = useDataStore.getState();
      loadYearSnapshot('2024-2025', '{}');
      expect(useDataStore.getState().readOnlyVersions).toEqual([]);
    });

    it('exitReadOnlyYear resets isReadOnlyYear to false', async () => {
      useDataStore.setState({
        isReadOnlyYear: true,
        readOnlyYearLabel: '2024-2025',
        readOnlyVersions: [{ id: 'v-1' } as never],
        isLoaded: true,
      });
      const { exitReadOnlyYear } = useDataStore.getState();
      await exitReadOnlyYear();
      const state = useDataStore.getState();
      expect(state.isReadOnlyYear).toBe(false);
      expect(state.readOnlyYearLabel).toBeNull();
      expect(state.readOnlyVersions).toEqual([]);
    });
  });

  describe('updateSchoolWeek (Z16-9)', () => {
    it('updates daysPerWeek and lessonsPerDay in state and DB', async () => {
      useDataStore.setState({ daysPerWeek: 5, lessonsPerDay: 8 });
      const { updateSchoolWeek } = useDataStore.getState();

      await updateSchoolWeek(6, 7);

      expect(db.updateSettings).toHaveBeenCalledWith({ daysPerWeek: 6, lessonsPerDay: 7 });
      const state = useDataStore.getState();
      expect(state.daysPerWeek).toBe(6);
      expect(state.lessonsPerDay).toBe(7);
    });

    it('does not affect other state fields when updating school week', async () => {
      useDataStore.setState({
        daysPerWeek: 5,
        lessonsPerDay: 8,
        customSubjects: ['Химия'],
        gapExcludedClasses: ['1а'],
      });
      const { updateSchoolWeek } = useDataStore.getState();

      await updateSchoolWeek(6, 6);

      const state = useDataStore.getState();
      expect(state.customSubjects).toEqual(['Химия']);
      expect(state.gapExcludedClasses).toEqual(['1а']);
    });
  });

  describe('renameSubject — cascade rename', () => {
    beforeEach(() => {
      useDataStore.setState({
        teachers: {
          'Иванова Т.С.': { id: 't-1', name: 'Иванова Т.С.', subjects: ['Математика', 'Алгебра'], bans: {} },
          'Петрова А.П.': { id: 't-2', name: 'Петрова А.П.', subjects: ['Физика'], bans: {} },
        },
        lessonRequirements: [
          { id: 'r-1', type: 'class', classOrGroup: '10а', subject: 'Математика', teacher: 'Иванова Т.С.', countPerWeek: 5 },
          { id: 'r-2', type: 'class', classOrGroup: '10б', subject: 'Алгебра', teacher: 'Иванова Т.С.', countPerWeek: 3 },
          { id: 'r-3', type: 'class', classOrGroup: '10а', subject: 'Физика', teacher: 'Петрова А.П.', countPerWeek: 2 },
        ],
        customSubjects: [],
      });
    });

    it('renames subject in matching teacher subjects[]', async () => {
      const { renameSubject } = useDataStore.getState();
      await renameSubject('Математика', 'Математика и информатика');
      const { teachers } = useDataStore.getState();
      expect(teachers['Иванова Т.С.'].subjects).toContain('Математика и информатика');
      expect(teachers['Иванова Т.С.'].subjects).not.toContain('Математика');
    });

    it('does not touch teacher subjects that do not include the old name', async () => {
      const { renameSubject } = useDataStore.getState();
      await renameSubject('Математика', 'Матан');
      const { teachers } = useDataStore.getState();
      expect(teachers['Петрова А.П.'].subjects).toEqual(['Физика']);
      expect(teachers['Иванова Т.С.'].subjects).toContain('Алгебра');
    });

    it('renames subject in lessonRequirements', async () => {
      const { renameSubject } = useDataStore.getState();
      await renameSubject('Математика', 'Матан');
      const { lessonRequirements } = useDataStore.getState();
      const renamed = lessonRequirements.find(r => r.id === 'r-1');
      expect(renamed?.subject).toBe('Матан');
    });

    it('does not rename unrelated requirements', async () => {
      const { renameSubject } = useDataStore.getState();
      await renameSubject('Математика', 'Матан');
      const { lessonRequirements } = useDataStore.getState();
      expect(lessonRequirements.find(r => r.id === 'r-2')?.subject).toBe('Алгебра');
      expect(lessonRequirements.find(r => r.id === 'r-3')?.subject).toBe('Физика');
    });

    it('calls cascadeSubjectRename for version blobs', async () => {
      const { renameSubject } = useDataStore.getState();
      await renameSubject('Математика', 'Матан');
      expect(db.cascadeSubjectRename).toHaveBeenCalledWith('Математика', 'Матан');
    });

    it('trims the new name', async () => {
      const { renameSubject } = useDataStore.getState();
      await renameSubject('Математика', '  Матан  ');
      const { lessonRequirements } = useDataStore.getState();
      expect(lessonRequirements.find(r => r.id === 'r-1')?.subject).toBe('Матан');
    });

    it('does nothing when new name equals old name', async () => {
      const { renameSubject } = useDataStore.getState();
      await renameSubject('Математика', 'Математика');
      expect(db.cascadeSubjectRename).not.toHaveBeenCalled();
    });

    it('renames subject in customSubjects if present', async () => {
      useDataStore.setState({ customSubjects: ['Математика', 'Физика'] });
      const { renameSubject } = useDataStore.getState();
      await renameSubject('Математика', 'Матан');
      const { customSubjects } = useDataStore.getState();
      expect(customSubjects).toContain('Матан');
      expect(customSubjects).not.toContain('Математика');
      expect(customSubjects).toContain('Физика');
    });
  });

  describe('deleteSubject', () => {
    beforeEach(() => {
      useDataStore.setState({
        teachers: {
          'Иванова Т.С.': { id: 't-1', name: 'Иванова Т.С.', subjects: ['Математика', 'Алгебра'], bans: {} },
          'Петрова А.П.': { id: 't-2', name: 'Петрова А.П.', subjects: ['Математика'], bans: {} },
        },
        lessonRequirements: [],
        customSubjects: ['Математика', 'Физика'],
      });
    });

    it('removes the subject from teachers and customSubjects', async () => {
      const { deleteSubject } = useDataStore.getState();

      await deleteSubject('Математика');

      expect(db.updateTeacher).toHaveBeenCalledWith('t-1', { subjects: ['Алгебра'] });
      expect(db.updateTeacher).toHaveBeenCalledWith('t-2', { subjects: [] });
      expect(db.updateSettings).toHaveBeenCalledWith({ customSubjects: ['Физика'] });

      const state = useDataStore.getState();
      expect(state.teachers['Иванова Т.С.'].subjects).toEqual(['Алгебра']);
      expect(state.teachers['Петрова А.П.'].subjects).toEqual([]);
      expect(state.customSubjects).toEqual(['Физика']);
    });

    it('blocks deletion when the subject is used in lesson requirements', async () => {
      useDataStore.setState({
        lessonRequirements: [
          { id: 'r-1', type: 'class', classOrGroup: '10а', subject: 'Математика', teacher: 'Иванова Т.С.', countPerWeek: 5 },
        ],
      });
      const { deleteSubject } = useDataStore.getState();

      await expect(deleteSubject('Математика')).rejects.toThrow('SUBJECT_USED_IN_REQUIREMENTS');

      expect(db.updateTeacher).not.toHaveBeenCalled();
      expect(db.updateSettings).not.toHaveBeenCalled();
    });

    it('blocks deletion when the subject is used in saved schedules', async () => {
      vi.mocked(db.findVersionsUsingSubject).mockResolvedValue([
        {
          id: 'v-1',
          name: 'Техническое',
          type: 'technical',
          createdAt: new Date('2026-01-01'),
          isActiveTemplate: false,
        },
      ]);
      const { deleteSubject } = useDataStore.getState();

      await expect(deleteSubject('Математика')).rejects.toThrow('SUBJECT_USED_IN_VERSIONS');

      expect(db.updateTeacher).not.toHaveBeenCalled();
      expect(db.updateSettings).not.toHaveBeenCalled();
    });
  });
});
