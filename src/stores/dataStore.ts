/**
 * Data Store - Reference data (Teachers, Rooms, Classes, Groups, Lessons)
 * This data is loaded from IndexedDB and cached in memory
 */

import { create } from 'zustand';
import type {
  Teacher,
  Room,
  SchoolClass,
  Group,
  LessonRequirement,
  Version,
} from '@/types';
import { parseExportData } from '@/db/import-export';
import {
  getAllTeachers,
  getAllRooms,
  getAllClasses,
  getAllGroups,
  getAllLessonRequirements,
  replaceAllData,
  getSettings,
  updateSettings,
  addTeacher as dbAddTeacher,
  updateTeacher as dbUpdateTeacher,
  deleteTeacher as dbDeleteTeacher,
  addRoom as dbAddRoom,
  updateRoom as dbUpdateRoom,
  deleteRoom as dbDeleteRoom,
  addClass as dbAddClass,
  updateClass as dbUpdateClass,
  deleteClass as dbDeleteClass,
  addLessonRequirement as dbAddRequirement,
  updateLessonRequirement as dbUpdateRequirement,
  deleteLessonRequirement as dbDeleteRequirement,
  addGroup as dbAddGroup,
  updateGroup as dbUpdateGroup,
  deleteGroup as dbDeleteGroup,
  updateLessonRequirement,
  cascadeTeacherRename,
  cascadeRoomRename,
  cascadeClassRename,
  cascadeGroupRenameInVersions,
  cascadeSubjectRename,
} from '@/db';
import { usePartnerStore } from './partnerStore';
import { indexBy } from '@/utils/indexBy';

/** Removes the entry with the given id from a Record<string, T> keyed by a display name. */
function deleteFromMapById<T extends { id: string }>(
  map: Record<string, T>,
  id: string
): Record<string, T> {
  const updated = { ...map };
  for (const [key, val] of Object.entries(updated)) {
    if (val.id === id) {
      delete updated[key];
      break;
    }
  }
  return updated;
}

interface DataState {
  // Data
  teachers: Record<string, Teacher>;
  rooms: Record<string, Room>;
  classes: SchoolClass[];
  groups: Group[];
  lessonRequirements: LessonRequirement[];
  customSubjects: string[];
  gapExcludedClasses: string[];
  daysPerWeek: number;
  lessonsPerDay: number;

  // Loading state
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;

  // Read-only past year viewing mode
  isReadOnlyYear: boolean;
  readOnlyYearLabel: string | null;
  readOnlyVersions: Version[];

  // Actions
  loadData: () => Promise<void>;
  reloadData: () => Promise<void>;
  setData: (data: {
    teachers?: Teacher[];
    rooms?: Room[];
    classes?: SchoolClass[];
    groups?: Group[];
    lessonRequirements?: LessonRequirement[];
  }) => void;
  importData: (data: {
    teachers?: Teacher[];
    rooms?: Room[];
    classes?: SchoolClass[];
    groups?: Group[];
    lessonRequirements?: LessonRequirement[];
  }) => Promise<void>;

  // Selectors (for convenience)
  getTeacher: (name: string) => Teacher | undefined;
  getRoom: (shortName: string) => Room | undefined;
  getClassNames: () => string[];
  getLessonsForClass: (className: string) => LessonRequirement[];

  // Mutation actions - Teachers
  addTeacher: (teacher: Omit<Teacher, 'id'>) => Promise<string>;
  updateTeacher: (id: string, data: Partial<Teacher>) => Promise<void>;
  deleteTeacher: (id: string) => Promise<void>;

  // Mutation actions - Rooms
  addRoom: (room: Omit<Room, 'id'>) => Promise<string>;
  updateRoom: (id: string, data: Partial<Room>) => Promise<void>;
  deleteRoom: (id: string) => Promise<void>;

  // Mutation actions - Classes
  addClass: (cls: Omit<SchoolClass, 'id'>) => Promise<string>;
  updateClass: (id: string, data: Partial<SchoolClass>) => Promise<void>;
  deleteClass: (id: string) => Promise<void>;

  // Mutation actions - Groups
  addGroup: (group: Omit<Group, 'id'>) => Promise<string>;
  /**
   * Update a group. If `name` changes, propagates the rename to all
   * lessonRequirements (classOrGroup and parallelGroup fields).
   */
  updateGroup: (id: string, data: Partial<Omit<Group, 'id'>>) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;

  // Mutation actions - Lesson Requirements
  addRequirement: (req: Omit<LessonRequirement, 'id'>) => Promise<string>;
  updateRequirement: (id: string, data: Partial<LessonRequirement>) => Promise<void>;
  deleteRequirement: (id: string) => Promise<void>;

