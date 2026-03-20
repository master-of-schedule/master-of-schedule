/**
 * Version management types
 */

import type { VersionType } from './constants';
import type { Schedule, LessonRequirement } from './schedule';
import type { Substitution } from './substitutions';

/**
 * Saved schedule version
 */
export interface Version {
  id: string;
  /** User-provided name/comment */
  name: string;
  /** Schedule type: technical, template, or weekly */
  type: VersionType;
  /** When this version was saved */
  createdAt: Date;
  /** Optional comment */
  comment?: string;
  /** For weekly type: the Monday date */
  mondayDate?: Date;
  /** For template type: whether this is the active template */
  isActiveTemplate?: boolean;
  /** For weekly type: ID of the base template used for diff highlighting */
  baseTemplateId?: string;
  /** Number of days to show in the grid (5 or 6). Falls back to global school week setting. */
  daysPerWeek?: number;
  /** The actual schedule data */
  schedule: Schedule;
  /** Substitution records */
  substitutions: Substitution[];
  /** Temporary extra lessons for this version only (not in master requirements) */
  temporaryLessons?: LessonRequirement[];
  /** Per-lesson statuses: 'sick' (gray, teacher on sick leave) or 'completed' (held elsewhere, hidden) */
  lessonStatuses?: Record<string, 'sick' | 'completed'>;
  /**
   * Acknowledged conflict keys for this version.
   * Conflicts acknowledged here are suppressed in the Check panel and persist across sessions.
   * Key format: `${type}|${day}|${lessonNum}|${details}`
   * Cleared automatically when the lesson is removed or moved (slot reassigned).
   */
  acknowledgedConflictKeys?: string[];
}

/**
 * Version list item (without full schedule data)
 */
export interface VersionListItem {
  id: string;
  name: string;
  type: VersionType;
  createdAt: Date;
  comment?: string;
  mondayDate?: Date;
  isActiveTemplate?: boolean;
  baseTemplateId?: string;
  daysPerWeek?: number;
}
