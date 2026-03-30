/**
 * Telegram image export — Canvas rendering
 * Pure data builders live in export-image-data.ts (re-exported below for backward compatibility).
 */

import type { LessonNumber } from '@/types';

// Re-export everything from the data module so callers need no changes
export type {
  ClassesImageCell,
  ClassesImageData,
  TeacherChange,
  TeacherImageData,
  TeacherChangeDetail,
  ReplacementEntry,
} from './export-image-data';

export {
  isSlotChangedForExport,
  formatCellLessons,
  getTeacherChangesOnDay,
  getChangedClassesData,
  getTeacherImageData,
  getAbsentTeachersData,
  getReplacementEntries,
} from './export-image-data';

import type { ClassesImageData, TeacherImageData, ReplacementEntry } from './export-image-data';

// ─── Canvas constants ─────────────────────────────────────────

const CANVAS_WIDTH = 1125;
const TITLE_HEIGHT = 40;
const TITLE_BG = '#4A90D9';
const TITLE_COLOR = '#FFFFFF';
const HEADER_BG = '#F0F0F0';
const CHANGED_BG = '#FFFF00';
const GRID_COLOR = '#DEE2E6';
const TEXT_COLOR = '#212529';
const CELL_PADDING = 6;
const FONT_FAMILY = 'system-ui, -apple-system, sans-serif';

// ─── Canvas rendering ─────────────────────────────────────────

/**
 * Measure wrapped text and return line arrays.
 * Returns lines that fit within maxWidth, breaking on words.
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

const MAX_COLS_PER_IMAGE = 5;

/**
 * Render a single classes grid page for a subset of columns.
 */
