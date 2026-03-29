/**
 * IndexedDB database using Dexie
 * Provides persistent storage for all application data
 */

import Dexie, { type EntityTable } from 'dexie';
import type {
  Teacher,
  Room,
  SchoolClass,
  Group,
  LessonRequirement,
  Version,
  Substitution,
} from '@/types';

/**
 * Application settings stored in database
 */
export interface AppSettings {
  id: string;
  daysPerWeek: number;
  lessonsPerDay: number;
  activeTemplateId: string | null;
  customSubjects?: string[];
  gapExcludedClasses?: string[];
}

/**
 * Auto-backup record created before destructive imports
 */
export interface Backup {
  id?: number;
  createdAt: Date;
  reason: string;
  data: string;
}

/**
 * Singleton record storing the partner availability file
 */
export interface StoredPartnerFile {
  id: 'current';
  json: string;
  importedAt: Date;
}

/** Folder purpose IDs for the 4 autosave destinations */
export type DownloadFolderId = 'telegram' | 'deputy' | 'rshp_json' | 'occupancy_json';

/**
 * Singleton record storing the user's preferred download folder.
 * The FileSystemDirectoryHandle is structured-cloneable and can be stored in IDB directly.
 * Four separate records are stored, one per DownloadFolderId.
 */
export interface StoredDownloadFolder {
  id: DownloadFolderId;
  handle: FileSystemDirectoryHandle;
  folderName: string; // handle.name snapshot for display without async
  savedAt: Date;
}

/**
 * Snapshot of a complete academic year's data, stored for past-year viewing
 */
export interface YearSnapshot {
  id?: number;       // auto-increment
  createdAt: Date;
  yearLabel: string; // e.g. "2024-2025"
  data: string;      // full ExportData JSON string
}

/**
 * Timetable Editor Database Schema
 */
export class TimetableDatabase extends Dexie {
  teachers!: EntityTable<Teacher, 'id'>;
  rooms!: EntityTable<Room, 'id'>;
  classes!: EntityTable<SchoolClass, 'id'>;
  groups!: EntityTable<Group, 'id'>;
  lessonRequirements!: EntityTable<LessonRequirement, 'id'>;
  versions!: EntityTable<Version, 'id'>;
  substitutions!: EntityTable<Substitution, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;
  backups!: EntityTable<Backup, 'id'>;
  partnerFiles!: EntityTable<StoredPartnerFile, 'id'>;
  yearSnapshots!: EntityTable<YearSnapshot, 'id'>;
  downloadFolders!: EntityTable<StoredDownloadFolder, 'id'>;

  constructor() {
    super('TimetableEditor');

    this.version(1).stores({
      teachers: 'id, name',
      rooms: 'id, shortName',
      classes: 'id, name',
      groups: 'id, name, className',
      lessonRequirements: 'id, classOrGroup, teacher, subject, type',
      versions: 'id, type, createdAt, isActiveTemplate',
      substitutions: 'id, date, originalTeacher, replacingTeacher',
      settings: 'id',
    });

    this.version(2).stores({
      backups: '++id, createdAt',
    });

    this.version(3).stores({
      partnerFiles: 'id',
    });

    // NOTE: version 3 is claimed by PARTNER-SYNC (partnerFiles table)
    this.version(4).stores({
      yearSnapshots: '++id, createdAt',
    });

    this.version(5).stores({
      downloadFolders: 'id',
    });
  }
}

/**
 * Singleton database instance
 */
export const db = new TimetableDatabase();

/**
 * Initialize database with default settings if empty
 */
export async function initializeDatabase(): Promise<void> {
  const existingSettings = await db.settings.get('default');

  if (!existingSettings) {
    await db.settings.put({
      id: 'default',
      daysPerWeek: 5,
      lessonsPerDay: 8,
      activeTemplateId: null,
    });
  }
}

/**
 * Clear all data from database (for testing/reset)
 */
export async function clearDatabase(): Promise<void> {
  await db.transaction(
    'rw',
    [db.teachers, db.rooms, db.classes, db.groups, db.lessonRequirements, db.versions, db.substitutions],
    async () => {
      await db.teachers.clear();
      await db.rooms.clear();
      await db.classes.clear();
      await db.groups.clear();
      await db.lessonRequirements.clear();
      await db.versions.clear();
      await db.substitutions.clear();
    }
  );
}

/**
 * Default settings used when no settings exist in the database
 */
const DEFAULT_SETTINGS: AppSettings = {
  id: 'default',
  daysPerWeek: 5,
  lessonsPerDay: 8,
  activeTemplateId: null,
};

/**
 * Get application settings, creating defaults if they don't exist
 */
export async function getSettings(): Promise<AppSettings> {
  const settings = await db.settings.get('default');
  if (!settings) {
    await db.settings.put(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  return settings;
}

/**
 * Update application settings
 */
export async function updateSettings(updates: Partial<Omit<AppSettings, 'id'>>): Promise<void> {
  await db.settings.update('default', updates);
}
