/**
 * Pure data-builder functions for Telegram image export.
 * Canvas rendering lives in export-image.ts which re-exports everything from here.
 */

import type { Schedule, ScheduledLesson, Day, LessonNumber, Teacher } from '@/types';
import { LESSON_NUMBERS } from '@/types';
import { isSlotDifferentFromTemplate, hasSlotRoomChange, isTeacherSlotChanged } from './schedule';
import { extractGroupIndex, formatRoom, compareClassNames } from '@/utils/formatLesson';
import type { ScheduleMap } from './exportMaps';

// ─── Internal helpers ─────────────────────────────────────────

/**
 * True if a slot differs structurally OR has a room-only change — used for export detection.
 * Exported so it can be unit-tested directly.
 */
export function isSlotChangedForExport(
  current: ScheduledLesson[],
  template: ScheduledLesson[],
): boolean {
  return isSlotDifferentFromTemplate(current, template) || hasSlotRoomChange(current, template);
}

/**
 * Format a cell's lessons into display text for the classes image.
 * Same format as TSV export: "Subject (group) Teacher -Room-"
 * Exported so it can be unit-tested directly.
 */
export function formatCellLessons(lessons: ScheduledLesson[]): string {
  return lessons.map(lesson => {
    const group = extractGroupIndex(lesson.group);
    const teacherStr = lesson.teacher2
      ? `${lesson.teacher} / ${lesson.teacher2}`
      : lesson.teacher;
    let result = lesson.subject;
    if (group) result += ` (${group})`;
    result += ` ${teacherStr}`;
    result += ` ${formatRoom(lesson.room)}`;
    return result;
  }).join('\n');
}

// ─── Data types ───────────────────────────────────────────────

export interface ClassesImageCell {
  text: string;       // "Физика (д) Иванова Т.С. -114-"
  isChanged: boolean;
}

export interface ClassesImageData {
  columns: string[];              // class names with changes
  lessonNumbers: LessonNumber[];  // trimmed (no trailing empty rows)
  cells: ClassesImageCell[][];    // [lessonIndex][classIndex]
}

export interface TeacherChange {
  teacher: string;
  classes: string[];   // ["5а", "7б", "11в"] — deduplicated, sorted
}

export interface TeacherImageData {
  changes: TeacherChange[];
}

/** Detailed teacher change entry for the UI text list (includes lesson numbers + group). */
export interface TeacherChangeDetail {
  teacher: string;
  changes: Array<{
    className: string;
    group?: string;
    lessonNum: LessonNumber;
    /** True when the teacher's lesson from the template is completely gone in the weekly schedule */
    isCancelled?: boolean;
    /** Subject from template — set for cancelled entries so the label can show it */
    subject?: string;
  }>;
}

// ─── Data preparation (pure, testable) ────────────────────────

/**
 * Get teachers with changes on a day for the UI text list view.
 * Unlike getTeacherImageData, this includes lesson numbers + group, and
 * correctly catches REMOVED lessons by also walking the template schedule.
 */
