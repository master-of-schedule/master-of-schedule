/**
 * Data operations for entities (Teachers, Rooms, Classes, Groups, Lessons)
 */

import { db } from './database';
import { generateId } from '@/utils/generateId';
import type {
  Teacher,
  Room,
  SchoolClass,
  Group,
  LessonRequirement,
} from '@/types';

// ============ Teachers ============

export async function getAllTeachers(): Promise<Teacher[]> {
  return db.teachers.orderBy('name').toArray();
}

export async function getTeacher(id: string): Promise<Teacher | undefined> {
  return db.teachers.get(id);
}

export async function getTeacherByName(name: string): Promise<Teacher | undefined> {
  return db.teachers.where('name').equals(name).first();
}

export async function addTeacher(teacher: Omit<Teacher, 'id'> | Teacher): Promise<string> {
  const id = 'id' in teacher && teacher.id ? teacher.id : generateId('teacher');
  await db.teachers.add({ ...teacher, id } as Teacher);
  return id;
}

export async function updateTeacher(id: string, updates: Partial<Omit<Teacher, 'id'>>): Promise<void> {
  await db.teachers.update(id, updates);
}

export async function deleteTeacher(id: string): Promise<void> {
  await db.teachers.delete(id);
}

export async function bulkAddTeachers(teachers: Teacher[]): Promise<void> {
  await db.teachers.bulkAdd(teachers);
}

export async function clearTeachers(): Promise<void> {
  await db.teachers.clear();
}

// ============ Rooms ============

export async function getAllRooms(): Promise<Room[]> {
  const rooms = await db.rooms.toArray();
  return rooms.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
}

export async function getRoom(id: string): Promise<Room | undefined> {
  return db.rooms.get(id);
}

export async function getRoomByShortName(shortName: string): Promise<Room | undefined> {
  return db.rooms.where('shortName').equals(shortName).first();
}

export async function addRoom(room: Omit<Room, 'id'> | Room): Promise<string> {
  const id = 'id' in room && room.id ? room.id : generateId('room');
  await db.rooms.add({ ...room, id } as Room);
  return id;
}

export async function updateRoom(id: string, updates: Partial<Omit<Room, 'id'>>): Promise<void> {
  await db.rooms.update(id, updates);
}

export async function deleteRoom(id: string): Promise<void> {
  await db.rooms.delete(id);
}

export async function bulkAddRooms(rooms: Room[]): Promise<void> {
  await db.rooms.bulkAdd(rooms);
}

export async function clearRooms(): Promise<void> {
  await db.rooms.clear();
}

// ============ Classes ============

export async function getAllClasses(): Promise<SchoolClass[]> {
  const classes = await db.classes.toArray();
  return classes.sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
}

export async function getClass(id: string): Promise<SchoolClass | undefined> {
  return db.classes.get(id);
}

export async function addClass(schoolClass: SchoolClass): Promise<void> {
  await db.classes.add(schoolClass);
}

export async function updateClass(id: string, updates: Partial<Omit<SchoolClass, 'id'>>): Promise<void> {
  await db.classes.update(id, updates);
}

export async function deleteClass(id: string): Promise<void> {
  await db.classes.delete(id);
}

export async function bulkAddClasses(classes: SchoolClass[]): Promise<void> {
  await db.classes.bulkAdd(classes);
}

export async function clearClasses(): Promise<void> {
  await db.classes.clear();
}

// ============ Groups ============

export async function getAllGroups(): Promise<Group[]> {
  return db.groups.orderBy('name').toArray();
}

export async function getGroupsByClass(className: string): Promise<Group[]> {
  return db.groups.where('className').equals(className).toArray();
}

export async function getGroup(id: string): Promise<Group | undefined> {
  return db.groups.get(id);
}

export async function addGroup(group: Group): Promise<void> {
  await db.groups.add(group);
}

export async function updateGroup(id: string, updates: Partial<Omit<Group, 'id'>>): Promise<void> {
  await db.groups.update(id, updates);
}

export async function deleteGroup(id: string): Promise<void> {
  await db.groups.delete(id);
}

