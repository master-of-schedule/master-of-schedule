/**
 * ExportPage - Grid views for copying schedule to spreadsheets
 * Supports three views: Classes, Teachers, Rooms
 */

import { useState, useCallback, useMemo } from 'react';
import { useGridSelection } from '@/hooks/useGridSelection';
import type { GridSelection } from '@/hooks/useGridSelection';
import { useMultiFolders } from '@/hooks/useMultiFolders';
import { FolderSettingsDialog } from './FolderSettingsDialog';
import { useScheduleStore, useDataStore, useUIStore } from '@/stores';
import { DAYS, LESSON_NUMBERS } from '@/types';
import type { Day, LessonNumber } from '@/types';
import { computeChangedCells, computeTeacherChangedCells, getChangedClassesData, getTeacherChangesOnDay, getTeacherImageData, getAbsentTeachersData, getReplacementEntries, renderClassesImage, renderTeachersImage, renderAbsentImage, buildReplacementsImage, downloadCanvasAsPng, saveCanvasPngToFolder, generatePartnerAvailability } from '@/logic';
import { buildTeacherScheduleMap, buildRoomScheduleMap } from '@/logic/exportMaps';
import type { ScheduleEntry } from '@/logic/exportMaps';
import { downloadJson, exportToJson, saveJsonStringToFolder } from '@/db';
import { formatDayFullWithDate } from '@/utils/dateFormat';
import { Button } from '@/components/common/Button';
import { HintBar } from '@/components/common/HintBar';
import { useToast } from '@/components/common/Toast';
import { extractGroupIndex, formatRoom, escapeHtml } from '@/utils/formatLesson';
import styles from './ExportPage.module.css';

// Write both HTML and plain-text to clipboard; falls back to plain text on unsupported browsers
async function writeClipboard(tsv: string, html: string): Promise<void> {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([tsv], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      }),
    ]);
  } catch {
    // Firefox and some environments don't support ClipboardItem — fall back to plain text
    await navigator.clipboard.writeText(tsv);
  }
}

// Full day names for grid display (fallback for non-weekly)
const DAY_FULL_NAMES: Record<string, string> = {
  'Пн': 'Понедельник',
  'Вт': 'Вторник',
  'Ср': 'Среда',
  'Чт': 'Четверг',
  'Пт': 'Пятница',
};

type GridView = 'classes' | 'teachers' | 'rooms';

