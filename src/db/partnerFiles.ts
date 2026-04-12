/**
 * Partner files persistence layer
 * Stores the singleton partner availability file in IndexedDB
 */

import { db } from './database';

/**
 * Get the stored partner file JSON, or null if none saved
 */
export async function getPartnerFileJson(): Promise<string | null> {
  const record = await db.partnerFiles.get('current');
  return record?.json ?? null;
}

/**
 * Get the serialised Schedule snapshot for partner classes saved at import time,
 * or null if not present.
 */
export async function getSavedPartnerScheduleJson(): Promise<string | null> {
  const record = await db.partnerFiles.get('current');
  return record?.savedPartnerScheduleJson ?? null;
}

/**
 * Save (upsert) partner file JSON with id='current'.
 * Optionally persists the serialised partner-class schedule snapshot for restore.
 */
export async function savePartnerFileToDB(
  json: string,
  savedPartnerScheduleJson?: string
): Promise<void> {
  await db.partnerFiles.put({ id: 'current', json, importedAt: new Date(), savedPartnerScheduleJson });
}

/**
 * Remove the stored partner file
 */
export async function clearPartnerFileFromDB(): Promise<void> {
  await db.partnerFiles.delete('current');
}