  // Mutation actions - Subjects
  /**
   * Rename a subject everywhere: Teacher.subjects[], LessonRequirement.subject,
   * and all scheduled/temp lessons in version blobs.
   */
  renameSubject: (oldName: string, newName: string) => Promise<void>;
  addCustomSubject: (subject: string) => Promise<void>;

  // Mutation actions - Gap Exclusions
  setGapExcludedClasses: (classes: string[]) => Promise<void>;

  // Mutation actions - School Week
  updateSchoolWeek: (daysPerWeek: number, lessonsPerDay: number) => Promise<void>;

  // Read-only year actions
  loadYearSnapshot: (yearLabel: string, exportJson: string) => void;
  exitReadOnlyYear: () => Promise<void>;
}

export const useDataStore = create<DataState>((set, get) => ({
  // Initial state
  teachers: {},
  rooms: {},
  classes: [],
  groups: [],
  lessonRequirements: [],
  customSubjects: [],
  gapExcludedClasses: [],
  daysPerWeek: 5,
  lessonsPerDay: 8,
  isLoading: false,
  isLoaded: false,
  error: null,
  isReadOnlyYear: false,
  readOnlyYearLabel: null,
  readOnlyVersions: [],

  // Load data from IndexedDB
  loadData: async () => {
    if (get().isLoaded || get().isLoading) return;

    set({ isLoading: true, error: null });

    try {
      const [teachers, rooms, classes, groups, lessonRequirements, settings] = await Promise.all([
        getAllTeachers(),
        getAllRooms(),
        getAllClasses(),
        getAllGroups(),
        getAllLessonRequirements(),
        getSettings(),
      ]);

      // Convert arrays to lookup maps for teachers and rooms
      const teachersMap = indexBy(teachers, 'name');
      const roomsMap = indexBy(rooms, 'shortName');

      set({
        teachers: teachersMap,
        rooms: roomsMap,
        classes,
        groups,
        lessonRequirements,
        customSubjects: settings.customSubjects ?? [],
        gapExcludedClasses: settings.gapExcludedClasses ?? [],
        daysPerWeek: settings.daysPerWeek ?? 5,
        lessonsPerDay: settings.lessonsPerDay ?? 8,
        isLoading: false,
        isLoaded: true,
      });

      // Initialize partner store with current teacher names
      await usePartnerStore.getState().initFromDb(Object.keys(teachersMap));
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load data',
      });
    }
  },

  // Force reload data from IndexedDB
  reloadData: async () => {
    set({ isLoaded: false, isLoading: false });

    const [teachers, rooms, classes, groups, lessonRequirements, settings] = await Promise.all([
      getAllTeachers(),
      getAllRooms(),
      getAllClasses(),
      getAllGroups(),
      getAllLessonRequirements(),
      getSettings(),
    ]);

    // Convert arrays to lookup maps for teachers and rooms
    const teachersMap = indexBy(teachers, 'name');
    const roomsMap = indexBy(rooms, 'shortName');

    set({
      teachers: teachersMap,
      rooms: roomsMap,
      classes,
      groups,
      lessonRequirements,
      customSubjects: settings.customSubjects ?? [],
      gapExcludedClasses: settings.gapExcludedClasses ?? [],
      daysPerWeek: settings.daysPerWeek ?? 5,
      lessonsPerDay: settings.lessonsPerDay ?? 8,
      isLoading: false,
      isLoaded: true,
    });

    // Re-initialize partner store with current teacher names
    await usePartnerStore.getState().initFromDb(Object.keys(teachersMap));
  },

  // Set data directly (without persisting)
  setData: (data) => {
    const updates: Partial<DataState> = {};

    if (data.teachers) updates.teachers = indexBy(data.teachers, 'name');
    if (data.rooms) updates.rooms = indexBy(data.rooms, 'shortName');

    if (data.classes) updates.classes = data.classes;
    if (data.groups) updates.groups = data.groups;
    if (data.lessonRequirements) updates.lessonRequirements = data.lessonRequirements;

    set(updates);
  },

  // Import data (persist to IndexedDB and update store)
  importData: async (data) => {
    await replaceAllData(data);
    await get().reloadData();
  },

  // Get teacher by name
  getTeacher: (name) => get().teachers[name],

  // Get room by short name
  getRoom: (shortName) => get().rooms[shortName],

  // Get list of class names
  getClassNames: () => get().classes.map(c => c.name),

  // Get lesson requirements for a specific class
  getLessonsForClass: (className) => {
    return get().lessonRequirements.filter(req => {
      if (req.type === 'class') {
        return req.classOrGroup === className;
      }
      // For group lessons, check the parent class
      return req.className === className;
    });
  },

  // Mutation actions - Teachers
  addTeacher: async (teacher) => {
    // Uniqueness guard
    if (Object.values(get().teachers).some(t => t.name === teacher.name)) {
      throw new Error('DUPLICATE_NAME');
    }
    const id = await dbAddTeacher(teacher);
    const newTeacher = { ...teacher, id };
    set((state) => ({
      teachers: { ...state.teachers, [newTeacher.name]: newTeacher },
    }));
    return id;
  },

  updateTeacher: async (id, data) => {
    // Uniqueness guard (exclude self)
    if (data.name !== undefined) {
      const conflict = Object.values(get().teachers).some(
        t => t.name === data.name && t.id !== id
      );
      if (conflict) throw new Error('DUPLICATE_NAME');
    }

    // Cascade rename if name changed
    const oldTeacher = Object.values(get().teachers).find(t => t.id === id);
    const nameChanged = data.name !== undefined && oldTeacher && data.name !== oldTeacher.name;

    await dbUpdateTeacher(id, data);

    if (nameChanged && oldTeacher) {
      const oldName = oldTeacher.name;
      const newName = data.name as string;
      try {
        await cascadeTeacherRename(oldName, newName);
      } catch (e) {
        // Cascade failed — revert the teacher record to avoid a split-brain state
        // where the teacher entity has the new name but lesson slots still reference the old.
        await dbUpdateTeacher(id, { name: oldName });
        throw e;
      }

      // Update in-memory lessonRequirements
      set((state) => {
        const newTeachers = { ...state.teachers };
        const updated = { ...oldTeacher, ...data };
        delete newTeachers[oldName];
        newTeachers[newName] = updated;

        return {
          teachers: newTeachers,
          lessonRequirements: state.lessonRequirements.map(r => ({
            ...r,
            teacher: r.teacher === oldName ? newName : r.teacher,
            ...(r.teacher2 === oldName ? { teacher2: newName } : {}),
          })),
        };
      });
    } else {
      // Regular (non-name) update
      set((state) => {
        const newTeachers = { ...state.teachers };
        for (const [name, teacher] of Object.entries(newTeachers)) {
          if (teacher.id === id) {
            const updated = { ...teacher, ...data };
            if (data.name && data.name !== name) {
              delete newTeachers[name];
              newTeachers[data.name] = updated;
            } else {
              newTeachers[name] = updated;
            }
            break;
          }
        }
        return { teachers: newTeachers };
      });
    }
  },

  deleteTeacher: async (id) => {
    await dbDeleteTeacher(id);
    set((state) => ({ teachers: deleteFromMapById(state.teachers, id) }));
  },

  // Mutation actions - Rooms
  addRoom: async (room) => {
    // Uniqueness guard
    if (Object.values(get().rooms).some(r => r.shortName === room.shortName)) {
      throw new Error('DUPLICATE_SHORTNAME');
    }
    const id = await dbAddRoom(room);
    const newRoom = { ...room, id };
    set((state) => ({
      rooms: { ...state.rooms, [newRoom.shortName]: newRoom },
    }));
    return id;
  },

  updateRoom: async (id, data) => {
    // Uniqueness guard (exclude self)
    if (data.shortName !== undefined) {
      const conflict = Object.values(get().rooms).some(
        r => r.shortName === data.shortName && r.id !== id
      );
      if (conflict) throw new Error('DUPLICATE_SHORTNAME');
    }

    // Cascade rename if shortName changed
    const oldRoom = Object.values(get().rooms).find(r => r.id === id);
    const shortNameChanged =
      data.shortName !== undefined && oldRoom && data.shortName !== oldRoom.shortName;

    await dbUpdateRoom(id, data);

    if (shortNameChanged && oldRoom) {
      const oldShortName = oldRoom.shortName;
      const newShortName = data.shortName as string;
      await cascadeRoomRename(oldShortName, newShortName);

      // Update in-memory teachers map (defaultRoom field)
      set((state) => {
        const newRooms = { ...state.rooms };
        const updated = { ...oldRoom, ...data };
        delete newRooms[oldShortName];
        newRooms[newShortName] = updated;

        const newTeachers = { ...state.teachers };
        for (const [name, teacher] of Object.entries(newTeachers)) {
          if (teacher.defaultRoom === oldShortName) {
            newTeachers[name] = { ...teacher, defaultRoom: newShortName };
          }
        }

        return { rooms: newRooms, teachers: newTeachers };
      });
    } else {
      set((state) => {
        const newRooms = { ...state.rooms };
        for (const [shortName, room] of Object.entries(newRooms)) {
          if (room.id === id) {
            const updated = { ...room, ...data };
            if (data.shortName && data.shortName !== shortName) {
              delete newRooms[shortName];
              newRooms[data.shortName] = updated;
            } else {
              newRooms[shortName] = updated;
            }
            break;
          }
        }
        return { rooms: newRooms };
      });
    }
  },

  deleteRoom: async (id) => {
    await dbDeleteRoom(id);
    set((state) => ({ rooms: deleteFromMapById(state.rooms, id) }));
  },

  // Mutation actions - Classes
  addClass: async (cls) => {
    // Uniqueness guard
    if (get().classes.some(c => c.name === cls.name)) {
      throw new Error('DUPLICATE_NAME');
    }
    const id = `class-${Date.now()}`;
    const newClass = { ...cls, id };
    await dbAddClass(newClass);
    set((state) => ({
      classes: [...state.classes, newClass],
    }));
    return id;
  },

  updateClass: async (id, data) => {
    // Uniqueness guard (exclude self)
    if (data.name !== undefined) {
      const conflict = get().classes.some(c => c.name === data.name && c.id !== id);
      if (conflict) throw new Error('DUPLICATE_NAME');
    }

    // Cascade rename if name changed
    const oldClass = get().classes.find(c => c.id === id);
    const nameChanged = data.name !== undefined && oldClass && data.name !== oldClass.name;

    await dbUpdateClass(id, data);

    if (nameChanged && oldClass) {
      const oldName = oldClass.name;
      const newName = data.name as string;
      await cascadeClassRename(oldName, newName);

      // Update in-memory lessonRequirements, groups, classes
      set((state) => ({
        classes: state.classes.map(c => c.id === id ? { ...c, ...data } : c),
        groups: state.groups.map(g =>
          g.className === oldName ? { ...g, className: newName } : g
        ),
        lessonRequirements: state.lessonRequirements.map(r => {
          const updates: Partial<LessonRequirement> = {};
          if (r.classOrGroup === oldName && r.type === 'class') updates.classOrGroup = newName;
          if (r.className === oldName) updates.className = newName;
          return Object.keys(updates).length > 0 ? { ...r, ...updates } : r;
        }),
      }));
    } else {
      set((state) => ({
        classes: state.classes.map((cls) =>
          cls.id === id ? { ...cls, ...data } : cls
        ),
      }));
    }
  },

  deleteClass: async (id) => {
    await dbDeleteClass(id);
    set((state) => ({
      classes: state.classes.filter((cls) => cls.id !== id),
    }));
  },

  // Mutation actions - Groups
  addGroup: async (group) => {
    // Uniqueness guard (group names include class prefix, so globally unique)
    if (get().groups.some(g => g.name === group.name)) {
      throw new Error('DUPLICATE_NAME');
    }
    const id = `group-${Date.now()}`;
    const newGroup = { ...group, id };
    await dbAddGroup(newGroup);
    set((state) => ({ groups: [...state.groups, newGroup] }));
    return id;
  },

  updateGroup: async (id, data) => {
    // Uniqueness guard (exclude self)
    if (data.name !== undefined) {
      const conflict = get().groups.some(g => g.name === data.name && g.id !== id);
      if (conflict) throw new Error('DUPLICATE_NAME');
    }

    await dbUpdateGroup(id, data);
    const state = get();
    const existing = state.groups.find(g => g.id === id);

    // If name changed, propagate rename to all lesson requirements + version blobs
    if (data.name && existing && data.name !== existing.name) {
      const oldName = existing.name;
      const newName = data.name;
      const oldIndex = existing.index;
      const newIndex = data.index ?? existing.index; // index may or may not change

      // Cascade into version blobs (schedule group index + substitutions)
      await cascadeGroupRenameInVersions(oldName, newName, existing.className, oldIndex, newIndex);

      // Update LessonRequirements in DB
      const affectedReqs = state.lessonRequirements.filter(
        r => r.classOrGroup === oldName || r.parallelGroup === oldName
      );
      for (const req of affectedReqs) {
        const updates: Partial<LessonRequirement> = {};
        if (req.classOrGroup === oldName) updates.classOrGroup = newName;
        if (req.parallelGroup === oldName) updates.parallelGroup = newName;
        await updateLessonRequirement(req.id, updates);
      }
      // Rename parallelGroup references in sibling groups
      const siblingGroups = state.groups.filter(g => g.parallelGroup === oldName);
      for (const sg of siblingGroups) {
        await dbUpdateGroup(sg.id, { parallelGroup: newName });
      }
      set((state) => ({
        groups: state.groups.map(g => {
          if (g.id === id) return { ...g, ...data };
          if (g.parallelGroup === oldName) return { ...g, parallelGroup: newName };
          return g;
        }),
        lessonRequirements: state.lessonRequirements.map(r => {
          const updates: Partial<LessonRequirement> = {};
          if (r.classOrGroup === oldName) updates.classOrGroup = newName;
          if (r.parallelGroup === oldName) updates.parallelGroup = newName;
          return Object.keys(updates).length > 0 ? { ...r, ...updates } : r;
        }),
      }));
    } else {
      set((state) => ({
        groups: state.groups.map(g => g.id === id ? { ...g, ...data } : g),
      }));
    }
  },

  deleteGroup: async (id) => {
    await dbDeleteGroup(id);
    set((state) => ({ groups: state.groups.filter(g => g.id !== id) }));
  },

  // Mutation actions - Lesson Requirements
  addRequirement: async (req) => {
    const id = await dbAddRequirement(req);
    const newReq = { ...req, id };
    set((state) => ({
      lessonRequirements: [...state.lessonRequirements, newReq],
    }));
    return id;
  },

  updateRequirement: async (id, data) => {
    await dbUpdateRequirement(id, data);
    set((state) => ({
      lessonRequirements: state.lessonRequirements.map((req) =>
        req.id === id ? { ...req, ...data } : req
      ),
    }));
  },

  deleteRequirement: async (id) => {
    await dbDeleteRequirement(id);
    set((state) => ({
      lessonRequirements: state.lessonRequirements.filter((req) => req.id !== id),
    }));
  },

  // Mutation actions - Subjects
  renameSubject: async (oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;

    // Update teachers' subjects[] in DB + in-memory
    const allTeachers = Object.values(get().teachers);
    for (const teacher of allTeachers) {
      if (teacher.subjects.includes(oldName)) {
        const updatedSubjects = teacher.subjects.map(s => s === oldName ? trimmed : s);
        await dbUpdateTeacher(teacher.id, { subjects: updatedSubjects });
      }
    }

    // Cascade to lessonRequirements + version blobs
    await cascadeSubjectRename(oldName, trimmed);

    // Also rename in customSubjects if present
    const currentCustom = get().customSubjects;
    if (currentCustom.includes(oldName)) {
      const updatedCustom = currentCustom.map(s => s === oldName ? trimmed : s);
      await updateSettings({ customSubjects: updatedCustom });
      set({ customSubjects: updatedCustom });
    }

    // Update in-memory state atomically
    set((state) => ({
      teachers: Object.fromEntries(
        Object.entries(state.teachers).map(([name, t]) => [
          name,
          t.subjects.includes(oldName)
            ? { ...t, subjects: t.subjects.map(s => s === oldName ? trimmed : s) }
            : t,
        ])
      ),
      lessonRequirements: state.lessonRequirements.map(r =>
        r.subject === oldName ? { ...r, subject: trimmed } : r
      ),
    }));
  },

  // Mutation actions - Custom Subjects
  addCustomSubject: async (subject) => {
    const current = get().customSubjects;
    if (current.includes(subject)) return;
    const updated = [...current, subject];
    await updateSettings({ customSubjects: updated });
    set({ customSubjects: updated });
  },

  // Mutation actions - Gap Exclusions
  setGapExcludedClasses: async (classes) => {
    await updateSettings({ gapExcludedClasses: classes });
    set({ gapExcludedClasses: classes });
  },

  // Mutation actions - School Week
  updateSchoolWeek: async (daysPerWeek, lessonsPerDay) => {
    await updateSettings({ daysPerWeek, lessonsPerDay });
    set({ daysPerWeek, lessonsPerDay });
  },

  // Load a past year snapshot into memory (no DB writes)
  loadYearSnapshot: (yearLabel, exportJson) => {
    const parsed = parseExportData(exportJson);

    set({
      teachers: indexBy(parsed.teachers ?? [], 'name'),
      rooms: indexBy(parsed.rooms ?? [], 'shortName'),
      classes: parsed.classes ?? [],
      groups: parsed.groups ?? [],
      lessonRequirements: parsed.lessonRequirements ?? [],
      isReadOnlyYear: true,
      readOnlyYearLabel: yearLabel,
      readOnlyVersions: parsed.scheduleVersions ?? [],
    });
  },

  // Exit read-only year mode and restore current year from DB
  exitReadOnlyYear: async () => {
    set({ isReadOnlyYear: false, readOnlyYearLabel: null, readOnlyVersions: [] });
    await get().reloadData();
  },
}));
