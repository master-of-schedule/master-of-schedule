/**
 * Partner availability logic
 * Pure functions for generating, parsing, and querying partner busy slots
 */

import type { Schedule, Day, LessonNumber, VersionType } from '@/types';
import { DAYS, LESSON_NUMBERS } from '@/types';
import type { PartnerAvailabilityFile } from '@/types/partner';

/**
 * Walk a schedule and collect busy slots per teacher (teacher + teacher2).
 * Returns a PartnerAvailabilityFile with no class/subject content.
 */
export function generatePartnerAvailability(
  schedule: Schedule,
  versionMeta: { name: string; type: VersionType; mondayDate?: Date },
  options?: { excludeClasses?: Set<string> }
): PartnerAvailabilityFile {
  const slots: Record<string, Array<{ day: Day; lesson: LessonNumber }>> = {};

  for (const [className, classSchedule] of Object.entries(schedule)) {
    if (options?.excludeClasses?.has(className)) continue;
    for (const day of DAYS) {
      const daySchedule = classSchedule[day];
      if (!daySchedule) continue;
      for (const lessonNum of LESSON_NUMBERS) {
        const slot = daySchedule[lessonNum];
        if (!slot?.lessons?.length) continue;
        for (const lesson of slot.lessons) {
          for (const teacherName of [lesson.teacher, lesson.teacher2].filter(Boolean) as string[]) {
            if (!slots[teacherName]) slots[teacherName] = [];
            // Only add if not already present (multiple classes can share a teacher)
            const already = slots[teacherName].some(s => s.day === day && s.lesson === lessonNum);
            if (!already) {
              slots[teacherName].push({ day, lesson: lessonNum });
            }
          }
        }
      }
    }
  }

  return {
    formatVersion: '1',
    exportedAt: new Date().toISOString(),
    versionType: versionMeta.type,
    versionName: versionMeta.name,
    mondayDate: versionMeta.mondayDate ? versionMeta.mondayDate.toISOString().split('T')[0] : undefined,
    slots,
  };
}

/**
 * Parse + validate partner JSON string.
 * Throws a user-friendly error string if the JSON is invalid or missing required fields.
 */
export function parsePartnerFile(json: string): PartnerAvailabilityFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Файл не является корректным JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Файл должен содержать JSON-объект');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.formatVersion !== '1') {
    throw new Error(
      obj.formatVersion === undefined
        ? 'Файл не является файлом занятости (отсутствует formatVersion)'
        : `Неподдерживаемая версия формата: ${obj.formatVersion}`
    );
  }

  if (typeof obj.exportedAt !== 'string') {
    throw new Error('Отсутствует поле exportedAt');
  }

  if (typeof obj.versionName !== 'string') {
    throw new Error('Отсутствует поле versionName');
  }

  if (typeof obj.versionType !== 'string') {
    throw new Error('Отсутствует поле versionType');
  }

  if (typeof obj.slots !== 'object' || obj.slots === null || Array.isArray(obj.slots)) {
    throw new Error('Отсутствует или некорректно поле slots');
  }

  return obj as unknown as PartnerAvailabilityFile;
}

/**
 * Compute the intersection of partner teacher names and our teacher names.
 * Returns a Set of teacher names that exist in both systems.
 */
export function computeMatchedTeachers(
  partnerSlots: Record<string, unknown>,
  ourTeacherNames: string[]
): Set<string> {
  return new Set(ourTeacherNames.filter(n => partnerSlots[n] !== undefined));
}

/**
 * Build a Set<"teacherName|day|lesson"> for O(1) busy lookup.
 * Only includes teachers in matchedTeachers.
 */
export function buildPartnerBusySet(
  file: PartnerAvailabilityFile,
  matchedTeachers: Set<string>
): Set<string> {
  const busySet = new Set<string>();

  for (const [teacherName, slots] of Object.entries(file.slots)) {
    if (!matchedTeachers.has(teacherName)) continue;
    for (const { day, lesson } of slots) {
      busySet.add(`${teacherName}|${day}|${lesson}`);
    }
  }

  return busySet;
}