export function getTeacherChangesOnDay(
  schedule: Schedule,
  baseTemplateSchedule: Schedule,
  teacherSchedule: ScheduleMap,
  teacherNames: string[],
  day: Day,
): TeacherChangeDetail[] {
  const allClassNames = [...new Set([
    ...Object.keys(schedule),
    ...Object.keys(baseTemplateSchedule),
  ])];

  const result: TeacherChangeDetail[] = [];

  for (const teacherName of teacherNames) {
    const changes: TeacherChangeDetail['changes'] = [];
    const seenSlots = new Set<string>();

    // Step 1: Walk current weekly schedule (catches additions + modifications)
    for (const lessonNum of LESSON_NUMBERS) {
      const entries = teacherSchedule[teacherName]?.[day]?.[lessonNum] ?? [];
      for (const { className, lesson } of entries) {
        const current = schedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
        const template = baseTemplateSchedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
        // Per-teacher check: only report change if *this teacher's* lessons changed
        if (isTeacherSlotChanged(current, template, teacherName)) {
          const slotKey = `${className}|${lessonNum}`;
          if (!seenSlots.has(slotKey)) {
            seenSlots.add(slotKey);
            changes.push({ className, group: lesson.group, lessonNum });
          }
        }
      }
    }

    // Step 2: Walk template schedule to catch removed lessons.
    // Per-teacher check: teacher is "cancelled" only if their own lesson is
    // absent from the current schedule, regardless of what other teachers in
    // the same slot (parallel groups) are doing (Z29-3).
    for (const lessonNum of LESSON_NUMBERS) {
      for (const className of allClassNames) {
        const slotKey = `${className}|${lessonNum}`;
        if (seenSlots.has(slotKey)) continue;
        const templateLessons = baseTemplateSchedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
        const teacherLesson = templateLessons.find(
          l => l.teacher === teacherName || l.teacher2 === teacherName,
        );
        if (!teacherLesson) continue;
        const currentLessons = schedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
        const teacherStillPresent = currentLessons.some(
          l => l.teacher === teacherName || l.teacher2 === teacherName,
        );
        if (!teacherStillPresent) {
          seenSlots.add(slotKey);
          changes.push({
            className,
            group: teacherLesson.group,
            lessonNum,
            isCancelled: true,
            subject: teacherLesson.subject,
          });
        }
      }
    }

    if (changes.length > 0) result.push({ teacher: teacherName, changes });
  }

  return result.sort((a, b) => a.teacher.localeCompare(b.teacher, 'ru'));
}

/**
 * Get data for the classes image: grid of changed classes on a given day.
 * Filters to only classes with at least one changed cell; trims trailing empty rows.
 */
export function getChangedClassesData(
  schedule: Schedule,
  baseTemplateSchedule: Schedule,
  classNames: string[],
  day: Day,
): ClassesImageData {
  // Find classes with at least one change on this day, sorted numerically (5а before 11в)
  const changedClasses = classNames.filter(className => {
    for (const lessonNum of LESSON_NUMBERS) {
      const current = schedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
      const template = baseTemplateSchedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
      if (isSlotChangedForExport(current, template)) return true;
    }
    return false;
  }).sort(compareClassNames);

  // Build cell data for all 8 lessons × changed classes
  const allCells: ClassesImageCell[][] = LESSON_NUMBERS.map(lessonNum =>
    changedClasses.map(className => {
      const current = schedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
      const template = baseTemplateSchedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
      return {
        text: formatCellLessons(current),
        isChanged: isSlotChangedForExport(current, template),
      };
    })
  );

  // Trim trailing empty rows (where ALL cells have empty text)
  let lastNonEmptyRow = allCells.length - 1;
  while (lastNonEmptyRow >= 0) {
    const rowHasContent = allCells[lastNonEmptyRow].some(cell => cell.text !== '');
    if (rowHasContent) break;
    lastNonEmptyRow--;
  }

  const trimmedCells = allCells.slice(0, lastNonEmptyRow + 1);
  const trimmedLessonNumbers = LESSON_NUMBERS.slice(0, lastNonEmptyRow + 1);

  return {
    columns: changedClasses,
    lessonNumbers: trimmedLessonNumbers as LessonNumber[],
    cells: trimmedCells,
  };
}

/**
 * Get data for the teachers image: list of teachers with changes.
 * Includes teachers from both current schedule AND template (to catch removed lessons).
 * Excludes absent teachers.
 */
export function getTeacherImageData(
  schedule: Schedule,
  baseTemplateSchedule: Schedule,
  _teachers: Record<string, Teacher>,
  day: Day,
  absentTeachers: string[],
): TeacherImageData {
  const absentSet = new Set(absentTeachers);
  const allClassNames = [...new Set([
    ...Object.keys(schedule),
    ...Object.keys(baseTemplateSchedule),
  ])];

  // Build a map: teacher -> Set<className> for changed slots
  const teacherClassesMap = new Map<string, Set<string>>();

  for (const className of allClassNames) {
    for (const lessonNum of LESSON_NUMBERS) {
      const current = schedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
      const template = baseTemplateSchedule[className]?.[day]?.[lessonNum]?.lessons ?? [];

      // Collect unique teachers from both sides
      const allTeachersInSlot = new Set<string>();
      for (const lesson of [...current, ...template]) {
        allTeachersInSlot.add(lesson.teacher);
        if (lesson.teacher2) allTeachersInSlot.add(lesson.teacher2);
      }

      // Per-teacher: only add if *this teacher's* lessons changed (fixes false highlight for group lessons)
      for (const teacher of allTeachersInSlot) {
        if (absentSet.has(teacher)) continue;
        if (isTeacherSlotChanged(current, template, teacher)) {
          if (!teacherClassesMap.has(teacher)) teacherClassesMap.set(teacher, new Set());
          teacherClassesMap.get(teacher)!.add(className);
        }
      }
    }
  }

  // Format changes: just class names, deduplicated, sorted
  const changes: TeacherChange[] = [];
  for (const [teacher, classSet] of teacherClassesMap) {
    const classes = [...classSet].sort(compareClassNames);
    changes.push({ teacher, classes });
  }
  changes.sort((a, b) => a.teacher.localeCompare(b.teacher, 'ru'));

  return { changes };
}

