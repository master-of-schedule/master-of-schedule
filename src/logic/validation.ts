/**
 * Validation and conflict detection
 * Pure functions for checking schedule constraints
 */

import type {
  Schedule,
  ScheduledLesson,
  LessonRequirement,
  Teacher,
  Group,
  Day,
  LessonNumber,
  CellStatusInfo,
} from '@/types';
import { DAYS, LESSON_NUMBERS } from '@/types';
import { forEachSlotAt } from './traversal';
import { getSlotLessons } from './schedule';

/**
 * Result of checking if a lesson can be assigned
 */
export type AssignmentCheckResult =
  | { allowed: true }
  | { allowed: false; reason: 'teacher_banned' }
  | { allowed: false; reason: 'class_occupied' }
  | { allowed: false; reason: 'teacher_busy'; conflictClass: string; conflictSubject: string };

/**
 * Check if a teacher is banned at a specific time
 */
export function isTeacherBanned(
  teachers: Record<string, Teacher>,
  teacherName: string,
  day: Day,
  lessonNum: LessonNumber
): boolean {
  const teacher = teachers[teacherName];
  return teacher?.bans?.[day]?.includes(lessonNum) ?? false;
}

/**
 * Check if a teacher is busy in another class at a specific time
 * Returns the conflict info if busy, null if free
 */
export function getTeacherConflict(
  schedule: Schedule,
  teacherName: string,
  day: Day,
  lessonNum: LessonNumber,
  excludeClass?: string
): { className: string; subject: string } | null {
  for (const className of Object.keys(schedule)) {
    if (className === excludeClass) continue;

    const lessons = getSlotLessons(schedule, className, day, lessonNum);
    for (const lesson of lessons) {
      if (lesson.teacher === teacherName || lesson.teacher2 === teacherName) {
        return { className, subject: lesson.subject };
      }
    }
  }

  return null;
}

/**
 * Check if a teacher is free at a specific time
 */
export function isTeacherFree(
  schedule: Schedule,
  teachers: Record<string, Teacher>,
  teacherName: string,
  day: Day,
  lessonNum: LessonNumber,
  excludeClass?: string
): boolean {
  // Check bans
  if (isTeacherBanned(teachers, teacherName, day, lessonNum)) {
    return false;
  }

  // Check if busy in another class
  const conflict = getTeacherConflict(schedule, teacherName, day, lessonNum, excludeClass);
  return conflict === null;
}

/**
 * Check if parallel groups can coexist in the same slot.
 *
 * Two lessons can share a slot only if they are explicitly defined as parallel:
 * 1. Both have group property set and are different groups
 * 2. Formal check: newLesson.parallelGroup === existingLesson.group
 *    (the new lesson's requirement declares the existing group as its parallel)
 * 3. Groups table check: the Groups table entry for existingLesson.group has
 *    parallelGroup === newLesson.group (bidirectional lookup via Groups entity)
 *
 * Groups table is the authoritative source — no fallbacks.
 * Groups from the same parent class that are NOT defined as parallel (e.g. 10а(м)
 * and 10а(В.Е.) which belong to different parallel pairs) must not coexist.
 */