function renderClassesPage(
  columns: string[],
  lessonNumbers: LessonNumber[],
  cells: import('./export-image-data').ClassesImageCell[][],  // [lessonIndex][colIndex] — already sliced to this page's columns
  titleText: string,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  canvas.width = CANVAS_WIDTH;
  canvas.height = 1;

  const fontSize = 13;
  const headerFontSize = 14;
  const titleFontSize = 18;
  const lineHeight = fontSize + 4;
  const headerHeight = headerFontSize + CELL_PADDING * 2 + 4;

  ctx.font = `${fontSize}px ${FONT_FAMILY}`;

  const numColWidth = 36;
  const availableWidth = CANVAS_WIDTH - numColWidth;

  // Auto-size columns based on content
  const colWidths: number[] = columns.map((colName, colIndex) => {
    ctx.font = `bold ${headerFontSize}px ${FONT_FAMILY}`;
    let maxWidth = ctx.measureText(colName).width + CELL_PADDING * 2;

    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
      const cell = cells[rowIndex][colIndex];
      if (!cell.text) continue;
      for (const line of cell.text.split('\n')) {
        const w = ctx.measureText(line).width + CELL_PADDING * 2;
        if (w > maxWidth) maxWidth = w;
      }
    }

    return maxWidth;
  });

  // Scale columns to fit canvas width
  const totalNatural = colWidths.reduce((s, w) => s + w, 0);
  if (totalNatural > availableWidth) {
    const scale = availableWidth / totalNatural;
    for (let i = 0; i < colWidths.length; i++) {
      colWidths[i] = Math.floor(colWidths[i] * scale);
    }
  }
  const totalCols = colWidths.reduce((s, w) => s + w, 0);
  if (totalCols < availableWidth && colWidths.length > 0) {
    const extra = Math.floor((availableWidth - totalCols) / colWidths.length);
    for (let i = 0; i < colWidths.length; i++) {
      colWidths[i] += extra;
    }
  }

  // Measure row heights
  const minColWidth = colWidths.length > 0 ? Math.min(...colWidths) : 100;
  const fallbackTextWidth = minColWidth - CELL_PADDING * 2;

  const rowHeights: number[] = cells.map(row => {
    let maxH = lineHeight + CELL_PADDING * 2;
    for (let c = 0; c < row.length; c++) {
      const cellMaxW = colWidths[c] - CELL_PADDING * 2;
      ctx.font = `${fontSize}px ${FONT_FAMILY}`;
      const lines = wrapText(ctx, row[c].text, cellMaxW > 0 ? cellMaxW : fallbackTextWidth);
      const h = lines.length * lineHeight + CELL_PADDING * 2;
      if (h > maxH) maxH = h;
    }
    return maxH;
  });

  const totalHeight = TITLE_HEIGHT + headerHeight + rowHeights.reduce((s, h) => s + h, 0) + 1;

  canvas.width = CANVAS_WIDTH;
  canvas.height = totalHeight;

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, CANVAS_WIDTH, totalHeight);

  // Title bar
  ctx.fillStyle = TITLE_BG;
  ctx.fillRect(0, 0, CANVAS_WIDTH, TITLE_HEIGHT);
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = `bold ${titleFontSize}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(titleText, CELL_PADDING + 4, TITLE_HEIGHT / 2);

  let y = TITLE_HEIGHT;

  // Header row
  ctx.fillStyle = HEADER_BG;
  ctx.fillRect(0, y, CANVAS_WIDTH, headerHeight);
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = `bold ${headerFontSize}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Ур.', CELL_PADDING, y + headerHeight / 2);

  let x = numColWidth;
  for (let c = 0; c < columns.length; c++) {
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = `bold ${headerFontSize}px ${FONT_FAMILY}`;
    ctx.fillText(columns[c], x + CELL_PADDING, y + headerHeight / 2);
    x += colWidths[c];
  }

  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y + headerHeight);
  ctx.lineTo(CANVAS_WIDTH, y + headerHeight);
  ctx.stroke();

  y += headerHeight;

  // Data rows
  for (let r = 0; r < cells.length; r++) {
    const rowH = rowHeights[r];

    // Cell backgrounds
    x = numColWidth;
    for (let c = 0; c < cells[r].length; c++) {
      if (cells[r][c].isChanged) {
        ctx.fillStyle = CHANGED_BG;
        ctx.fillRect(x, y, colWidths[c], rowH);
      }
      x += colWidths[c];
    }

    // Lesson number
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    ctx.fillText(String(lessonNumbers[r]), CELL_PADDING + 8, y + CELL_PADDING);

    // Cell text (vertically centered)
    x = numColWidth;
    for (let c = 0; c < cells[r].length; c++) {
      const cell = cells[r][c];
      if (cell.text) {
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = `${fontSize}px ${FONT_FAMILY}`;
        const cellMaxW = colWidths[c] - CELL_PADDING * 2;
        const lines = wrapText(ctx, cell.text, cellMaxW > 0 ? cellMaxW : fallbackTextWidth);
        const textBlockHeight = lines.length * lineHeight;
        const yOffset = (rowH - textBlockHeight) / 2;
        for (let li = 0; li < lines.length; li++) {
          ctx.fillText(lines[li], x + CELL_PADDING, y + yOffset + li * lineHeight);
        }
      }
      x += colWidths[c];
    }

    // Row border
    ctx.strokeStyle = GRID_COLOR;
    ctx.beginPath();
    ctx.moveTo(0, y + rowH);
    ctx.lineTo(CANVAS_WIDTH, y + rowH);
    ctx.stroke();

    y += rowH;
  }

  // Vertical grid lines
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(numColWidth, TITLE_HEIGHT);
  ctx.lineTo(numColWidth, totalHeight);
  ctx.stroke();

  x = numColWidth;
  for (let c = 0; c < colWidths.length - 1; c++) {
    x += colWidths[c];
    ctx.beginPath();
    ctx.moveTo(x, TITLE_HEIGHT);
    ctx.lineTo(x, totalHeight);
    ctx.stroke();
  }

  // Outer border
  ctx.strokeStyle = GRID_COLOR;
  ctx.strokeRect(0, 0, CANVAS_WIDTH, totalHeight);

  return canvas;
}

/**
 * Render classes grid images. Splits into multiple pages if >8 columns.
 * Returns one canvas per page.
 */
export function renderClassesImage(data: ClassesImageData, title: string): HTMLCanvasElement[] {
  if (data.columns.length === 0) return [];

  const totalPages = Math.ceil(data.columns.length / MAX_COLS_PER_IMAGE);
  const canvases: HTMLCanvasElement[] = [];

  for (let page = 0; page < totalPages; page++) {
    const startCol = page * MAX_COLS_PER_IMAGE;
    const endCol = Math.min(startCol + MAX_COLS_PER_IMAGE, data.columns.length);
    const pageColumns = data.columns.slice(startCol, endCol);
    const pageCells = data.cells.map(row => row.slice(startCol, endCol));

    const titleText = totalPages === 1
      ? `Изменения на ${title}`
      : `Изменения на ${title} (${page + 1}/${totalPages})`;

    canvases.push(renderClassesPage(pageColumns, data.lessonNumbers, pageCells, titleText));
  }

  return canvases;
}