export function ExportPage() {
  const schedule = useScheduleStore((state) => state.schedule);
  const versionType = useScheduleStore((state) => state.versionType);
  const versionName = useScheduleStore((state) => state.versionName);
  const mondayDate = useScheduleStore((state) => state.mondayDate);
  const baseTemplateSchedule = useScheduleStore((state) => state.baseTemplateSchedule);
  const classes = useDataStore((state) => state.classes);
  const teachers = useDataStore((state) => state.teachers);
  const rooms = useDataStore((state) => state.rooms);
  const substitutions = useScheduleStore((state) => state.substitutions);
  const { showToast } = useToast();

  // Active view state (persisted in store to survive tab switches)
  const activeView = useUIStore((state) => state.exportView);
  const setActiveView = useUIStore((state) => state.setExportView);
  const selectedDay = useUIStore((state) => state.exportSelectedDay);
  const setSelectedDay = useUIStore((state) => state.setExportSelectedDay);

  // Grid selection state
  const { selection, isInSelection, handleGridMouseDown, handleGridMouseMove, handleGridMouseUp, clearSelection } = useGridSelection();

  // Multi-folder management (File System Access API)
  const folders = useMultiFolders();
  const { handles: folderHandles, names: folderNames, isSupported: fsFolderSupported, pickFolder, ensurePermission } = folders;
  const folderHandle = folderHandles['telegram'] ?? null;
  const folderName = folderNames['telegram'] ?? null;
  const [folderSettingsOpen, setFolderSettingsOpen] = useState(false);

  // Get day name with date for weekly schedules
  const getDayName = useCallback((day: string, dayIndex: number): string => {
    if (versionType === 'weekly' && mondayDate) {
      return formatDayFullWithDate(day, mondayDate, dayIndex);
    }
    return DAY_FULL_NAMES[day] || day;
  }, [versionType, mondayDate]);

  const hasSchedule = Object.keys(schedule).length > 0;

  // Build teacher/room schedule maps for grid views
  const teacherSchedule = useMemo(() => buildTeacherScheduleMap(schedule), [schedule]);
  const roomSchedule = useMemo(() => buildRoomScheduleMap(schedule), [schedule]);
  // Base template teacher map — needed to detect removed lessons in teacher export (Z24-1c)
  const baseTeacherSchedule = useMemo(
    () => (baseTemplateSchedule ? buildTeacherScheduleMap(baseTemplateSchedule) : {}),
    [baseTemplateSchedule]
  );

  // Get sorted teacher names
  const teacherNames = useMemo(() => {
    return Object.keys(teachers).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [teachers]);

  // Get sorted room names (short names)
  const roomNames = useMemo(() => {
    return Object.values(rooms).map(r => r.shortName).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [rooms]);

  // Get columns based on active view
  const columns = useMemo(() => {
    switch (activeView) {
      case 'classes':
        return classes.map(c => c.name);
      case 'teachers':
        return teacherNames;
      case 'rooms':
        return roomNames;
    }
  }, [activeView, classes, teacherNames, roomNames]);

  // Day filter is available for all weekly schedules
  const canFilterByDay = versionType === 'weekly' && activeView !== 'rooms';

  // Compute which cells differ from template (for highlighting)
  // Always uses class names so highlighting works in all views
  const classNames = useMemo(() => classes.map(c => c.name), [classes]);
  const changedCells = useMemo(() => {
    if (!baseTemplateSchedule) return new Set<string>();
    return computeChangedCells(schedule, baseTemplateSchedule, classNames);
  }, [classNames, schedule, baseTemplateSchedule]);

  // Z28-2: Per-teacher changed cells — "teacherName|className|day|lessonNum".
  // Avoids false highlights when a different teacher's lesson changed in the same slot.
  const teacherChangedCells = useMemo(() => {
    if (!baseTemplateSchedule) return new Set<string>();
    return computeTeacherChangedCells(schedule, baseTemplateSchedule, classNames);
  }, [classNames, schedule, baseTemplateSchedule]);

  // Filter columns to only classes with changes on selectedDay
  const filteredColumns = useMemo(() => {
    if (!selectedDay || activeView !== 'classes' || !baseTemplateSchedule) return columns;
    return columns.filter(className => {
      for (const lessonNum of LESSON_NUMBERS) {
        if (changedCells.has(`${className}|${selectedDay}|${lessonNum}`)) return true;
      }
      return false;
    });
  }, [selectedDay, activeView, columns, baseTemplateSchedule, changedCells]);

  // Days to display (filtered or all)
  const displayDays = useMemo(() => {
    if (selectedDay) return [selectedDay];
    return DAYS;
  }, [selectedDay]);

  // Teacher changes on selected day (for Z9-4 list view)
  const teacherChangesOnDay = useMemo(() => {
    if (!selectedDay || activeView !== 'teachers' || !baseTemplateSchedule) return [];
    return getTeacherChangesOnDay(schedule, baseTemplateSchedule, teacherSchedule, teacherNames, selectedDay);
  }, [selectedDay, activeView, teacherNames, teacherSchedule, schedule, baseTemplateSchedule]);

  // Show teacher change list instead of grid?
  const showTeacherChangeList = activeView === 'teachers' && !!selectedDay && !!baseTemplateSchedule;

  // Get cell content for any view
  const getCellContent = useCallback((column: string, day: Day, lessonNum: LessonNumber): ScheduleEntry[] => {
    switch (activeView) {
      case 'classes': {
        const lessons = schedule[column]?.[day]?.[lessonNum]?.lessons ?? [];
        return lessons.map(lesson => ({ className: column, lesson }));
      }
      case 'teachers':
        return teacherSchedule[column]?.[day]?.[lessonNum] ?? [];
      case 'rooms':
        return roomSchedule[column]?.[day]?.[lessonNum] ?? [];
    }
  }, [activeView, schedule, teacherSchedule, roomSchedule]);

  // Format cell text for TSV
  const formatCellText = useCallback((entries: ScheduleEntry[]): string => {
    return entries.map(({ className, lesson }) => {
      const group = extractGroupIndex(lesson.group);
      const teacherStr = lesson.teacher2 ? `${lesson.teacher} / ${lesson.teacher2}` : lesson.teacher;
      switch (activeView) {
        case 'classes':
          return `${lesson.subject}${group ? ` (${group})` : ''} ${teacherStr} ${formatRoom(lesson.room)}${lesson.originalTeacher ? ' *' : ''}`;
        case 'teachers':
          return `${lesson.subject}${group ? ` (${group})` : ''} ${className} ${formatRoom(lesson.room)}`;
        case 'rooms':
          return `${lesson.subject}${group ? ` (${group})` : ''} ${className} ${teacherStr}`;
      }
    }).join('\n');
  }, [activeView]);

  // Escape a TSV cell: wrap in quotes if it contains tab, newline, or quote
  const escapeTsvCell = (value: string): string => {
    if (value.includes('\t') || value.includes('\n') || value.includes('"')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  // Active columns for current view (filtered when day filter is active for classes)
  const activeColumns = activeView === 'classes' ? filteredColumns : columns;

  // Generate TSV from grid (all or selection)
  const generateTSV = useCallback((sel: GridSelection | null): string => {
    const rows: string[][] = [];
    const totalRows = displayDays.length * LESSON_NUMBERS.length;

    // Determine bounds
    const minRow = sel ? Math.min(sel.startRow, sel.endRow) : 0;
    const maxRow = sel ? Math.max(sel.startRow, sel.endRow) : totalRows - 1;
    const minCol = sel ? Math.min(sel.startCol, sel.endCol) : -2;
    const maxCol = sel ? Math.max(sel.startCol, sel.endCol) : activeColumns.length - 1;

    // Add header row if we're including columns and starting from top
    if (maxCol >= 0 && minRow === 0) {
      const header: string[] = [];
      if (minCol <= -2) header.push('День');
      if (minCol <= -1) header.push('Урок');
      for (let c = Math.max(0, minCol); c <= maxCol; c++) {
        header.push(activeColumns[c]);
      }
      rows.push(header);
    }

    // Add data rows
    for (let r = minRow; r <= maxRow; r++) {
      const dayIndex = Math.floor(r / LESSON_NUMBERS.length);
      const lessonIndex = r % LESSON_NUMBERS.length;
      const day = displayDays[dayIndex];
      const lessonNum = LESSON_NUMBERS[lessonIndex];

      const row: string[] = [];
      if (minCol <= -2) row.push(lessonIndex === 0 ? getDayName(day, DAYS.indexOf(day)) : '');
      if (minCol <= -1) row.push(String(lessonNum));

      for (let c = Math.max(0, minCol); c <= maxCol; c++) {
        const column = activeColumns[c];
        const entries = getCellContent(column, day, lessonNum);
        row.push(formatCellText(entries));
      }
      rows.push(row);
    }

    return rows.map(row => row.map(escapeTsvCell).join('\t')).join('\n');
  }, [activeColumns, displayDays, getDayName, getCellContent, formatCellText]);

  // Generate HTML table from grid (all or selection) — mirrors generateTSV with inline styles.
  // Produces rich formatting for Google Sheets / Excel paste:
  //   • Pale grid lines between cells
  //   • Thick bottom border after the last lesson of each day
  //   • Day column uses rowspan + vertical text (writing-mode)
  //   • Changed cells get yellow background (#ffd600)
  const generateHTML = useCallback((sel: GridSelection | null): string => {
    const totalRows = displayDays.length * LESSON_NUMBERS.length;
    const minRow = sel ? Math.min(sel.startRow, sel.endRow) : 0;
    const maxRow = sel ? Math.max(sel.startRow, sel.endRow) : totalRows - 1;
    const minCol = sel ? Math.min(sel.startCol, sel.endCol) : -2;
    const maxCol = sel ? Math.max(sel.startCol, sel.endCol) : activeColumns.length - 1;

    const CELL = 'border:1px solid #d0d0d0;padding:4px 6px;vertical-align:top;font-size:12px;';
    const HEADER = `${CELL}font-weight:bold;background:#f0f0f0;text-align:center;`;
    const DAY_CELL = 'border:1px solid #d0d0d0;padding:4px 6px;vertical-align:middle;font-size:12px;font-weight:bold;background:#e8e8e8;text-align:center;writing-mode:vertical-rl;transform:rotate(180deg);';
    const DAY_END_BORDER = 'border-bottom:3px solid #666;';
    const YELLOW = '#ffff00';

    let html = '<table style="border-collapse:collapse;font-family:Arial,sans-serif;">';

    // Header row
    if (maxCol >= 0 && minRow === 0) {
      html += '<tr>';
      if (minCol <= -2) html += `<th style="${HEADER}">День</th>`;
      if (minCol <= -1) html += `<th style="${HEADER}">Урок</th>`;
      for (let c = Math.max(0, minCol); c <= maxCol; c++) {
        html += `<th style="${HEADER}">${escapeHtml(activeColumns[c])}</th>`;
      }
      html += '</tr>';
    }

    // Data rows
    for (let r = minRow; r <= maxRow; r++) {
      const dayIndex = Math.floor(r / LESSON_NUMBERS.length);
      const lessonIndex = r % LESSON_NUMBERS.length;
      const day = displayDays[dayIndex];
      const lessonNum = LESSON_NUMBERS[lessonIndex];

      // Last lesson of a day: add thick bottom border to all cells in this row
      const dayEndRow = (dayIndex + 1) * LESSON_NUMBERS.length - 1;
      const isLastOfDay = r === Math.min(maxRow, dayEndRow);
      const dayBorder = isLastOfDay ? DAY_END_BORDER : '';

      html += '<tr>';

      if (minCol <= -2) {
        // Day cell: emit only on the first row of this day within the selection range.
        // Use rowspan to span all rows of the day that are in range.
        const isFirstOfDayInRange = lessonIndex === 0 || r === minRow;
        if (isFirstOfDayInRange) {
          const rowspanCount = Math.min(maxRow, dayEndRow) - r + 1;
          const rowspanAttr = rowspanCount > 1 ? ` rowspan="${rowspanCount}"` : '';
          html += `<td${rowspanAttr} style="${DAY_CELL}">${escapeHtml(getDayName(day, DAYS.indexOf(day)))}</td>`;
        }
      }

      if (minCol <= -1) {
        html += `<td style="${CELL}${dayBorder}">${lessonNum}</td>`;
      }

      for (let c = Math.max(0, minCol); c <= maxCol; c++) {
        const column = activeColumns[c];
        const entries = getCellContent(column, day, lessonNum);
        // Z28-2: teacher view uses per-teacher changed cells to avoid false highlights
        // when a different teacher's lesson changes in the same slot.
        const isChanged = activeView === 'classes'
          ? changedCells.has(`${column}|${day}|${lessonNum}`)
          : activeView === 'teachers'
            ? (entries.some(e => teacherChangedCells.has(`${column}|${e.className}|${day}|${lessonNum}`)) ||
               (baseTeacherSchedule[column]?.[day]?.[lessonNum] ?? []).some(e => teacherChangedCells.has(`${column}|${e.className}|${day}|${lessonNum}`)))
            : entries.some(e => changedCells.has(`${e.className}|${day}|${lessonNum}`));
        const bg = isChanged ? `background-color:${YELLOW};` : '';
        // For classes view, render substituted lessons in italic
        const text = activeView === 'classes'
          ? entries.map(({ lesson }) => {
              const group = extractGroupIndex(lesson.group);
              const teacherStr = lesson.teacher2 ? `${lesson.teacher} / ${lesson.teacher2}` : lesson.teacher;
              const line = escapeHtml(`${lesson.subject}${group ? ` (${group})` : ''} ${teacherStr} ${formatRoom(lesson.room)}`);
              return lesson.originalTeacher ? `<em>${line} *</em>` : line;
            }).join('<br>')
          : escapeHtml(formatCellText(entries)).replace(/\n/g, '<br>');
        html += `<td style="${CELL}${bg}${dayBorder}">${text}</td>`;
      }

      html += '</tr>';
    }

    html += '</table>';
    return html;
  }, [activeColumns, displayDays, getDayName, getCellContent, formatCellText, changedCells, activeView, baseTeacherSchedule]);

  // Copy functions
  const copyAll = useCallback(async () => {
    try {
      if (showTeacherChangeList) {
        // Copy teacher change list as plain text only (no colour semantics)
        const lines = teacherChangesOnDay.map(({ teacher, changes }) => {
          const parts = changes.map(c => {
            const groupStr = c.group ? ` (${extractGroupIndex(c.group)})` : '';
            const cancelledStr = c.isCancelled ? ' снят' : '';
            return `${c.className}${groupStr} ур.${c.lessonNum}${cancelledStr}`;
          });
          return `${teacher} (${parts.join(', ')})`;
        });
        await navigator.clipboard.writeText(lines.join('\n'));
      } else {
        const sel = { startRow: 0, startCol: -1, endRow: displayDays.length * LESSON_NUMBERS.length - 1, endCol: activeColumns.length - 1 };
        const tsv = generateTSV(sel);
        const html = generateHTML(sel);
        await writeClipboard(tsv, html);
      }
      showToast('Скопировано', 'success');
    } catch {
      showToast('Ошибка копирования', 'error');
    }
  }, [generateTSV, generateHTML, activeColumns.length, displayDays.length, showTeacherChangeList, teacherChangesOnDay, showToast]);

  const copySelection = useCallback(async () => {
    if (!selection) return;
    try {
      const tsv = generateTSV(selection);
      const html = generateHTML(selection);
      await writeClipboard(tsv, html);
      showToast('Выделение скопировано', 'success');
      clearSelection();
    } catch {
      showToast('Ошибка копирования', 'error');
    }
  }, [selection, generateTSV, generateHTML, showToast]);

  // Build canvas list for Telegram export (shared between folder and blob download paths)
  const buildTelegramCanvases = useCallback((): Array<[HTMLCanvasElement, string]> => {
    if (!selectedDay || !baseTemplateSchedule) return [];

    const dayIndex = DAYS.indexOf(selectedDay);
    const titleStr = formatDayFullWithDate(selectedDay, mondayDate ?? undefined, dayIndex);

    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

    const absentTeacherNames = [...new Set(
      substitutions.filter(s => s.day === selectedDay).map(s => s.originalTeacher)
    )];

    const result: Array<[HTMLCanvasElement, string]> = [];

    // Download order: teachers → absent → classes (Z14-1e)
    const teachersData = getTeacherImageData(schedule, baseTemplateSchedule, teachers, selectedDay, absentTeacherNames);
    if (teachersData.changes.length > 0) {
      result.push([renderTeachersImage(teachersData, titleStr), `${ts}_changes_${selectedDay}.png`]);
    }

    const absentData = getAbsentTeachersData(schedule, baseTemplateSchedule, teachers, selectedDay, absentTeacherNames);
    if (absentData.length > 0) {
      result.push([renderAbsentImage(absentData, titleStr), `${ts}_absent_${selectedDay}.png`]);
    }

    const classesData = getChangedClassesData(schedule, baseTemplateSchedule, classNames, selectedDay);
    const classesCanvases = renderClassesImage(classesData, titleStr);
    classesCanvases.forEach((c, i) => {
      const suffix = classesCanvases.length === 1 ? '' : `_${i + 1}`;
      result.push([c, `${ts}_classes_${selectedDay}${suffix}.png`]);
    });

    return result;
  }, [selectedDay, baseTemplateSchedule, mondayDate, substitutions, schedule, classNames, teachers]);

  // Save canvases to a folder handle (or fall back to blob downloads)
  const saveCanvases = useCallback(async (dirHandle: FileSystemDirectoryHandle | null) => {
    const canvases = buildTelegramCanvases();
    if (canvases.length === 0) { showToast('Нет изменений для скачивания', 'info'); return; }

    if (dirHandle) {
      await Promise.all(canvases.map(([canvas, filename]) => saveCanvasPngToFolder(canvas, filename, dirHandle)));
    } else {
      canvases.forEach(([canvas, filename]) => downloadCanvasAsPng(canvas, filename));
    }
    showToast('Изображения скачаны', 'success');
  }, [buildTelegramCanvases, showToast]);

  // Replacement entries for selected day (weekly mode)
  const replacementEntries = useMemo(() => {
    if (versionType !== 'weekly' || !selectedDay) return [];
    return getReplacementEntries(schedule, selectedDay);
  }, [versionType, selectedDay, schedule]);

  const budgetReplacementEntries = useMemo(
    () => replacementEntries.filter((e) => !e.isUnionSubstitution),
    [replacementEntries]
  );

  const unionReplacementEntries = useMemo(
    () => replacementEntries.filter((e) => e.isUnionSubstitution),
    [replacementEntries]
  );

  // Download Telegram images + autosave to all 4 configured folders
  const handleDownloadTelegram = useCallback(async () => {
    if (!selectedDay || !baseTemplateSchedule) return;

    if (!fsFolderSupported) {
      // Browser doesn't support File System Access API — use classic blob downloads
      await saveCanvases(null);
      return;
    }

    // Resolve telegram folder (pick on first use, re-check permission otherwise)
    let telegramDir: FileSystemDirectoryHandle | null = folderHandle;
    if (!telegramDir) {
      telegramDir = await pickFolder('telegram');
      if (!telegramDir) return;
    } else {
      telegramDir = await ensurePermission(telegramDir);
      if (!telegramDir) {
        telegramDir = await pickFolder('telegram');
        if (!telegramDir) return;
      }
    }

    // 1. Save PNG images to telegram folder
    await saveCanvases(telegramDir);

    // 2. Save замены image to deputy folder (weekly mode only)
    const deputyDir = folderHandles['deputy'];
    if (deputyDir && versionType === 'weekly' && budgetReplacementEntries.length > 0) {
      const deputyDirVerified = await ensurePermission(deputyDir);
      if (deputyDirVerified) {
        const dayIndex = DAYS.indexOf(selectedDay);
        const titleStr = formatDayFullWithDate(selectedDay, mondayDate ?? undefined, dayIndex);
        const now = new Date();
        const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        const canvas = buildReplacementsImage(budgetReplacementEntries, titleStr);
        await saveCanvasPngToFolder(canvas, `${ts}_replacements_${selectedDay}.png`, deputyDirVerified);
      }
    }

    // 3. Save full JSON export to rshp_json folder
    const rshpDir = folderHandles['rshp_json'];
    if (rshpDir) {
      const rshpDirVerified = await ensurePermission(rshpDir);
      if (rshpDirVerified) {
        const json = await exportToJson();
        const date = new Date().toISOString().slice(0, 10);
        await saveJsonStringToFolder(json, `timetable-${date}.json`, rshpDirVerified);
      }
    }

    // 4. Save occupancy JSON to occupancy_json folder
    const occupancyDir = folderHandles['occupancy_json'];
    if (occupancyDir) {
      const occupancyDirVerified = await ensurePermission(occupancyDir);
      if (occupancyDirVerified) {
        const file = generatePartnerAvailability(schedule, {
          name: versionName,
          type: versionType,
          mondayDate: mondayDate ?? undefined,
        });
        const json = JSON.stringify(file, null, 2);
        const safeName = (versionName || 'расписание').replace(/[/\\:*?"<>|]/g, '-');
        await saveJsonStringToFolder(json, `занятость-${safeName}.json`, occupancyDirVerified);
      }
    }
  }, [
    selectedDay, baseTemplateSchedule, fsFolderSupported, folderHandle, folderHandles,
    pickFolder, ensurePermission, saveCanvases, versionType, mondayDate, versionName,
    budgetReplacementEntries, schedule,
  ]);

  // Download замены image (budget or union)
  const downloadReplacementsImage = useCallback(async (entries: typeof replacementEntries, label: string) => {
    if (!selectedDay || entries.length === 0) return;
    const dayIndex = DAYS.indexOf(selectedDay);
    const titleStr = formatDayFullWithDate(selectedDay, mondayDate ?? undefined, dayIndex);
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const canvas = buildReplacementsImage(entries, titleStr);
    const filename = `${ts}_${label}_${selectedDay}.png`;

    if (fsFolderSupported && folderHandle) {
      const dir = await ensurePermission(folderHandle);
      if (dir) {
        await saveCanvasPngToFolder(canvas, filename, dir);
        showToast('Замены скачаны', 'success');
        return;
      }
    }
    downloadCanvasAsPng(canvas, filename);
    showToast('Замены скачаны', 'success');
  }, [selectedDay, mondayDate, fsFolderSupported, folderHandle, ensurePermission, showToast]);

  const handleDownloadReplacements = useCallback(
    () => downloadReplacementsImage(budgetReplacementEntries, 'replacements'),
    [downloadReplacementsImage, budgetReplacementEntries]
  );

  const handleDownloadUnionReplacements = useCallback(
    () => downloadReplacementsImage(unionReplacementEntries, 'replacements_union'),
    [downloadReplacementsImage, unionReplacementEntries]
  );

  // Clear selection when switching views
  const handleViewChange = useCallback((view: GridView) => {
    setActiveView(view);
    clearSelection();
    setSelectedDay(null);
  }, [clearSelection]);

  // Export teacher availability for partner unit
  const handleExportAvailability = useCallback(() => {
    const file = generatePartnerAvailability(schedule, {
      name: versionName,
      type: versionType,
      mondayDate: mondayDate ?? undefined,
    });
    const json = JSON.stringify(file, null, 2);
    const safeName = (versionName || 'расписание').replace(/[/\\:*?"<>|]/g, '-');
    downloadJson(json, `занятость-${safeName}.json`);
  }, [schedule, versionName, versionType, mondayDate]);

  // Render cell content
  const renderCellContent = useCallback((entries: ScheduleEntry[]) => {
    return entries.map(({ className, lesson }, i) => {
      const groupIndex = extractGroupIndex(lesson.group);
      const isSubstitution = activeView === 'classes' && !!lesson.originalTeacher;
      return (
        <div key={i} className={styles.lessonEntry} style={isSubstitution ? { fontStyle: 'italic' } : undefined}>
          <span className={styles.subject}>
            {lesson.subject}
            {groupIndex && <span className={styles.group}> ({groupIndex})</span>}
            {isSubstitution && <span className={styles.substitutionMark}> *</span>}
          </span>
          {activeView === 'classes' && (
            <span className={styles.teacher}>{lesson.teacher}{lesson.teacher2 ? ` / ${lesson.teacher2}` : ''}</span>
          )}
          {activeView === 'teachers' && (
            <span className={styles.className}>{className}</span>
          )}
          {activeView === 'rooms' && (
            <>
              <span className={styles.className}>{className}</span>
              <span className={styles.teacher}>{lesson.teacher}{lesson.teacher2 ? ` / ${lesson.teacher2}` : ''}</span>
            </>
          )}
          {activeView !== 'rooms' && (
            <span className={styles.room}>{formatRoom(lesson.room)}</span>
          )}
        </div>
      );
    });
  }, [activeView]);

  if (!hasSchedule) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <p>Нет данных для экспорта</p>
          <p>Создайте или загрузите расписание на главной странице</p>
          <p style={{ fontSize: 'var(--font-size-xs)' }}>
            Перейдите на «Главная» для загрузки или создания расписания
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.controls}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeView === 'classes' ? styles.tabActive : ''}`}
            onClick={() => handleViewChange('classes')}
            title="Расписание по классам"
          >
            Классы
          </button>
          <button
            className={`${styles.tab} ${activeView === 'teachers' ? styles.tabActive : ''}`}
            onClick={() => handleViewChange('teachers')}
            title="Расписание по учителям"
          >
            Учителя
          </button>
          <button
            className={`${styles.tab} ${activeView === 'rooms' ? styles.tabActive : ''}`}
            onClick={() => handleViewChange('rooms')}
            title="Расписание по кабинетам"
          >
            Кабинеты
          </button>
        </div>
        {canFilterByDay && (
          <div className={styles.dayFilter}>
            <button
              className={`${styles.tab} ${!selectedDay ? styles.tabActive : ''}`}
              onClick={() => { setSelectedDay(null); clearSelection(); }}
            >
              Все
            </button>
            {DAYS.map(day => (
              <button
                key={day}
                className={`${styles.tab} ${selectedDay === day ? styles.tabActive : ''}`}
                onClick={() => { setSelectedDay(day); clearSelection(); }}
              >
                {day}
              </button>
            ))}
          </div>
        )}
        <div className={styles.rightControls}>
          {canFilterByDay && selectedDay && baseTemplateSchedule && (
            <div className={styles.splitButton}>
              <Button
                variant="secondary"
                size="small"
                onClick={handleDownloadTelegram}
                title={folderName ? `Скачать в папку «${folderName}»` : 'Скачать изображения для мессенджера'}
              >
                Скачать для мессенджера
              </Button>
              {fsFolderSupported && (
                <button
                  className={styles.splitChevron}
                  onClick={() => setFolderSettingsOpen(true)}
                  title="Настройка папок автосохранения"
                >
                  ⚙
                </button>
              )}
            </div>
          )}
          {versionType === 'weekly' && selectedDay && (
            <>
              <Button
                variant="secondary"
                size="small"
                onClick={handleDownloadReplacements}
                disabled={budgetReplacementEntries.length === 0}
                title={budgetReplacementEntries.length === 0 ? 'Нет замен на этот день' : 'Скачать список замен для мессенджера'}
              >
                Скачать Замены
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={handleDownloadUnionReplacements}
                disabled={unionReplacementEntries.length === 0}
                title={unionReplacementEntries.length === 0 ? 'Нет профсоюзных замен на этот день' : 'Скачать профсоюзные замены для мессенджера'}
              >
                Замены (проф.)
              </Button>
            </>
          )}
          <Button variant="ghost" size="small" onClick={handleExportAvailability} title="Экспорт занятости учителей для партнёра">
            Занятость
          </Button>
          <Button variant="secondary" size="small" onClick={copyAll} title="Скопировать всю таблицу в буфер обмена">
            Копировать всё
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={copySelection}
            disabled={!selection}
            title="Скопировать выделенные ячейки в буфер обмена"
          >
            Копировать выделение
          </Button>
        </div>
      </div>

      <HintBar text="Выделите ячейки мышью и нажмите «Копировать выделение» для вставки в Excel" />

      <div className={styles.content}>
        {showTeacherChangeList ? (
          <div className={styles.teacherChangeList}>
            {teacherChangesOnDay.length === 0 ? (
              <div className={styles.empty}>Нет изменений на {selectedDay}</div>
            ) : (
              teacherChangesOnDay.map(({ teacher, changes }) => (
                <div key={teacher} className={styles.teacherChangeEntry}>
                  <span className={styles.teacherChangeName}>{teacher}</span>
                  {' ('}
                  {changes.map((c, i) => (
                    <span key={i} className={c.isCancelled ? styles.cancelledChange : undefined}>
                      {i > 0 && ', '}
                      {c.className}{c.group ? ` (${extractGroupIndex(c.group)})` : ''} ур.{c.lessonNum}
                      {c.isCancelled && <span className={styles.cancelledLabel}> снят</span>}
                    </span>
                  ))}
                  {')'}
                </div>
              ))
            )}
          </div>
        ) : (
          <div
            className={styles.gridView}
            onMouseUp={handleGridMouseUp}
            onMouseLeave={handleGridMouseUp}
          >
            <table className={styles.gridTable}>
              <thead>
                <tr>
                  <th className={styles.gridCorner}>День</th>
                  <th className={styles.gridCorner}>Урок</th>
                  {activeColumns.map((col: string) => (
                    <th key={col} className={styles.gridClassHeader}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayDays.map((day, displayDayIndex) => (
                  LESSON_NUMBERS.map((lessonNum, lessonIndex) => {
                    const rowIndex = displayDayIndex * LESSON_NUMBERS.length + lessonIndex;
                    const isLastLessonOfDay = lessonIndex === LESSON_NUMBERS.length - 1;
                    const dayIndex = DAYS.indexOf(day);
                    return (
                      <tr key={`${day}-${lessonNum}`} className={isLastLessonOfDay ? styles.dayLastRow : ''}>
                        {lessonIndex === 0 && (
                          <td
                            className={`${styles.gridDayCell} ${isInSelection(rowIndex, -2) ? styles.selected : ''}`}
                            rowSpan={LESSON_NUMBERS.length}
                            onMouseDown={() => handleGridMouseDown(rowIndex, -2)}
                            onMouseMove={() => handleGridMouseMove(rowIndex, -2)}
                          >
                            {getDayName(day, dayIndex)}
                          </td>
                        )}
                        <td
                          className={`${styles.gridLessonNum} ${isInSelection(rowIndex, -1) ? styles.selected : ''}`}
                          onMouseDown={() => handleGridMouseDown(rowIndex, -1)}
                          onMouseMove={() => handleGridMouseMove(rowIndex, -1)}
                        >
                          {lessonNum}
                        </td>
                        {activeColumns.map((column: string, colIndex: number) => {
                          const entries = getCellContent(column, day, lessonNum);
                          const isSelected = isInSelection(rowIndex, colIndex);
                          // For classes view, column IS the class name; for teacher/room views, check entries' classNames.
                          // For teacher view, also check the base template map so removed lessons are highlighted (Z24-1c).
                          // Z30-1: teacher view uses per-teacher changed cells (teacherChangedCells) to avoid
                          // false highlights when a parallel group's lesson changes in the same slot.
                          const isChanged = activeView === 'classes'
                            ? changedCells.has(`${column}|${day}|${lessonNum}`)
                            : activeView === 'teachers'
                              ? (entries.some(e => teacherChangedCells.has(`${column}|${e.className}|${day}|${lessonNum}`)) ||
                                 (baseTeacherSchedule[column]?.[day]?.[lessonNum] ?? []).some(e => teacherChangedCells.has(`${column}|${e.className}|${day}|${lessonNum}`)))
                              : entries.some(e => changedCells.has(`${e.className}|${day}|${lessonNum}`));
                          return (
                            <td
                              key={column}
                              className={`${styles.gridCell} ${isSelected ? styles.selected : ''} ${isChanged ? styles.changedCell : ''}`}
                              onMouseDown={() => handleGridMouseDown(rowIndex, colIndex)}
                              onMouseMove={() => handleGridMouseMove(rowIndex, colIndex)}
                            >
                              {renderCellContent(entries)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                ))}
              </tbody>
            </table>
          </div>
        )}
        {activeView === 'classes' && !showTeacherChangeList && (
          <div className={styles.gridLegend}>* — замена</div>
        )}
      </div>

      <FolderSettingsDialog
        isOpen={folderSettingsOpen}
        onClose={() => setFolderSettingsOpen(false)}
        folders={folders}
      />
    </div>
  );
}
