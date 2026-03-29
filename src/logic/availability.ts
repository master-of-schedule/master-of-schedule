/**
 * Availability functions for rooms and teachers
 * Pure functions for finding what's available at a given time
 */

import type {
  Schedule,
  LessonRequirement,
  Teacher,
  Room,
  SchoolClass,
  Day,
  LessonNumber,
} from '@/types';
import { forEachSlotAt } from './traversal';
import { isTeacherFree } from './validation';
import { getUnscheduledLessons } from './counting';

/**
 * Count how many times each room is used at a specific slot.
 */
function getRoomUsageAtSlot(
  schedule: Schedule,
  day: Day,
  lessonNum: LessonNumber
): Map<string, number> {
  const usage = new Map<string, number>();
  forEachSlotAt(schedule, day, lessonNum, (_className, lessons) => {
    for (const lesson of lessons) {
      if (lesson.room) {
        usage.set(lesson.room, (usage.get(lesson.room) ?? 0) + 1);
      }
    }
  });
  return usage;
}

/**
 * Count total student count per room at a specific slot.
 * Used for capacity validation.
 */
function getRoomStudentCount(
  schedule: Schedule,
  classes: SchoolClass[],
  day: Day,
  lessonNum: LessonNumber
): Map<string, number> {
  const studentCounts = new Map<string, number>();
  const classMap = new Map(classes.map(c => [c.name, c.studentCount ?? 0]));
  // Track which classes are already counted per room to avoid double-counting
  // (e.g. two group lessons of 11б in the same room share the same 29 students)
  const countedClasses = new Map<string, Set<string>>();
  forEachSlotAt(schedule, day, lessonNum, (className, lessons) => {
    for (const lesson of lessons) {
      if (lesson.room) {
        if (!countedClasses.has(lesson.room)) countedClasses.set(lesson.room, new Set());
        const counted = countedClasses.get(lesson.room)!;
        if (!counted.has(className)) {
          counted.add(className);
          studentCounts.set(
            lesson.room,
            (studentCounts.get(lesson.room) ?? 0) + (classMap.get(className) ?? 0)
          );
        }
      }
    }
  });
  return studentCounts;
}

/**
 * Get rooms that are occupied at a specific time
 */
export function getOccupiedRooms(
  schedule: Schedule,
  day: Day,
  lessonNum: LessonNumber
): Set<string> {
  const occupied = new Set<string>();

  forEachSlotAt(schedule, day, lessonNum, (_className, lessons) => {
    for (const lesson of lessons) {
      if (lesson.room) {
        occupied.add(lesson.room);
      }
    }
  });

  return occupied;
}

/**
 * Get available rooms at a specific time
 * Considers room capacity and multi-class capability
 */
export function getAvailableRooms(
  schedule: Schedule,
  rooms: Record<string, Room>,
  day: Day,
  lessonNum: LessonNumber,
  classes?: SchoolClass[],
  studentCount?: number,
): Room[] {
  // Count how many times each room is used in this slot
  const roomUsageCount = getRoomUsageAtSlot(schedule, day, lessonNum);

  // Optionally compute student counts for capacity check
  const studentCounts = classes && studentCount != null
    ? getRoomStudentCount(schedule, classes, day, lessonNum)
    : null;

  const available: Room[] = [];

  for (const room of Object.values(rooms)) {
    const currentUsage = roomUsageCount.get(room.shortName) ?? 0;
    const maxUsage = room.multiClass ?? 1;

    // Room is available if it hasn't reached its multi-class limit
    if (currentUsage < maxUsage) {
      // Check student capacity if both classes and studentCount provided
      if (studentCounts && studentCount != null && room.capacity) {
        const existingStudents = studentCounts.get(room.shortName) ?? 0;
        if (existingStudents + studentCount > room.capacity) {
          continue;
        }
      }
      available.push(room);
    }
  }

  // Sort by full name for consistent display
  return available.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
}

