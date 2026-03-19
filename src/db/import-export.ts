/**
 * Import/Export functionality
 * Handles JSON and Excel file operations
 */

import * as XLSX from 'xlsx';
import type {
  Teacher,
  Room,
  SchoolClass,
  Group,
  LessonRequirement,
  Version,
  DayBans,
  Day,
  LessonNumber,
} from '@/types';
import { db, getSettings } from './database';
import { replaceAllData, getAllData } from './data';
import { getAllVersions, getVersion } from './versions';
import { inferRoomShortName } from '@/utils/roomUtils';

// ============ JSON Export/Import ============

export const CURRENT_SCHEMA_VERSION = '3.7';

export interface ExportData {
  version: string;
  exportedAt: string;
  teachers: Teacher[];
  rooms: Room[];
  classes: SchoolClass[];
  groups: Group[];
  lessonRequirements: LessonRequirement[];
  scheduleVersions: Version[];
  settings?: {
    gapExcludedClasses?: string[];
    customSubjects?: string[];
  };
}

/** Summary of an export file's contents for preview before import */
export interface ExportSummary {
  version: string;
  exportedAt: string;
  teacherCount: number;
  roomCount: number;
  classCount: number;
  groupCount: number;
  requirementCount: number;
  versionCount: number;
}

/**
 * Migration functions: key is the version to migrate FROM.
 * Each function transforms data to the next version.
 * Example: '3.0' migrates 3.0 → 3.1
 */
const migrations: Record<string, (data: ExportData) => ExportData> = {
  '3.0': (data) => ({
    ...data,
    version: '3.1',
    scheduleVersions: (data.scheduleVersions ?? []).map(v => ({
      ...v,
      temporaryLessons: v.temporaryLessons ?? [],
    })),
  }),
  '3.1': (data) => ({
    ...data,
    version: '3.2',
    // Teacher.defaultRoom is optional — no data transformation needed
  }),
  '3.2': (data) => ({
    ...data,
    version: '3.3',
    // ScheduledLesson.teacher2 is optional — no data transformation needed
  }),
  '3.3': (data) => ({
    ...data,
    version: '3.4',
    // Version.lessonStatuses is optional — no data transformation needed
  }),
  '3.4': (data) => ({
    ...data,
    version: '3.5',
    // Version.daysPerWeek is optional — no data transformation needed
  }),
  '3.5': (data) => ({
    ...data,
    version: '3.6',
    // Teacher.messenger is optional — no data transformation needed
  }),
  '3.6': (data) => ({
    ...data,
    version: '3.7',
    // settings.gapExcludedClasses is now exported — no data transformation needed
  }),
};

/**
 * Parse and validate an export JSON string.
 * Returns the validated data or throws with a user-friendly message.
 */
