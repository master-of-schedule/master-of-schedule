/**
 * Учебный план (UP) Excel parser.
 *
 * Expected format (school standard, e.g. Книга1.xlsx):
 * - Sheet named "Учебный план" (or first sheet)
 * - Grade blocks: row where col[1] = "X класс" starts a new block
 * - Class names: either on the same grade-header row in col[2+] (e.g. 5th grade),
 *   or on the immediately following row in col[1+] (6th grade and above)
 * - Subject rows: col[0] = section label (optional, ignored),
 *   col[1] = subject name, col[2+] = hours per class
 * - Rows with empty col[1] are skipped (section dividers, итого rows, blank rows)
 * - Class names are normalised: "5а" → "5-а", "  5д " → "5-д" (З2-3)
 * - Both Обязательная часть and Школьная часть are parsed — no special handling
 */

import * as XLSX from 'xlsx';
import type { CurriculumPlan, GradeBlock, SubjectRow } from '../types';
import { compareClassNames } from './classSort';

const GRADE_HEADER_RE = /^(\d{1,2})\s*([-–й].*)?класс/i;
const CLASS_NAME_RE = /^\d{1,2}[-–]?[а-яёА-ЯЁa-zA-Z]/;

const GROUP_SPLIT_PATTERNS = [/физкультур/i, /физическая культура/i, /труд/i, /технолог/i, /информатик/i];

function defaultGroupSplit(subjectName: string): boolean {
  return GROUP_SPLIT_PATTERNS.some((p) => p.test(subjectName));
}

/** Normalise class name to school standard: "5а" → "5-а", "  5д " → "5-д" */
export function normalizeClassName(raw: string): string {
  const s = raw.trim();
  if (/^\d{1,2}-/.test(s)) return s; // already has dash
  const m = s.match(/^(\d{1,2})(.+)$/);
  if (m) return `${m[1]}-${m[2]}`;
  return s;
}

function isClassNameCell(val: string | number | null): boolean {
  if (typeof val !== 'string') return false;
  return CLASS_NAME_RE.test(val.trim());
}

/** Derive a short display name from a full subject name */
function deriveShortName(name: string): string {
  const MAP: Record<string, string> = {
    'Русский язык': 'Рус.яз',
    'Литература': 'Лит',
    'Иностранный язык': 'Ин.яз',
    'Английский': 'Англ',
    'Математика': 'Мат',
    'Алгебра': 'Алг',
    'Геометрия': 'Геом',
    'Вероятность и статистика': 'Вер.стат',
    'Физика': 'Физ',
    'Химия': 'Хим',
    'Биология': 'Био',
    'География': 'Гео',
    'История': 'Ист',
    'Обществознание': 'Обш',
    'Информатика': 'Инф',
    'Физическая культура': 'Физ-ра',
    'Физкультура': 'Физ-ра',
    'Труд': 'Труд',
    'Технология': 'Техн',
    'ИЗО': 'ИЗО',
    'Изобразительное искусство': 'ИЗО',
    'Музыка': 'Муз',
    'Основы безопасности': 'ОБЖ',
    'ОБЖ': 'ОБЖ',
    'Родной язык': 'Родн.яз',
    'Родная литература': 'Родн.лит',
    'Разговоры о важном': 'Разг',
    'Духовно': 'ОДНКНР',
  };
  for (const [full, short] of Object.entries(MAP)) {
    if (name.toLowerCase().startsWith(full.toLowerCase())) return short;
  }
  const first = name.split(/\s+/)[0];
  return first.length > 8 ? first.slice(0, 6) + '.' : first;
}

