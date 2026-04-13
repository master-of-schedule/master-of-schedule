/**
 * Database module - IndexedDB persistence layer
 */

// Database setup
export { db, TimetableDatabase, initializeDatabase, clearDatabase, getSettings, updateSettings } from './database';
export type { AppSettings, StoredPartnerFile } from './database';

// Partner files persistence
export { getPartnerFileJson, getSavedPartnerScheduleJson, savePartnerFileToDB, clearPartnerFileFromDB } from './partnerFiles';

// Version management
export {
  createVersion,
  getVersion,
  getVersionsByType,
  getAllVersions,
  updateVersionSchedule,
  updateVersionMetadata,
  deleteVersion,
  setActiveTemplate,
  getActiveTemplate,
  clearActiveTemplate,
  duplicateVersion,
} from './versions';

// Data operations
export {
  // Teachers
  getAllTeachers,
  getTeacher,
  getTeacherByName,
  addTeacher,
  updateTeacher,
  deleteTeacher,
  bulkAddTeachers,
  clearTeachers,
  // Rooms
  getAllRooms,
  getRoom,
  getRoomByShortName,
  addRoom,
  updateRoom,
  deleteRoom,
  bulkAddRooms,
  clearRooms,
  // Classes
  getAllClasses,
  getClass,
  addClass,
  updateClass,
  deleteClass,
  bulkAddClasses,
  clearClasses,
  // Groups
  getAllGroups,
  getGroupsByClass,
  getGroup,
  addGroup,
  updateGroup,
  deleteGroup,
  bulkAddGroups,
  clearGroups,
  // Lesson Requirements
  getAllLessonRequirements,
  getLessonRequirementsByClass,
  getLessonRequirementsByTeacher,
  getLessonRequirement,
  addLessonRequirement,
  updateLessonRequirement,
  deleteLessonRequirement,
  bulkAddLessonRequirements,
  clearLessonRequirements,
  // Bulk operations
  replaceAllData,
  getAllData,
} from './data';

// Cascade rename operations
export {
  cascadeTeacherRename,
  cascadeRoomRename,
  cascadeClassRename,
  cascadeGroupRenameInVersions,
  cascadeSubjectRename,
} from './cascade';

// Import/Export
export {
  exportToJson,
  importFromJson,
  downloadJson,
  saveJsonStringToFolder,
  parseExcelFile,
  importFromExcel,
  pickJsonFile,
  pickExcelFile,
} from './import-export';
export type { ExportData } from './import-export';