/**
 * Check if a specific room is available at a time
 */
export function isRoomAvailable(
  schedule: Schedule,
  rooms: Record<string, Room>,
  roomShortName: string,
  day: Day,
  lessonNum: LessonNumber,
  classes?: SchoolClass[],
  studentCount?: number,
): boolean {
  const room = Object.values(rooms).find(r => r.shortName === roomShortName);
  if (!room) return false;

  const roomUsageCount = getRoomUsageAtSlot(schedule, day, lessonNum);
  const currentUsage = roomUsageCount.get(roomShortName) ?? 0;
  const maxUsage = room.multiClass ?? 1;
  if (currentUsage >= maxUsage) return false;

  // Check student capacity if both classes and studentCount provided
  if (classes && studentCount != null && room.capacity) {
    const studentCounts = getRoomStudentCount(schedule, classes, day, lessonNum);
    const existingStudents = studentCounts.get(roomShortName) ?? 0;
    if (existingStudents + studentCount > room.capacity) return false;
  }

  return true;
}

/**
 * Get lessons that can be assigned to a specific slot
 * Returns both unscheduled lessons and already-scheduled lessons that could be moved
 */
export interface AvailableLessonsResult {
  /** Lessons from unscheduled list that can be placed here */
  unscheduled: LessonRequirement[];
  /** Already-scheduled lessons that could be moved here (teacher is free) */
  movable: {
    lesson: LessonRequirement;
    fromDay: Day;
    fromLessonNum: LessonNumber;
  }[];
}

export interface ExcludeLesson {
  subject: string;
  teacher: string;
  group?: string;
}