export function parseExportData(jsonString: string): ExportData {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonString);
  } catch {
    throw new Error('Файл повреждён или имеет неверный формат.');
  }

  const data = raw as ExportData;

  if (!data || typeof data !== 'object') {
    throw new Error('Неизвестный формат файла.');
  }

  if (!data.version) {
    throw new Error('Неизвестный формат файла: отсутствует версия.');
  }

  // Reject files from newer versions
  if (data.version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Этот файл создан в более новой версии приложения (${data.version}). ` +
      `Обновите приложение для открытия этого файла.`
    );
  }

  // Run migration chain if needed
  let migrated = data;
  while (migrated.version !== CURRENT_SCHEMA_VERSION) {
    const migrateFn = migrations[migrated.version];
    if (!migrateFn) {
      throw new Error(
        `Не удалось обновить формат файла с версии ${migrated.version}. ` +
        `Обновите приложение.`
      );
    }
    migrated = migrateFn(migrated);
  }

  return migrated;
}

/**
 * Get a summary of export data for preview before import.
 */
export function getExportSummary(data: ExportData): ExportSummary {
  return {
    version: data.version,
    exportedAt: data.exportedAt,
    teacherCount: data.teachers?.length ?? 0,
    roomCount: data.rooms?.length ?? 0,
    classCount: data.classes?.length ?? 0,
    groupCount: data.groups?.length ?? 0,
    requirementCount: data.lessonRequirements?.length ?? 0,
    versionCount: data.scheduleVersions?.length ?? 0,
  };
}

/**
 * Export all data to JSON
 */
export async function exportToJson(): Promise<string> {
  const data = await getAllData();
  const versions = await getAllVersions();
  const appSettings = await getSettings();

  // Get full version data
  const fullVersions: Version[] = [];
  for (const v of versions) {
    const full = await getVersion(v.id);
    if (full) {
      fullVersions.push(full);
    }
  }

  const exportData: ExportData = {
    version: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    ...data,
    scheduleVersions: fullVersions,
    settings: {
      gapExcludedClasses: appSettings.gapExcludedClasses,
      customSubjects: appSettings.customSubjects,
    },
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Import validated export data into the database.
 * Caller is responsible for creating a backup first.
 */
export async function importFromJson(jsonString: string): Promise<void> {
  const data = parseExportData(jsonString);

  await replaceAllData({
    teachers: data.teachers,
    rooms: data.rooms,
    classes: data.classes,
    groups: data.groups,
    lessonRequirements: data.lessonRequirements,
  });

  // Clear existing versions and import new ones
  await db.versions.clear();
  await db.substitutions.clear();

  for (const version of data.scheduleVersions ?? []) {
    await db.versions.add({
      ...version,
      createdAt: new Date(version.createdAt),
      mondayDate: version.mondayDate ? new Date(version.mondayDate) : undefined,
    });
  }

  // Restore settings (use put to ensure settings exist)
  const activeTemplate = (data.scheduleVersions ?? []).find(v => v.isActiveTemplate);
  const currentSettings = await db.settings.get('default');
  await db.settings.put({
    ...currentSettings,
    id: 'default',
    daysPerWeek: currentSettings?.daysPerWeek ?? 5,
    lessonsPerDay: currentSettings?.lessonsPerDay ?? 8,
    activeTemplateId: activeTemplate?.id ?? null,
    gapExcludedClasses: data.settings?.gapExcludedClasses ?? currentSettings?.gapExcludedClasses,
    customSubjects: data.settings?.customSubjects ?? currentSettings?.customSubjects,
  });
}

/**
 * Download JSON file
 */
export function downloadJson(data: string, filename: string): void {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============ Excel Import ============

/**
 * Parse bans string like "Вт: 1-8, Пт: 1-3"
 */
function parseBans(bansStr: string | undefined): DayBans {
  if (!bansStr || typeof bansStr !== 'string') return {};

  const bans: DayBans = {};
  const parts = bansStr.split(',').map(s => s.trim());

  for (const part of parts) {
    const match = part.match(/^(Пн|Вт|Ср|Чт|Пт):\s*(.+)$/);
    if (!match) continue;

    const day = match[1] as Day;
    const rangeStr = match[2];

    const lessons: LessonNumber[] = [];

    // Parse ranges like "1-8" or "1, 2, 3"
    const ranges = rangeStr.split(/[,\s]+/);
    for (const range of ranges) {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(Number);
        for (let i = start; i <= end; i++) {
          if (i >= 1 && i <= 8) {
            lessons.push(i as LessonNumber);
          }
        }
      } else {
        const num = Number(range);
        if (num >= 1 && num <= 8) {
          lessons.push(num as LessonNumber);
        }
      }
    }

    if (lessons.length > 0) {
      bans[day] = lessons;
    }
  }

  return bans;
}

// ── Typed Excel row interfaces ────────────────────────────────────────────────
// Property names match the expected column headers in data.xlsx.
// Using `unknown` values: XLSX may return string | number | boolean | null.

interface TeacherRow {
  'Фамилия И.О.'?: unknown;
  'ФИО'?: unknown;
  'Имя'?: unknown;
  'Запреты'?: unknown;
  'Предметы'?: unknown;
  'Телефон'?: unknown;
  'Кабинет'?: unknown;
  'Мессенджер'?: unknown;
}

interface RoomRow {
  'Имя для составителя'?: unknown;
  'Название'?: unknown;
  'Кабинет'?: unknown;
  'Для расписания'?: unknown;
  'Короткое'?: unknown;
  'Код'?: unknown;             // alias used by "Данные → Копировать"
  'Вместимость (детей)'?: unknown;
  'Вместимость'?: unknown;
  'Несколько классов (Число)'?: unknown;
  'Несколько классов'?: unknown;
  'Мультикласс'?: unknown;    // alias used by "Данные → Копировать"
}

interface ClassRow {
  'Класс'?: unknown;
  'Название'?: unknown;
  'Число детей'?: unknown;
  'Количество'?: unknown;
}

interface LessonRow {
  'Класс'?: unknown;
  'Класс/Группа'?: unknown;   // alias used by "Данные → Копировать"
  'Предмет'?: unknown;
  'Учитель'?: unknown;
  'Занятий в неделю'?: unknown;
  'Часов в неделю'?: unknown; // alias used by "Данные → Копировать"
  'Количество'?: unknown;
}

interface GroupLessonRow extends LessonRow {
  'Группа'?: unknown;
  'Параллельная группа'?: unknown;
  'Второй учитель'?: unknown;
  'Класс группы'?: unknown;
}

/**
 * Parse Excel workbook and extract data
 * Separated for testability - can be called with a workbook directly
 */
export function parseExcelWorkbook(workbook: XLSX.WorkBook): {
  teachers: Teacher[];
  rooms: Room[];
  classes: SchoolClass[];
  groups: Group[];
  lessonRequirements: LessonRequirement[];
} {

  const teachers: Teacher[] = [];
  const rooms: Room[] = [];
  const classes: SchoolClass[] = [];
  const groups: Group[] = [];
  const lessonRequirements: LessonRequirement[] = [];

  // Parse Teachers sheet (Учителя)
  const teachersSheet = workbook.Sheets['Учителя'];
  if (teachersSheet) {
    const data = XLSX.utils.sheet_to_json<TeacherRow>(teachersSheet);
    const seenTeacherNames = new Set<string>();
    for (const row of data) {
      const name = String(row['Фамилия И.О.'] ?? row['ФИО'] ?? row['Имя'] ?? '').trim();
      if (!name) continue;
      if (seenTeacherNames.has(name)) continue; // skip duplicate names
      seenTeacherNames.add(name);

      teachers.push({
        id: `teacher-${teachers.length + 1}`,
        name,
        bans: parseBans(String(row['Запреты'] ?? '')),
        subjects: String(row['Предметы'] ?? '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        phone: row['Телефон'] ? String(row['Телефон']) : undefined,
        messenger: row['Мессенджер'] ? String(row['Мессенджер']).trim() : undefined,
        defaultRoom: row['Кабинет'] ? String(row['Кабинет']).trim() : undefined,
      });
    }
  }

  // Parse Rooms sheet (Кабинеты)
  const roomsSheet = workbook.Sheets['Кабинеты'];
  if (roomsSheet) {
    const data = XLSX.utils.sheet_to_json<RoomRow>(roomsSheet);
    const seenShortNames = new Set<string>();
    for (const row of data) {
      const fullName = String(
        row['Имя для составителя'] ?? row['Название'] ?? row['Кабинет'] ?? ''
      ).trim();
      if (!fullName) continue;

      const rawShortName = row['Для расписания'] ?? row['Короткое'] ?? row['Код'];
      const shortName = rawShortName
        ? String(rawShortName).trim()
        : (inferRoomShortName(fullName) ?? `-${fullName}-`);
      if (seenShortNames.has(shortName)) continue; // skip duplicate shortNames
      seenShortNames.add(shortName);

      const capacity = row['Вместимость (детей)'] ?? row['Вместимость'];
      const multiClass = row['Несколько классов (Число)'] ?? row['Несколько классов'] ?? row['Мультикласс'];

      rooms.push({
        id: `room-${rooms.length + 1}`,
        fullName,
        shortName,
        capacity: capacity ? Number(capacity) : undefined,
        multiClass: multiClass ? Number(multiClass) : undefined,
      });
    }
  }

  // Resolve teacher defaultRoom: match raw name against room shortName or fullName
  if (rooms.length > 0) {
    const roomByShort = new Map(rooms.map(r => [r.shortName.toLowerCase(), r.shortName]));
    const roomByFull = new Map(rooms.map(r => [r.fullName.toLowerCase(), r.shortName]));
    for (const teacher of teachers) {
      if (teacher.defaultRoom) {
        const raw = teacher.defaultRoom.toLowerCase();
        teacher.defaultRoom = roomByShort.get(raw) ?? roomByFull.get(raw) ?? teacher.defaultRoom;
      }
    }
  }

  // Parse Classes sheet (Классы)
  const classesSheet = workbook.Sheets['Классы'];
  if (classesSheet) {
    const data = XLSX.utils.sheet_to_json<ClassRow>(classesSheet);
    const seenClassNames = new Set<string>();
    for (const row of data) {
      const name = String(row['Класс'] ?? row['Название'] ?? '').trim();
      if (!name) continue;
      if (seenClassNames.has(name)) continue; // skip duplicate class names
      seenClassNames.add(name);

      const studentCount = row['Число детей'] ?? row['Количество'];

      classes.push({
        id: `class-${classes.length + 1}`,
        name,
        studentCount: studentCount ? Number(studentCount) : undefined,
      });
    }
  }

  // Parse Class Lessons sheet (Классные занятия / Список занятий)
  const classLessonsSheet = workbook.Sheets['Классные занятия'] ?? workbook.Sheets['Список занятий'];
  if (classLessonsSheet) {
    const data = XLSX.utils.sheet_to_json<LessonRow>(classLessonsSheet);
    for (const row of data) {
      const className = String(row['Класс'] ?? row['Класс/Группа'] ?? '').trim();
      const subject = String(row['Предмет'] ?? '').trim();
      const teacher = String(row['Учитель'] ?? '').trim();
      const count = Number(row['Занятий в неделю'] ?? row['Часов в неделю'] ?? row['Количество'] ?? 0);

      if (!className || !subject || !teacher || count <= 0) continue;

      lessonRequirements.push({
        id: `req-${lessonRequirements.length + 1}`,
        type: 'class',
        classOrGroup: className,
        subject,
        teacher,
        countPerWeek: count,
      });
    }
  }

  // Parse Group Lessons sheet (Групповые занятия)
  const groupLessonsSheet = workbook.Sheets['Групповые занятия'];
  if (groupLessonsSheet) {
    const data = XLSX.utils.sheet_to_json<GroupLessonRow>(groupLessonsSheet);
    for (const row of data) {
      const groupName = String(row['Группа'] ?? '').trim();
      const subject = String(row['Предмет'] ?? '').trim();
      const teacher = String(row['Учитель'] ?? '').trim();
      const count = Number(row['Занятий в неделю'] ?? row['Количество'] ?? 0);
      const parallelGroup = String(row['Параллельная группа'] ?? '').trim();
      const className = String(row['Класс'] ?? '').trim();

      if (!groupName || !subject || !teacher || count <= 0) continue;

      // Extract index from group name (e.g., "10а(д)" -> "(д)")
      const indexMatch = groupName.match(/\(([^)]+)\)$/);
      const index = indexMatch ? indexMatch[0] : '';

      // Add group if not exists
      const existingGroup = groups.find(g => g.name === groupName);
      if (!existingGroup && className) {
        groups.push({
          id: `group-${groups.length + 1}`,
          name: groupName,
          className,
          index,
          parallelGroup: parallelGroup || undefined,
        });
      }

      lessonRequirements.push({
        id: `req-${lessonRequirements.length + 1}`,
        type: 'group',
        classOrGroup: groupName,
        subject,
        teacher,
        countPerWeek: count,
        parallelGroup: parallelGroup || undefined,
        className,
      });
    }
  }

  // Auto-add classes referenced by group lessons but missing from Классы sheet
  const classNames = new Set(classes.map(c => c.name));
  for (const req of lessonRequirements) {
    if (req.type === 'group' && req.className && !classNames.has(req.className)) {
      classNames.add(req.className);
      classes.push({
        id: `class-${classes.length + 1}`,
        name: req.className,
      });
    }
  }

  return { teachers, rooms, classes, groups, lessonRequirements };
}

/**
 * Parse Excel file and extract data
 */
export async function parseExcelFile(file: File): Promise<{
  teachers: Teacher[];
  rooms: Room[];
  classes: SchoolClass[];
  groups: Group[];
  lessonRequirements: LessonRequirement[];
}> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  return parseExcelWorkbook(workbook);
}

/**
 * Import data from Excel file
 */
export async function importFromExcel(file: File): Promise<void> {
  const data = await parseExcelFile(file);
  await replaceAllData(data);
}

// ============ File Picker Helpers ============

/**
 * Open file picker for JSON import
 */
export function pickJsonFile(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      document.body.removeChild(input);
      resolve(file);
    };

    input.oncancel = () => {
      document.body.removeChild(input);
      resolve(null);
    };

    input.click();
  });
}

/**
 * Open file picker for Excel import
 */
export function pickExcelFile(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      document.body.removeChild(input);
      resolve(file);
    };

    // Handle cancel (input loses focus without selecting)
    input.oncancel = () => {
      document.body.removeChild(input);
      resolve(null);
    };

    input.click();
  });
}