/**
 * Get list of absent (free) teachers: have lessons in template but none in weekly schedule.
 * Excludes teachers already marked as absent.
 */
export function getAbsentTeachersData(
  schedule: Schedule,
  baseTemplateSchedule: Schedule,
  teachers: Record<string, Teacher>,
  day: Day,
  absentTeachers: string[],
): string[] {
  const absentSet = new Set(absentTeachers);
  const allClassNames = [...new Set([
    ...Object.keys(schedule),
    ...Object.keys(baseTemplateSchedule),
  ])];

  const result: string[] = [];
  const teacherNames = Object.keys(teachers);

  for (const teacherName of teacherNames) {
    if (absentSet.has(teacherName)) continue;

    let hasTemplateLesson = false;
    let hasWeeklyLesson = false;

    for (const className of allClassNames) {
      for (const lessonNum of LESSON_NUMBERS) {
        const templateLessons = baseTemplateSchedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
        for (const l of templateLessons) {
          if (l.teacher === teacherName || l.teacher2 === teacherName) {
            hasTemplateLesson = true;
          }
        }
        const currentLessons = schedule[className]?.[day]?.[lessonNum]?.lessons ?? [];
        for (const l of currentLessons) {
          if (l.teacher === teacherName || l.teacher2 === teacherName) {
            hasWeeklyLesson = true;
          }
        }
      }
      if (hasTemplateLesson && hasWeeklyLesson) break;
    }

    if (hasTemplateLesson && !hasWeeklyLesson) {
      result.push(teacherName);
    }
  }

  result.sort((a, b) => a.localeCompare(b, 'ru'));
  return result;
}


export interface ReplacementEntry {
  className: string;
  day: Day;
  lessonNum: LessonNumber;
  subject: string;
  /** Original teacher being replaced; undefined for extra (temporary) compensation lessons */
  originalTeacher?: string;
  replacementTeacher: string;
  /** True when paid by the union (профсоюз), not the budget */
  isUnionSubstitution?: boolean;
}

/**
 * Get all substitution entries for a given day: lessons where originalTeacher is set
 * or isSubstitution is true (compensation lessons created via AddTemporaryLessonModal).
 * Sorted by className, then lessonNum.
 */
export function getReplacementEntries(
  schedule: Schedule,
  day: Day,
): ReplacementEntry[] {
  const entries: ReplacementEntry[] = [];

  for (const [className, days] of Object.entries(schedule)) {
    for (const lessonNum of LESSON_NUMBERS) {
      const lessons = days[day]?.[lessonNum]?.lessons ?? [];
      for (const lesson of lessons) {
        if (lesson.originalTeacher || lesson.isSubstitution) {
          entries.push({
            className,
            day,
            lessonNum,
            subject: lesson.subject,
            ...(lesson.originalTeacher ? { originalTeacher: lesson.originalTeacher } : {}),
            replacementTeacher: lesson.teacher,
            ...(lesson.isUnionSubstitution ? { isUnionSubstitution: true } : {}),
          });
        }
      }
    }
  }

  // Sort by className, then lessonNum
  return entries.sort((a, b) => {
    const cmp = a.className.localeCompare(b.className, 'ru');
    if (cmp !== 0) return cmp;
    return a.lessonNum - b.lessonNum;
  });
}