export async function bulkAddGroups(groups: Group[]): Promise<void> {
  await db.groups.bulkAdd(groups);
}

export async function clearGroups(): Promise<void> {
  await db.groups.clear();
}

// ============ Lesson Requirements ============

export async function getAllLessonRequirements(): Promise<LessonRequirement[]> {
  return db.lessonRequirements.toArray();
}

export async function getLessonRequirementsByClass(className: string): Promise<LessonRequirement[]> {
  // Get class lessons
  const classLessons = await db.lessonRequirements
    .where('classOrGroup')
    .equals(className)
    .toArray();

  // Get group lessons for this class
  const groupLessons = await db.lessonRequirements
    .filter(req => req.type === 'group' && req.className === className)
    .toArray();

  return [...classLessons, ...groupLessons];
}

export async function getLessonRequirementsByTeacher(teacherName: string): Promise<LessonRequirement[]> {
  return db.lessonRequirements.where('teacher').equals(teacherName).toArray();
}

export async function getLessonRequirement(id: string): Promise<LessonRequirement | undefined> {
  return db.lessonRequirements.get(id);
}

export async function addLessonRequirement(requirement: Omit<LessonRequirement, 'id'> | LessonRequirement): Promise<string> {
  const id = 'id' in requirement && requirement.id ? requirement.id : generateId('req');
  await db.lessonRequirements.add({ ...requirement, id } as LessonRequirement);
  return id;
}

export async function updateLessonRequirement(
  id: string,
  updates: Partial<Omit<LessonRequirement, 'id'>>
): Promise<void> {
  await db.lessonRequirements.update(id, updates);
}

export async function deleteLessonRequirement(id: string): Promise<void> {
  await db.lessonRequirements.delete(id);
}

export async function bulkAddLessonRequirements(requirements: LessonRequirement[]): Promise<void> {
  await db.lessonRequirements.bulkAdd(requirements);
}

export async function clearLessonRequirements(): Promise<void> {
  await db.lessonRequirements.clear();
}

// ============ Bulk Operations ============

/**
 * Replace all data with new data (for import)
 */
export async function replaceAllData(data: {
  teachers?: Teacher[];
  rooms?: Room[];
  classes?: SchoolClass[];
  groups?: Group[];
  lessonRequirements?: LessonRequirement[];
}): Promise<void> {
  await db.transaction(
    'rw',
    [db.teachers, db.rooms, db.classes, db.groups, db.lessonRequirements],
    async () => {
      if (data.teachers?.length) {
        await db.teachers.clear();
        await db.teachers.bulkAdd(data.teachers);
      }
      if (data.rooms?.length) {
        await db.rooms.clear();
        await db.rooms.bulkAdd(data.rooms);
      }
      if (data.classes?.length) {
        await db.classes.clear();
        await db.classes.bulkAdd(data.classes);
      }
      if (data.groups?.length) {
        await db.groups.clear();
        await db.groups.bulkAdd(data.groups);
      }
      if (data.lessonRequirements?.length) {
        await db.lessonRequirements.clear();
        await db.lessonRequirements.bulkAdd(data.lessonRequirements);
      }
    }
  );
}

/**
 * Clear schedule-related data for new academic year.
 * Preserves teachers and rooms.
 */
export async function clearScheduleData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.versions, db.classes, db.groups, db.lessonRequirements],
    async () => {
      await db.versions.clear();
      await db.classes.clear();
      await db.groups.clear();
      await db.lessonRequirements.clear();
    }
  );
  await db.settings.update('default', { activeTemplateId: null });
}

/**
 * Get all data (for export)
 */
export async function getAllData(): Promise<{
  teachers: Teacher[];
  rooms: Room[];
  classes: SchoolClass[];
  groups: Group[];
  lessonRequirements: LessonRequirement[];
}> {
  const [teachers, rooms, classes, groups, lessonRequirements] = await Promise.all([
    getAllTeachers(),
    getAllRooms(),
    getAllClasses(),
    getAllGroups(),
    getAllLessonRequirements(),
  ]);

  return { teachers, rooms, classes, groups, lessonRequirements };
}