export async function parseUP(file: File): Promise<CurriculumPlan> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const sheetName =
    wb.SheetNames.find((n) => /учебный план/i.test(n)) ?? wb.SheetNames[0];
  if (!sheetName) throw new Error('Файл не содержит листов');

  const ws = wb.Sheets[sheetName];
  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
  }) as (string | number | null)[][];

  if (rows.length === 0) throw new Error(`Лист "${sheetName}" пуст`);

  // ── Locate all grade-header rows (col[1] matches "X класс") ───────────────
  const gradeStarts: { rowIndex: number; grade: number }[] = [];
  for (let ri = 0; ri < rows.length; ri++) {
    const col1 = rows[ri][1];
    if (typeof col1 === 'string') {
      const m = col1.trim().match(GRADE_HEADER_RE);
      if (m) gradeStarts.push({ rowIndex: ri, grade: parseInt(m[1], 10) });
    }
  }

  if (gradeStarts.length === 0) {
    throw new Error(
      'Не удалось найти блоки классов. Убедитесь, что в файле есть строки с «5 класс», «6 класс» и т.д.',
    );
  }

  // ── Parse each grade block ─────────────────────────────────────────────────
  const grades: GradeBlock[] = [];
  const allClassNames: string[] = [];

  for (let gi = 0; gi < gradeStarts.length; gi++) {
    const { rowIndex, grade } = gradeStarts[gi];
    const nextGradeRow =
      gi + 1 < gradeStarts.length ? gradeStarts[gi + 1].rowIndex : rows.length;

    // Determine class columns:
    // Case A — classes on same row as grade header (e.g. 5th grade in Книга1.xlsx):
    //   ["", "5 класс", "5а", "5б", ...]
    // Case B — classes on the next row (6th grade and above):
    //   ["", "6 класс", ...]
    //   ["", "", "6а", "6б", ...]
    let classColIndices: number[] = [];
    let classNames: string[] = [];
    let subjectStartRow = rowIndex + 1;

    const headerRow = rows[rowIndex];
    const sameRowClasses = headerRow
      .slice(2)
      .map((v, i) => ({ ci: i + 2, v }))
      .filter(({ v }) => isClassNameCell(v));

    if (sameRowClasses.length >= 1) {
      classColIndices = sameRowClasses.map(({ ci }) => ci);
      classNames = sameRowClasses.map(({ v }) => normalizeClassName(v as string));
      subjectStartRow = rowIndex + 1;
    } else {
      // Case B: classes may span one or more rows following the grade header.
      // Keep reading rows until we hit a subject row (non-empty col[1] that is not a class name).
      for (let ri = rowIndex + 1; ri < Math.min(rowIndex + 10, nextGradeRow); ri++) {
        const row = rows[ri];
        const col1 = row[1];
        const col1Str = col1 !== null && col1 !== undefined ? String(col1).trim() : '';

        // Non-empty col[1] that isn't itself a class name means subject rows have started
        if (col1Str !== '' && !isClassNameCell(col1) && classColIndices.length > 0) break;

        const candidates = row
          .slice(1)
          .map((v, i) => ({ ci: i + 1, v }))
          .filter(({ v }) => isClassNameCell(v));

        if (candidates.length >= 1) {
          for (const { ci, v } of candidates) {
            if (!classColIndices.includes(ci)) {
              classColIndices.push(ci);
              classNames.push(normalizeClassName(v as string));
            }
          }
          subjectStartRow = ri + 1;
        }
      }
    }

    if (classColIndices.length === 0) continue;

    for (const cn of classNames) {
      if (!allClassNames.includes(cn)) allClassNames.push(cn);
    }

    // ── Parse subject rows ───────────────────────────────────────────────────
    const subjects: SubjectRow[] = [];
    // Collect candidate итого rows (empty col[1], has numbers in class columns)
    const candidateTotals: Record<string, number>[] = [];
    // З11-1: Track current UP section (mandatory vs optional)
    let currentPart: 'mandatory' | 'optional' = 'mandatory';

    for (let ri = subjectStartRow; ri < nextGradeRow; ri++) {
      const row = rows[ri];
      const col1 = row[1];

      // Rows with empty col[1]: may be section dividers or итого rows
      if (col1 === null || col1 === undefined || String(col1).trim() === '') {
        // З11-1: Check col[0] for section header keywords
        const col0 = row[0];
        if (col0 !== null && col0 !== undefined) {
          const col0Str = String(col0).trim().toLowerCase();
          if (/школьн|вариатив|формируемая/.test(col0Str)) {
            currentPart = 'optional';
          } else if (/обязательн/.test(col0Str)) {
            currentPart = 'mandatory';
          }
        }
        // Check if this looks like an итого row (has numbers in class columns)
        const totalsCandidate: Record<string, number> = {};
        let hasNumbers = false;
        for (let i = 0; i < classColIndices.length; i++) {
          const val = row[classColIndices[i]];
          const n = typeof val === 'number' ? val : parseFloat(String(val ?? ''));
          if (!isNaN(n) && n > 0) { totalsCandidate[classNames[i]] = n; hasNumbers = true; }
        }
        if (hasNumbers) candidateTotals.push(totalsCandidate);
        continue;
      }

      const subjectName = String(col1).trim();

      // З11-1: Also check col[0] on subject rows for section header (some UP formats put it on the same row)
      const col0 = row[0];
      if (col0 !== null && col0 !== undefined) {
        const col0Str = String(col0).trim().toLowerCase();
        if (/школьн|вариатив|формируемая/.test(col0Str)) {
          currentPart = 'optional';
        } else if (/обязательн/.test(col0Str)) {
          currentPart = 'mandatory';
        }
      }

      const hoursPerClass: Record<string, number> = {};
      let hasAnyHours = false;
      for (let i = 0; i < classColIndices.length; i++) {
        const val = row[classColIndices[i]];
        const hours = typeof val === 'number' ? val : parseFloat(String(val ?? ''));
        if (!isNaN(hours) && hours > 0) {
          hoursPerClass[classNames[i]] = hours;
          hasAnyHours = true;
        }
      }

      if (!hasAnyHours) continue;

      subjects.push({
        name: subjectName,
        shortName: deriveShortName(subjectName),
        hoursPerClass,
        groupSplit: defaultGroupSplit(subjectName),
        part: currentPart,
      });
    }

    if (subjects.length > 0) {
      // Take the итого candidate with the largest total (grand total, not sub-total)
      let expectedTotals: Record<string, number> | undefined;
      if (candidateTotals.length > 0) {
        expectedTotals = candidateTotals.reduce((best, curr) => {
          const sumBest = Object.values(best).reduce((a, b) => a + b, 0);
          const sumCurr = Object.values(curr).reduce((a, b) => a + b, 0);
          return sumCurr > sumBest ? curr : best;
        });
      }
      grades.push({ grade, subjects, ...(expectedTotals ? { expectedTotals } : {}) });
    }
  }

  if (grades.length === 0) {
    throw new Error(
      'Не удалось разобрать ни одного блока с предметами. Проверьте структуру файла.',
    );
  }

  allClassNames.sort(compareClassNames);
  return { grades, classNames: allClassNames };
}