export function canLessonsCoexist(
  existingLesson: ScheduledLesson,
  newLesson: { group?: string; parallelGroup?: string },
  groups?: Group[]
): boolean {
  // If either doesn't have a group, they can't coexist
  if (!existingLesson.group || !newLesson.group) {
    return false;
  }

  // They must be different groups
  if (existingLesson.group === newLesson.group) {
    return false;
  }

  // Formal parallel group declaration on the new lesson's requirement
  if (newLesson.parallelGroup === existingLesson.group) {
    return true;
  }

  // Groups table lookup: check existingLesson.group's declared parallelGroup
  if (groups && groups.length > 0) {
    const existingGroupDef = groups.find(g => g.name === existingLesson.group);
    if (existingGroupDef?.parallelGroup === newLesson.group) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a lesson can be assigned to a specific slot
 */
export function canAssignLesson(
  schedule: Schedule,
  teachers: Record<string, Teacher>,
  params: {
    className: string;
    day: Day;
    lessonNum: LessonNumber;
    teacherName: string;
    teacher2Name?: string;
    group?: string;
    parallelGroups?: string[];
  }
): AssignmentCheckResult {
  const { className, day, lessonNum, teacherName, group, parallelGroups } = params;

  // Check teacher ban
  if (isTeacherBanned(teachers, teacherName, day, lessonNum)) {
    return { allowed: false, reason: 'teacher_banned' };
  }

  // Check teacher2 ban
  if (params.teacher2Name && isTeacherBanned(teachers, params.teacher2Name, day, lessonNum)) {
    return { allowed: false, reason: 'teacher_banned' };
  }

  // Check if class slot is occupied
  const existingLessons = getSlotLessons(schedule, className, day, lessonNum);
  if (existingLessons.length > 0) {
    // Allow if this is a group lesson and existing lessons are parallel groups
    if (group && parallelGroups) {
      const canCoexist = existingLessons.every(
        existing => existing.group && parallelGroups.includes(existing.group)
      );
      if (!canCoexist) {
        return { allowed: false, reason: 'class_occupied' };
      }
    } else {
      return { allowed: false, reason: 'class_occupied' };
    }
  }

  // Check if teacher is busy in another class
  const conflict = getTeacherConflict(schedule, teacherName, day, lessonNum, className);
  if (conflict) {
    return {
      allowed: false,
      reason: 'teacher_busy',
      conflictClass: conflict.className,
      conflictSubject: conflict.subject,
    };
  }

  // Check if teacher2 is busy in another class
  if (params.teacher2Name) {
    const conflict2 = getTeacherConflict(schedule, params.teacher2Name, day, lessonNum, className);
    if (conflict2) {
      return {
        allowed: false,
        reason: 'teacher_busy',
        conflictClass: conflict2.className,
        conflictSubject: conflict2.subject,
      };
    }
  }

  return { allowed: true };
}

/**
 * Get the cell status for display (color coding)
 * Used when a lesson is selected from the unscheduled list
 *
 * Priority order:
 * 1. same → blue
 * 2. teacher_banned → pink
 * 3. teacher_busy → orange
 * 4. partner_busy → gray (NEW)
 * 5. class_occupied → cream
 * 6. available → white
 */
export function getCellStatus(
  schedule: Schedule,
  teachers: Record<string, Teacher>,
  selectedLesson: LessonRequirement,
  className: string,
  day: Day,
  lessonNum: LessonNumber,
  partnerBusySet?: Set<string>,
  groups?: Group[],
  partnerClassNames?: Set<string>
): CellStatusInfo {
  const existingLessons = getSlotLessons(schedule, className, day, lessonNum);

  // Check if same lesson is already in this slot (Blue)
  for (const lesson of existingLessons) {
    if (
      lesson.subject === selectedLesson.subject &&
      lesson.teacher === selectedLesson.teacher &&
      (selectedLesson.type === 'class' || lesson.group === selectedLesson.classOrGroup)
    ) {
      return { status: 'same' };
    }
  }

  // Check teacher ban (Pink)
  if (isTeacherBanned(teachers, selectedLesson.teacher, day, lessonNum)) {
    return { status: 'teacher_banned' };
  }

  // Check teacher2 ban (Pink)
  if (selectedLesson.teacher2 && isTeacherBanned(teachers, selectedLesson.teacher2, day, lessonNum)) {
    return { status: 'teacher_banned' };
  }

  // Check teacher busy in another class (Orange, or partner_busy if in partner class)
  const conflict = getTeacherConflict(
    schedule,
    selectedLesson.teacher,
    day,
    lessonNum,
    className
  );
  if (conflict) {
    if (partnerClassNames?.has(conflict.className)) {
      return { status: 'partner_busy', teacherName: selectedLesson.teacher };
    }
    return {
      status: 'teacher_busy',
      conflictClass: conflict.className,
      conflictSubject: conflict.subject,
    };
  }

  // Check teacher2 busy in another class (Orange, or partner_busy if in partner class)
  if (selectedLesson.teacher2) {
    const conflict2 = getTeacherConflict(
      schedule,
      selectedLesson.teacher2,
      day,
      lessonNum,
      className
    );
    if (conflict2) {
      if (partnerClassNames?.has(conflict2.className)) {
        return { status: 'partner_busy', teacherName: selectedLesson.teacher2 };
      }
      return {
        status: 'teacher_busy',
        conflictClass: conflict2.className,
        conflictSubject: conflict2.subject,
      };
    }
  }

  // Check partner busy (Gray) — after teacher_busy, before class_occupied
  if (partnerBusySet) {
    const key1 = `${selectedLesson.teacher}|${day}|${lessonNum}`;
    if (partnerBusySet.has(key1)) {
      return { status: 'partner_busy', teacherName: selectedLesson.teacher };
    }
    if (selectedLesson.teacher2) {
      const key2 = `${selectedLesson.teacher2}|${day}|${lessonNum}`;
      if (partnerBusySet.has(key2)) {
        return { status: 'partner_busy', teacherName: selectedLesson.teacher2 };
      }
    }
  }

  // Check class occupied (Cream)
  if (existingLessons.length > 0) {
    // Allow if parallel groups can coexist
    if (selectedLesson.type === 'group') {
      const allCanCoexist = existingLessons.every(
        existing => canLessonsCoexist(existing, {
          group: selectedLesson.classOrGroup,
          parallelGroup: selectedLesson.parallelGroup,
        }, groups)
      );
      if (!allCanCoexist) {
        return { status: 'class_occupied' };
      }
    } else {
      return { status: 'class_occupied' };
    }
  }

  // Available (White)
  return { status: 'available' };
}

/**
 * Validate entire schedule for conflicts
 * Returns list of all conflicts found
 */
export interface ScheduleConflict {
  type: 'teacher_double_booked' | 'room_double_booked' | 'force_override_ban';
  day: Day;
  lessonNum: LessonNumber;
  details: string;
}

export function validateSchedule(
  schedule: Schedule,
  teachers: Record<string, Teacher>,
  partnerClassNames?: Set<string>
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const days = DAYS;

  // For each timeslot, check for teacher double-booking
  for (const day of days) {
    const lessonNums = new Set<LessonNumber>();

    // Collect all lesson numbers
    for (const classSchedule of Object.values(schedule)) {
      const daySchedule = classSchedule[day];
      if (daySchedule) {
        for (const lessonNum of Object.keys(daySchedule).map(Number) as LessonNumber[]) {
          lessonNums.add(lessonNum);
        }
      }
    }

    for (const lessonNum of lessonNums) {
      const teacherAssignments = new Map<string, string[]>();

      forEachSlotAt(schedule, day, lessonNum, (className, lessons) => {
        // Skip partner school class slots — their teacher assignments don't count as conflicts
        if (partnerClassNames?.has(className)) return;
        for (const lesson of lessons) {
          const existing = teacherAssignments.get(lesson.teacher) ?? [];
          existing.push(className);
          teacherAssignments.set(lesson.teacher, existing);

          if (lesson.teacher2) {
            const existing2 = teacherAssignments.get(lesson.teacher2) ?? [];
            existing2.push(className);
            teacherAssignments.set(lesson.teacher2, existing2);
          }

          // Check force-override ban violations
          if (lesson.forceOverride) {
            const bannedTeachers: string[] = [];
            if (isTeacherBanned(teachers, lesson.teacher, day, lessonNum)) {
              bannedTeachers.push(lesson.teacher);
            }
            if (lesson.teacher2 && isTeacherBanned(teachers, lesson.teacher2, day, lessonNum)) {
              bannedTeachers.push(lesson.teacher2);
            }
            if (bannedTeachers.length > 0) {
              conflicts.push({
                type: 'force_override_ban',
                day,
                lessonNum,
                details: `${bannedTeachers.join(', ')} (${className}, ${lesson.subject})`,
              });
            }
          }
        }
      });

      // Check for teachers assigned to multiple classes
      for (const [teacher, classes] of teacherAssignments) {
        if (classes.length > 1) {
          conflicts.push({
            type: 'teacher_double_booked',
            day,
            lessonNum,
            details: `${teacher} assigned to ${classes.join(', ')}`,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * A gap ("окно") in the schedule: an empty slot between two occupied slots in the same day
 */
export interface ScheduleGap {
  type: 'class' | 'teacher' | 'group';
  name: string; // class name, teacher name, or group name
  day: Day;
  lessonNum: LessonNumber;
}

/**
 * Find all gaps (windows) in the schedule for classes.
 * A gap is an empty cell between the first and last occupied cell of the same day.
 *
 * Z28-1: Group-level gap rule (revised):
 *   A group has a window at slot S when:
 *   1. Slot S has exactly one group's lesson (the partner group is absent, no class-wide lesson).
 *   2. There is a "full-class" slot before S AND after S on the same day.
 *   "Full-class" = class-wide lesson (no group) OR two or more different group lessons.
 *   "Group pair" = two groups that appear together in the same slot (same subject split).
 *   Only paired groups are considered — groups from different subject splits are not compared.
 */
export function findGaps(
  schedule: Schedule,
  _teachers: Record<string, Teacher>,
  excludeClasses?: Set<string>,
  groups?: Group[]
): ScheduleGap[] {
  const gaps: ScheduleGap[] = [];

  // Pre-compute ALL group pairs once before the loop:
  //   • Static pairs from the Groups table (authoritative source).
  //   • Dynamic pairs discovered from co-scheduled groups across the whole schedule.
  // Building this once avoids O(classes × days) Map copies in the inner loop.
  const groupPairs = new Map<string, Set<string>>();
  for (const group of groups ?? []) {
    if (group.parallelGroup) {
      if (!groupPairs.has(group.name)) groupPairs.set(group.name, new Set());
      groupPairs.get(group.name)!.add(group.parallelGroup);
    }
  }
  for (const [, classDays] of Object.entries(schedule)) {
    for (const day of DAYS) {
      for (const n of LESSON_NUMBERS) {
        const lessons = classDays[day]?.[n]?.lessons ?? [];
        const groupsInSlot = [...new Set(
          lessons.map(l => l.group).filter((g): g is string => Boolean(g))
        )];
        if (groupsInSlot.length >= 2) {
          for (const g of groupsInSlot) {
            for (const other of groupsInSlot) {
              if (g !== other) {
                if (!groupPairs.has(g)) groupPairs.set(g, new Set());
                groupPairs.get(g)!.add(other);
              }
            }
          }
        }
      }
    }
  }

  for (const [className, days] of Object.entries(schedule)) {
    if (excludeClasses?.has(className)) continue;
    for (const day of DAYS) {
      // Class-level gaps
      const occupied = LESSON_NUMBERS.filter(
        n => (days[day]?.[n]?.lessons?.length ?? 0) > 0
      );
      if (occupied.length >= 2) {
        const min = occupied[0];
        const max = occupied[occupied.length - 1];
        for (const n of LESSON_NUMBERS) {
          if (n > min && n < max && !occupied.includes(n)) {
            gaps.push({ type: 'class', name: className, day, lessonNum: n });
          }
        }
      }

      if (groupPairs.size === 0) continue; // No paired groups known — skip group-gap checks.

      // Z28-1/Z32: Group-level gaps — report when a single-group slot S leaves the absent
      // partner group sandwiched: the partner must have a lesson (class-wide OR their own group)
      // both BEFORE and AFTER slot S on the same day.
      //
      // This handles the case of two consecutive different-group slots (e.g. slot 5 = В.Е.,
      // slot 6 = Ю.И.) where neither is "full-class" — Ю.И. still has a window at slot 5
      // because Ю.И. has class-wide lessons before (1-4) and their own lesson after (slot 6).
      for (const n of LESSON_NUMBERS) {
        const lessons = days[day]?.[n]?.lessons ?? [];
        if (lessons.length === 0) continue;
        if (lessons.some(l => !l.group)) continue; // Full-class slot — skip.

        const groupsAtSlot = new Set(
          lessons.map(l => l.group).filter((g): g is string => Boolean(g))
        );
        if (groupsAtSlot.size !== 1) continue; // Two or more groups present — full-class, skip.

        const [presentGroup] = groupsAtSlot;
        const partners = groupPairs.get(presentGroup);
        if (!partners) continue; // No known partner for this group — skip.

        // Report a window for each absent partner if the partner has a lesson
        // (class-wide OR the partner's own group) both before AND after slot n.
        for (const partner of partners) {
          const hasBefore = LESSON_NUMBERS.some(m => {
            if (m >= n) return false;
            const mLessons = days[day]?.[m]?.lessons ?? [];
            return mLessons.some(l => !l.group) || mLessons.some(l => l.group === partner);
          });
          if (!hasBefore) continue;
          const hasAfter = LESSON_NUMBERS.some(m => {
            if (m <= n) return false;
            const mLessons = days[day]?.[m]?.lessons ?? [];
            return mLessons.some(l => !l.group) || mLessons.some(l => l.group === partner);
          });
          if (!hasAfter) continue;
          gaps.push({ type: 'group', name: partner, day, lessonNum: n });
        }
      }
    }
  }

  return gaps;
}

/**
 * Suggest classes to exclude from gap search based on heuristics:
 * - Names without leading digit (home-schooled students, e.g. "Иванов")
 * - Elementary grades 1-4 (e.g. "1а", "2б")
 */
export function suggestGapExclusions(classNames: string[]): string[] {
  return classNames.filter(name => !/^\d/.test(name) || /^[1-4]\D/.test(name));
}
