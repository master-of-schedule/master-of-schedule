/**
 * Core entity types: Teachers, Rooms, Classes, Groups
 */

import type { Day, LessonNumber } from './constants';

/**
 * Teacher ban configuration - days and lesson numbers when unavailable
 */
export type DayBans = Partial<Record<Day, LessonNumber[]>>;

/**
 * Teacher entity
 */
export interface Teacher {
  id: string;
  /** Full name, e.g., "Иванова Т.С." */
  name: string;
  /** Lessons when teacher is unavailable */
  bans: DayBans;
  /** Subjects teacher can cover (for substitutions) */
  subjects: string[];
  /** Contact phone (optional) */
  phone?: string;
  /** Default room shortName (auto-assigned when placing lessons) */
  defaultRoom?: string;
  /** Messenger URL or deep link (e.g. https://t.me/username) */
  messenger?: string;
}

/**
 * Room entity
 */
export interface Room {
  id: string;
  /** Full display name, e.g., "114 Иванова" */
  fullName: string;
  /** Short name for schedule display, e.g., "-114-" */
  shortName: string;
  /** Maximum student capacity (undefined = any size) */
  capacity?: number;
  /** How many classes can use simultaneously (default 1) */
  multiClass?: number;
}

/**
 * Class entity
 */
export interface SchoolClass {
  id: string;
  /** Class name, e.g., "10а" */
  name: string;
  /** Number of students (for room capacity matching) */
  studentCount?: number;
  /** Class belongs to a partner school — placed at end of grid, conflicts shown in grey */
  isPartner?: boolean;
}

/**
 * Group entity - a subset of a class
 */
export interface Group {
  id: string;
  /** Full group name, e.g., "10а(д)" */
  name: string;
  /** Parent class name, e.g., "10а" */
  className: string;
  /** Group index within class, e.g., "(д)" */
  index: string;
  /** Parallel group that can be scheduled at same time */
  parallelGroup?: string;
}
