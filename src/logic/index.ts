/**
 * Logic module - pure business logic functions
 * No React, no side effects, no DOM
 */

// ScheduledLesson factory
export { createScheduledLesson } from './createScheduledLesson';

// Schedule manipulation
export {
  getSlotLessons,
  isSlotOccupied,
  getLessonAt,
  createEmptySlot,
  createEmptyDaySchedule,
  createEmptyClassSchedule,
  createEmptySchedule,
  normalizeSchedule,
  addLessonToSlot,
  removeLessonFromSlot,
  updateLessonRoom,
  replaceLessonInSlot,
  cloneSchedule,
  schedulesEqual,
  isSlotDifferentFromTemplate,
  hasSlotRoomChange,
  isTeacherSlotChanged,
  computeChangedCells,
  computeTeacherChangedCells,
} from './schedule';

// Validation and conflict detection
export {
  isTeacherBanned,
  getTeacherConflict,
  isTeacherFree,
  canLessonsCoexist,
  canAssignLesson,
  getCellStatus,
  validateSchedule,
  findGaps,
  suggestGapExclusions,
} from './validation';
export type { AssignmentCheckResult, ScheduleConflict, ScheduleGap } from './validation';

// Counting and progress
export {
  getLessonKey,
  getScheduledCounts,
  getUnscheduledLessons,
  getTotalUnscheduledCount,
  isClassFullyScheduled,
  getClassProgress,
  getLessonsPerDay,
  getTeacherLessonsPerDay,
  getTeachersOnDay,
  getTeacherLessonsOnDay,
  getRoomLessonsOnDay,
  mergeWithTemporaryLessons,
} from './counting';
export type { ClassProgress } from './counting';

// Schedule traversal
export { forEachSlot, forEachSlotAt } from './traversal';

// Telegram image export
export {
  getChangedClassesData,
  getTeacherChangesOnDay,
  getTeacherImageData,
  getAbsentTeachersData,
  getReplacementEntries,
  renderClassesImage,
  renderTeachersImage,
  renderAbsentImage,
  buildReplacementsImage,
  downloadCanvasAsPng,
  saveCanvasPngToFolder,
} from './export-image';
export type { ClassesImageData, TeacherImageData, TeacherChangeDetail, ReplacementEntry } from './export-image';

// Availability
export {
  getOccupiedRooms,
  getAvailableRooms,
  isRoomAvailable,
  getAvailableLessonsForSlot,
  getSubstituteTeachers,
  getFreeTeachersAtSlot,
  getTeacherClassesAtTime,
} from './availability';
export type { AvailableLessonsResult } from './availability';

// Export grid map builders
export { buildTeacherScheduleMap, buildRoomScheduleMap } from './exportMaps';
export type { ScheduleEntry, ScheduleMap } from './exportMaps';

// Partner availability
export {
  generatePartnerAvailability,
  parsePartnerFile,
  computeMatchedTeachers,
  buildPartnerBusySet,
} from './partner';