export function getAvailableLessonsForSlot(
  requirements: LessonRequirement[],
  schedule: Schedule,
  teachers: Record<string, Teacher>,
  className: string,
  day: Day,
  lessonNum: LessonNumber,
  excludeLesson?: ExcludeLesson
): AvailableLessonsResult {
  const result: AvailableLessonsResult = {
    unscheduled: [],
    movable: [],
  };

  const seenKeys = new Set<string>();

  // Helper to check if a lesson matches the excluded lesson
  const isExcluded = (subject: string, teacher: string, group?: string) => {
    if (!excludeLesson) return false;
    return (
      subject === excludeLesson.subject &&
      teacher === excludeLesson.teacher &&
      (group ?? undefined) === (excludeLesson.group ?? undefined)
    );
  };

  // Get unscheduled lessons whose teachers are free
  const unscheduledList = getUnscheduledLessons(requirements, schedule, className);

  for (const { requirement } of unscheduledList) {
    const group = requirement.type === 'group' ? requirement.classOrGroup : undefined;
    const key = group
      ? `${requirement.subject}|${requirement.teacher}|${group}`
      : `${requirement.subject}|${requirement.teacher}`;
    if (seenKeys.has(key)) continue;

    // Skip if this is the excluded lesson
    if (isExcluded(requirement.subject, requirement.teacher, group)) continue;

    // Skip lessons from the same teacher being replaced (pointless replacement)
    if (excludeLesson && requirement.teacher === excludeLesson.teacher) continue;

    if (isTeacherFree(schedule, teachers, requirement.teacher, day, lessonNum, className)) {
      // Also check teacher2 if present
      if (requirement.teacher2 && !isTeacherFree(schedule, teachers, requirement.teacher2, day, lessonNum, className)) {
        continue;
      }
      seenKeys.add(key);
      result.unscheduled.push(requirement);
    }
  }

  // Get already-scheduled lessons that could be moved here
  // Unlike unscheduled, show ALL slots for the same lesson (not just first)
  const classSchedule = schedule[className];
  if (classSchedule) {
    for (const [existingDay, daySchedule] of Object.entries(classSchedule)) {
      if (!daySchedule) continue;

      for (const [existingLessonNum, slot] of Object.entries(daySchedule)) {
        // Skip the target slot
        if (existingDay === day && Number(existingLessonNum) === lessonNum) continue;

        for (const lesson of slot?.lessons ?? []) {
          // Skip if this is the excluded lesson
          if (isExcluded(lesson.subject, lesson.teacher, lesson.group)) continue;

          // Skip lessons from the same teacher being replaced (pointless replacement)
          if (excludeLesson && lesson.teacher === excludeLesson.teacher) continue;

          if (isTeacherFree(schedule, teachers, lesson.teacher, day, lessonNum, className)) {
            // Also check teacher2 if present
            if (lesson.teacher2 && !isTeacherFree(schedule, teachers, lesson.teacher2, day, lessonNum, className)) {
              continue;
            }

            const key = lesson.group
              ? `${lesson.subject}|${lesson.teacher}|${lesson.group}`
              : `${lesson.subject}|${lesson.teacher}`;

            // Mark as seen so it won't appear in unscheduled too
            seenKeys.add(key);

            // Find the matching requirement
            const req = requirements.find(r =>
              r.id === lesson.requirementId ||
              (r.subject === lesson.subject &&
               r.teacher === lesson.teacher &&
               (r.type === 'class' || r.classOrGroup === lesson.group))
            );

            if (req) {
              result.movable.push({
                lesson: req,
                fromDay: existingDay as Day,
                fromLessonNum: Number(existingLessonNum) as LessonNumber,
              });
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * Get teachers who can substitute for a subject
 * Returns teachers who:
 * 1. Have this subject in their subjects list
 * 2. Are free at the specified time
 */
export function getSubstituteTeachers(
  schedule: Schedule,
  teachers: Record<string, Teacher>,
  subject: string,
  day: Day,
  lessonNum: LessonNumber,
  excludeClass: string,
  excludeTeacher?: string
): Teacher[] {
  const substitutes: Teacher[] = [];

  for (const teacher of Object.values(teachers)) {
    // Skip the teacher being replaced
    if (excludeTeacher && teacher.name === excludeTeacher) continue;

    // Check if teacher can teach this subject
    if (!teacher.subjects.includes(subject)) continue;

    // Check if teacher is free
    if (isTeacherFree(schedule, teachers, teacher.name, day, lessonNum, excludeClass)) {
      substitutes.push(teacher);
    }
  }

  // Sort by name
  return substitutes.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/**
 * Get all teachers who are free at a given slot, regardless of subject.
 * Excludes teachers already listed in substituteTeacherNames (those who teach the subject).
 * Used for the "Другие (проф.)" section in the replacement picker.
 */
export function getFreeTeachersAtSlot(
  schedule: Schedule,
  teachers: Record<string, Teacher>,
  day: Day,
  lessonNum: LessonNumber,
  excludeTeacher?: string,
  substituteTeacherNames?: string[],
): Teacher[] {
  const excludeSet = new Set(substituteTeacherNames ?? []);
  const result: Teacher[] = [];

  for (const teacher of Object.values(teachers)) {
    if (excludeTeacher && teacher.name === excludeTeacher) continue;
    if (excludeSet.has(teacher.name)) continue;
    if (isTeacherFree(schedule, teachers, teacher.name, day, lessonNum, '')) {
      result.push(teacher);
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/**
 * Get all classes where a teacher has lessons at a specific time
 * Used for "where is teacher busy" display
 */
export function getTeacherClassesAtTime(
  schedule: Schedule,
  teacherName: string,
  day: Day,
  lessonNum: LessonNumber
): { className: string; subject: string; room: string }[] {
  const classes: { className: string; subject: string; room: string }[] = [];

  forEachSlotAt(schedule, day, lessonNum, (className, lessons) => {
    for (const lesson of lessons) {
      if (lesson.teacher === teacherName || lesson.teacher2 === teacherName) {
        classes.push({
          className,
          subject: lesson.subject,
          room: lesson.room,
        });
      }
    }
  });

  return classes;
}