/**
 * Render the teachers changes image in landscape orientation.
 * Entries are laid out in 2 columns side by side.
 * Format: "Иванова Т.С. — 5а, 7б, 11в"
 */
export function renderTeachersImage(data: TeacherImageData, title: string): HTMLCanvasElement {
  const changesWidth = Math.round(CANVAS_WIDTH * 0.6); // 60% of grid width
  const NUM_COLS = 2;
  const fontSize = 14;
  const titleFontSize = 18;
  const lineHeight = fontSize + 6;
  const sectionGap = 12;
  const outerPadding = 14;
  const colGap = 16;
  const colWidth = (changesWidth - outerPadding * 2 - colGap * (NUM_COLS - 1)) / NUM_COLS;

  // Measure canvas with a throw-away context first
  const measure = document.createElement('canvas');
  const mCtx = measure.getContext('2d')!;
  mCtx.font = `${fontSize}px ${FONT_FAMILY}`;

  // Build entry line arrays (each entry may wrap)
  const entryLines: string[][] = data.changes.map(change => {
    const text = `${change.teacher} — ${change.classes.join(', ')}`;
    return wrapText(mCtx, text, colWidth);
  });

  // Split entries into two columns: top half left, bottom half right
  const midpoint = Math.ceil(entryLines.length / 2);
  const cols: string[][][] = [entryLines.slice(0, midpoint), entryLines.slice(midpoint)];

  // Calculate column content heights
  const colHeights = cols.map(col => {
    let h = sectionGap;
    for (const lines of col) h += lines.length * lineHeight;
    h += sectionGap;
    return h;
  });
  const contentHeight = Math.max(...colHeights, lineHeight + sectionGap * 2);
  const totalHeight = TITLE_HEIGHT + contentHeight;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = changesWidth;
  canvas.height = totalHeight;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, changesWidth, totalHeight);

  // Title bar
  ctx.fillStyle = TITLE_BG;
  ctx.fillRect(0, 0, changesWidth, TITLE_HEIGHT);
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = `bold ${titleFontSize}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(`Изменения — ${title}`, outerPadding, TITLE_HEIGHT / 2);

  // Render each column
  ctx.textBaseline = 'top';
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;

  for (let colIdx = 0; colIdx < NUM_COLS; colIdx++) {
    const colX = outerPadding + colIdx * (colWidth + colGap);
    let y = TITLE_HEIGHT + sectionGap;
    for (const lines of cols[colIdx]) {
      for (const line of lines) {
        ctx.fillText(line, colX, y);
        y += lineHeight;
      }
    }
  }

  // Vertical divider between columns
  if (NUM_COLS > 1) {
    const divX = outerPadding + colWidth + colGap / 2;
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(divX, TITLE_HEIGHT + sectionGap / 2);
    ctx.lineTo(divX, totalHeight - sectionGap / 2);
    ctx.stroke();
  }

  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, changesWidth, totalHeight);

  return canvas;
}

/**
 * Render the absent teachers image (separate from teachers changes).
 * Vertical list, one teacher per line.
 */
export function renderAbsentImage(absentTeachers: string[], title: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const absentWidth = Math.round(CANVAS_WIDTH * 0.4); // 40% of grid width
  const fontSize = 14;
  const titleFontSize = 18;
  const lineHeight = fontSize + 6;
  const sectionGap = 12;
  const contentPadding = 14;

  canvas.width = absentWidth;
  canvas.height = 1;

  let totalContentHeight = sectionGap; // top padding
  totalContentHeight += absentTeachers.length * lineHeight;
  totalContentHeight += sectionGap; // bottom padding

  const totalHeight = TITLE_HEIGHT + totalContentHeight;

  canvas.width = absentWidth;
  canvas.height = totalHeight;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, absentWidth, totalHeight);

  // Title bar
  ctx.fillStyle = TITLE_BG;
  ctx.fillRect(0, 0, absentWidth, TITLE_HEIGHT);
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = `bold ${titleFontSize}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(`Отсутствуют — ${title}`, contentPadding, TITLE_HEIGHT / 2);

  let y = TITLE_HEIGHT + sectionGap;

  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = TEXT_COLOR;
  ctx.textBaseline = 'top';
  for (const teacher of absentTeachers) {
    ctx.fillText(teacher, contentPadding, y);
    y += lineHeight;
  }

  ctx.strokeStyle = GRID_COLOR;
  ctx.strokeRect(0, 0, absentWidth, totalHeight);

  return canvas;
}

