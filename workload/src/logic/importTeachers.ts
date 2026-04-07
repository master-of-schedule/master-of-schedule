/**
 * Imports teacher list from РШР's data.xlsx.
 *
 * Expected sheet: "Учителя" (or first sheet)
 * Columns: [0] Фамилия И.О. | [1] Кабинет | [2..] other (ignored)
 *
 * Name format in data.xlsx: "Авдеева Н.В." (surname + initials)
 * Room format: "-2.10-" → stored as "2.10" (leading/trailing dashes stripped)
 */

import * as XLSX from 'xlsx';
import type { RNTeacher } from '../types';
import { generateId } from '../utils/generateId';

/** Extract initials from "Авдеева Н.В." → "НВ" (two uppercase letters, no dots, З3-7) */
export function parseInitials(name: string): string {
  const spaceIdx = name.indexOf(' ');
  if (spaceIdx < 0) return '';
  return name.slice(spaceIdx + 1).trim().replace(/\./g, '');
}

/** Strip surrounding dashes from room string: "-2.10-" → "2.10" */
export function parseRoom(raw: string): string | undefined {
  const cleaned = raw.replace(/^[-–\s]+|[-–\s]+$/g, '').trim();
  return cleaned || undefined;
}

export async function importTeachersFromDataXlsx(file: File): Promise<RNTeacher[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const sheetName = wb.SheetNames.find((n) => /учител/i.test(n)) ?? wb.SheetNames[0];
  if (!sheetName) throw new Error('Файл не содержит листов');

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
  }) as (string | number)[][];

  const teachers: RNTeacher[] = [];

  for (let ri = 1; ri < rows.length; ri++) {
    const row = rows[ri];
    const name = String(row[0] ?? '').trim();
    if (!name) continue;

    const room = parseRoom(String(row[1] ?? ''));
    teachers.push({
      id: generateId('t'),
      name,
      initials: parseInitials(name),
      subjects: [],
      ...(room ? { defaultRoom: room } : {}),
    });
  }

  return teachers;
}
