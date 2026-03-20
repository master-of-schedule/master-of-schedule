/**
 * Version management operations
 * CRUD for schedule versions (Technical, Template, Weekly)
 */

import { db, updateSettings } from './database';
import type { Version, VersionType, VersionListItem, Schedule, Substitution, LessonRequirement } from '@/types';

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new version
 */
export async function createVersion(params: {
  name: string;
  type: VersionType;
  schedule: Schedule;
  substitutions?: Substitution[];
  temporaryLessons?: LessonRequirement[];
  lessonStatuses?: Record<string, 'sick' | 'completed'>;
  acknowledgedConflictKeys?: string[];
  comment?: string;
  mondayDate?: Date;
  baseTemplateId?: string;
  daysPerWeek?: number;
}): Promise<Version> {
  const version: Version = {
    id: generateId(),
    name: params.name,
    type: params.type,
    createdAt: new Date(),
    schedule: params.schedule,
    substitutions: params.substitutions ?? [],
    temporaryLessons: params.temporaryLessons ?? [],
    lessonStatuses: params.lessonStatuses,
    acknowledgedConflictKeys: params.acknowledgedConflictKeys,
    comment: params.comment,
    mondayDate: params.mondayDate,
    isActiveTemplate: false,
    baseTemplateId: params.baseTemplateId,
    daysPerWeek: params.daysPerWeek,
  };

  await db.versions.add(version);
  return version;
}

/**
 * Get a version by ID
 */
export async function getVersion(id: string): Promise<Version | undefined> {
  return db.versions.get(id);
}

/**
 * Get all versions of a specific type
 */
export async function getVersionsByType(type: VersionType): Promise<VersionListItem[]> {
  const versions = await db.versions
    .where('type')
    .equals(type)
    .reverse()
    .sortBy('createdAt');

  return versions.map(v => ({
    id: v.id,
    name: v.name,
    type: v.type,
    createdAt: v.createdAt,
    comment: v.comment,
    mondayDate: v.mondayDate,
    isActiveTemplate: v.isActiveTemplate,
    baseTemplateId: v.baseTemplateId,
  }));
}

/**
 * Get all versions (for listing)
 */
export async function getAllVersions(): Promise<VersionListItem[]> {
  const versions = await db.versions.reverse().sortBy('createdAt');

  return versions.map(v => ({
    id: v.id,
    name: v.name,
    type: v.type,
    createdAt: v.createdAt,
    comment: v.comment,
    mondayDate: v.mondayDate,
    isActiveTemplate: v.isActiveTemplate,
    baseTemplateId: v.baseTemplateId,
  }));
}

/**
 * Update a version's schedule
 */
export async function updateVersionSchedule(
  id: string,
  schedule: Schedule,
  substitutions?: Substitution[],
  temporaryLessons?: LessonRequirement[],
  lessonStatuses?: Record<string, 'sick' | 'completed'>,
  acknowledgedConflictKeys?: string[]
): Promise<void> {
  const updates: Partial<Version> = { schedule };
  if (substitutions !== undefined) {
    updates.substitutions = substitutions;
  }
  if (temporaryLessons !== undefined) {
    updates.temporaryLessons = temporaryLessons;
  }
  if (lessonStatuses !== undefined) {
    updates.lessonStatuses = lessonStatuses;
  }
  if (acknowledgedConflictKeys !== undefined) {
    updates.acknowledgedConflictKeys = acknowledgedConflictKeys;
  }
  await db.versions.update(id, updates);
}

/**
 * Update a version's metadata (name, comment)
 */
export async function updateVersionMetadata(
  id: string,
  updates: { name?: string; comment?: string }
): Promise<void> {
  await db.versions.update(id, updates);
}

/**
 * Delete a version
 */
export async function deleteVersion(id: string): Promise<void> {
  // If this was the active template, clear the setting
  const version = await db.versions.get(id);
  if (version?.isActiveTemplate) {
    await updateSettings({ activeTemplateId: null });
  }

  await db.versions.delete(id);
}

/**
 * Set a template as active (only one can be active)
 */
export async function setActiveTemplate(id: string): Promise<void> {
  await db.transaction('rw', db.versions, db.settings, async () => {
    // Clear any existing active template
    const activeTemplates = await db.versions
      .filter(v => v.isActiveTemplate === true)
      .toArray();

    for (const template of activeTemplates) {
      await db.versions.update(template.id, { isActiveTemplate: false });
    }

    // Set new active template
    await db.versions.update(id, { isActiveTemplate: true });
    await updateSettings({ activeTemplateId: id });
  });
}

/**
 * Get the active template
 */
export async function getActiveTemplate(): Promise<Version | undefined> {
  const templates = await db.versions
    .filter(v => v.isActiveTemplate === true)
    .toArray();

  return templates[0];
}

/**
 * Clear active template
 */
export async function clearActiveTemplate(): Promise<void> {
  await db.transaction('rw', db.versions, db.settings, async () => {
    const activeTemplates = await db.versions
      .filter(v => v.isActiveTemplate === true)
      .toArray();

    for (const template of activeTemplates) {
      await db.versions.update(template.id, { isActiveTemplate: false });
    }

    await updateSettings({ activeTemplateId: null });
  });
}

/**
 * Duplicate a version with new name and optionally different type
 */
export async function duplicateVersion(
  sourceId: string,
  newName: string,
  newType?: VersionType,
  mondayDate?: Date,
  baseTemplateId?: string,
  daysPerWeek?: number
): Promise<Version> {
  const source = await db.versions.get(sourceId);
  if (!source) {
    throw new Error(`Version not found: ${sourceId}`);
  }

  // When creating a weekly from a template, save the template ID for diff highlighting
  const templateId = newType === 'weekly' && source.type === 'template'
    ? sourceId
    : baseTemplateId;

  // Acknowledged conflicts are not inherited: the new version starts fresh,
  // requiring the user to acknowledge any ban violations on first open.
  return createVersion({
    name: newName,
    type: newType ?? source.type,
    schedule: JSON.parse(JSON.stringify(source.schedule)), // Deep clone
    substitutions: source.substitutions.map(s => ({ ...s })),
    temporaryLessons: source.temporaryLessons?.map(l => ({ ...l })),
    comment: source.comment,
    mondayDate: newType === 'weekly' ? mondayDate : source.mondayDate,
    baseTemplateId: templateId,
    daysPerWeek: newType === 'weekly' ? daysPerWeek : source.daysPerWeek,
  });
}