/**
 * Render a replacements (замены) image: table listing which teachers are replaced.
 * Columns: Класс | Урок | Предмет | Иванов → Петров
 */
export function buildReplacementsImage(entries: ReplacementEntry[], title: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const fontSize = 13;
  const titleFontSize = 18;
  const lineHeight = fontSize + 6;
  const padding = CELL_PADDING;
  const outerPadding = 14;

  canvas.width = CANVAS_WIDTH;
  canvas.height = 1;

  ctx.font = `${fontSize}px ${FONT_FAMILY}`;

  const headers = ['Класс', 'Урок', 'Предмет', 'Замена'];
  const rows = entries.map(e => [
    e.className,
    String(e.lessonNum),
    e.subject,
    e.originalTeacher ? `${e.originalTeacher} → ${e.replacementTeacher}` : e.replacementTeacher,
  ]);

  // Measure column widths
  const colWidths = headers.map((h, ci) => {
    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
    let w = ctx.measureText(h).width + padding * 2;
    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    for (const row of rows) {
      const cw = ctx.measureText(row[ci]).width + padding * 2;
      if (cw > w) w = cw;
    }
    return w;
  });

  // Scale to canvas width
  const availableWidth = CANVAS_WIDTH - outerPadding * 2;
  const totalNatural = colWidths.reduce((s, w) => s + w, 0);
  if (totalNatural > availableWidth) {
    const scale = availableWidth / totalNatural;
    for (let i = 0; i < colWidths.length; i++) colWidths[i] = Math.floor(colWidths[i] * scale);
  }

  const rowHeight = lineHeight + padding * 2;
  const headerHeight = rowHeight;
  const totalHeight = TITLE_HEIGHT + headerHeight + rows.length * rowHeight + 1;

  canvas.width = CANVAS_WIDTH;
  canvas.height = totalHeight;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, CANVAS_WIDTH, totalHeight);

  // Title
  ctx.fillStyle = TITLE_BG;
  ctx.fillRect(0, 0, CANVAS_WIDTH, TITLE_HEIGHT);
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = `bold ${titleFontSize}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(`Замены — ${title}`, outerPadding, TITLE_HEIGHT / 2);

  let y = TITLE_HEIGHT;

  // Header row
  ctx.fillStyle = HEADER_BG;
  ctx.fillRect(0, y, CANVAS_WIDTH, headerHeight);
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  let x = outerPadding;
  for (let ci = 0; ci < headers.length; ci++) {
    ctx.fillText(headers[ci], x + padding, y + headerHeight / 2);
    x += colWidths[ci];
  }

  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y + headerHeight);
  ctx.lineTo(CANVAS_WIDTH, y + headerHeight);
  ctx.stroke();

  y += headerHeight;

  // Data rows
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  for (const row of rows) {
    x = outerPadding;
    for (let ci = 0; ci < row.length; ci++) {
      ctx.fillStyle = TEXT_COLOR;
      ctx.textBaseline = 'middle';
      ctx.fillText(row[ci], x + padding, y + rowHeight / 2);
      x += colWidths[ci];
    }
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + rowHeight);
    ctx.lineTo(CANVAS_WIDTH, y + rowHeight);
    ctx.stroke();
    y += rowHeight;
  }

  // Vertical lines
  ctx.strokeStyle = GRID_COLOR;
  x = outerPadding;
  for (let ci = 0; ci < colWidths.length - 1; ci++) {
    x += colWidths[ci];
    ctx.beginPath();
    ctx.moveTo(x, TITLE_HEIGHT);
    ctx.lineTo(x, totalHeight);
    ctx.stroke();
  }

  ctx.strokeRect(0, 0, CANVAS_WIDTH, totalHeight);

  return canvas;
}

// ─── Download ─────────────────────────────────────────────────

/**
 * Download a canvas as PNG file via browser blob link (fallback path).
 */
export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/**
 * Save a canvas as PNG directly into a FileSystemDirectoryHandle (File System Access API).
 * Resolves when the file is written. Throws on error.
 */
export async function saveCanvasPngToFolder(
  canvas: HTMLCanvasElement,
  filename: string,
  dirHandle: FileSystemDirectoryHandle,
): Promise<void> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/png')
  );
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}
