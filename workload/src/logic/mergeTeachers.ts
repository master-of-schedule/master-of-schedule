/**
 * З23-3: Merge two teacher records into one.
 *
 * Used when the duplicate detector (findDuplicateTeachers) surfaces a pair
 * caused by an earlier typo or accidental import. The "keep" record
 * survives; the "remove" record is deleted. Everything attached to the
 * deleted record — assignments, dept-table memberships, homeroom, subjects,
 * defaultRoom — is transferred to the kept record.
 *
 * This is a pure function: it takes the relevant state slices and returns
 * a new snapshot plus a list of conflicts the UI should surface before
 * confirmation. When a conflict exists, the KEPT teacher's data wins —
 * the user is told which of the removed teacher's records were discarded
 * so they can verify the choice or edit manually afterwards.
 */

import type { Assignment, DeptGroup, HomeroomAssignment, RNTeacher } from '../types';

export interface MergeInput {
  teachers: RNTeacher[];
  assignments: Assignment[];
  homeroomAssignments: HomeroomAssignment[];
  deptGroups: DeptGroup[];
}

export interface MergeConflict {
  type:
    | 'assignment-duplicate'
    | 'multiple-homerooms-after-merge'
    | 'homeroom-class-conflict';
  /** User-facing description in Russian. */
  message: string;
}

export interface MergeResult extends MergeInput {
  conflicts: MergeConflict[];
}

/**
 * Merge `removeId` into `keepId`. Returns the updated slices + conflicts.
 *
 * Rules:
 * - Assignments: if both records have an assignment on the same (className,
 *   subject), the kept teacher's wins; the removed one is dropped (conflict).
 *   All other assignments on the removed teacher are re-pointed to keepId.
 * - Homeroom (class→teacher map): re-point every removed-teacher entry to
 *   keepId, removing duplicates if the kept teacher already owns that class.
 *   Surface a conflict if the kept teacher ends up homeroom for >1 class.
 * - Dept-table membership: for each table, replace removeId with keepId and
 *   dedupe within the table's teacherIds.
 * - RNTeacher fields: subjects = union; defaultRoom = kept's (fallback to
 *   removed's if kept has none); homeroomClass = kept's (fallback similarly).
 *   If kept's homeroomClass differs from removed's homeroomClass AND both
 *   are set, surface a conflict — the kept value wins.
 * - If keepId === removeId, or either id is missing, returns input unchanged
 *   with a conflict describing why.
 */
export function mergeTeachers(
  input: MergeInput,
  keepId: string,
  removeId: string,
): MergeResult {
  if (keepId === removeId) {
    return { ...input, conflicts: [{ type: 'assignment-duplicate', message: 'Нельзя объединить запись саму с собой.' }] };
  }

  const keep = input.teachers.find((t) => t.id === keepId);
  const remove = input.teachers.find((t) => t.id === removeId);
  if (!keep || !remove) {
    return { ...input, conflicts: [{ type: 'assignment-duplicate', message: 'Один из учителей не найден.' }] };
  }

  const conflicts: MergeConflict[] = [];

  // ─── Assignments ──────────────────────────────────────────────────────────
  // Kept teacher's existing (class, subject) set — wins over removed on overlap
  const keepSlots = new Set<string>();
  for (const a of input.assignments) {
    if (a.teacherId === keepId) keepSlots.add(`${a.className}::${a.subject}`);
  }

  const mergedAssignments: Assignment[] = [];
  for (const a of input.assignments) {
    if (a.teacherId === removeId) {
      const key = `${a.className}::${a.subject}`;
      if (keepSlots.has(key)) {
        conflicts.push({
          type: 'assignment-duplicate',
          message: `Оба учителя назначены на «${a.subject}» в ${a.className} — оставлено назначение сохраняемого учителя, второе отброшено.`,
        });
        continue;
      }
      mergedAssignments.push({ ...a, teacherId: keepId });
      keepSlots.add(key);
    } else {
      mergedAssignments.push(a);
    }
  }

  // ─── Homeroom assignments ────────────────────────────────────────────────
  // Re-point; drop an entry if the kept teacher already owns that class
  const keepHomeroomClasses = new Set<string>();
  for (const h of input.homeroomAssignments) {
    if (h.teacherId === keepId) keepHomeroomClasses.add(h.className);
  }

  const mergedHomerooms: HomeroomAssignment[] = [];
  for (const h of input.homeroomAssignments) {
    if (h.teacherId === removeId) {
      if (keepHomeroomClasses.has(h.className)) {
        conflicts.push({
          type: 'homeroom-class-conflict',
          message: `Оба учителя были классными руководителями ${h.className} — оставлен сохраняемый учитель.`,
        });
        continue;
      }
      mergedHomerooms.push({ ...h, teacherId: keepId });
      keepHomeroomClasses.add(h.className);
    } else {
      mergedHomerooms.push(h);
    }
  }

  // After-merge sanity: kept teacher with multiple homeroom classes is
  // technically possible (school policy usually forbids it; surface as a warning)
  if (keepHomeroomClasses.size > 1) {
    const classList = [...keepHomeroomClasses].sort().join(', ');
    conflicts.push({
      type: 'multiple-homerooms-after-merge',
      message: `После объединения у «${keep.name}» будет несколько классов классного руководства: ${classList}. Проверьте вручную.`,
    });
  }

  // ─── Dept tables ──────────────────────────────────────────────────────────
  const mergedDeptGroups: DeptGroup[] = input.deptGroups.map((g) => ({
    ...g,
    tables: g.tables.map((tbl) => {
      if (!tbl.teacherIds.includes(removeId)) return tbl;
      const next = tbl.teacherIds
        .map((id) => (id === removeId ? keepId : id))
        .filter((id, idx, arr) => arr.indexOf(id) === idx); // dedupe
      return { ...tbl, teacherIds: next };
    }),
  }));

  // ─── Teacher record itself ────────────────────────────────────────────────
  // subjects: union (kept order-preserving for kept, then new entries from removed)
  const mergedSubjects = [
    ...keep.subjects,
    ...remove.subjects.filter((s) => !keep.subjects.includes(s)),
  ];

  // homeroomClass field — usually mirrors homeroomAssignments; surface conflict
  // if both were set to different classes, kept wins.
  let mergedHomeroomClass = keep.homeroomClass;
  if (!mergedHomeroomClass && remove.homeroomClass) {
    mergedHomeroomClass = remove.homeroomClass;
  } else if (
    keep.homeroomClass &&
    remove.homeroomClass &&
    keep.homeroomClass !== remove.homeroomClass
  ) {
    conflicts.push({
      type: 'homeroom-class-conflict',
      message: `У «${keep.name}» классное руководство ${keep.homeroomClass}, у «${remove.name}» — ${remove.homeroomClass}. После объединения оставлен ${keep.homeroomClass}.`,
    });
  }

  const mergedKeep: RNTeacher = {
    ...keep,
    subjects: mergedSubjects,
    defaultRoom: keep.defaultRoom ?? remove.defaultRoom,
    homeroomClass: mergedHomeroomClass,
  };

  const mergedTeachers = input.teachers
    .filter((t) => t.id !== removeId)
    .map((t) => (t.id === keepId ? mergedKeep : t));

  return {
    teachers: mergedTeachers,
    assignments: mergedAssignments,
    homeroomAssignments: mergedHomerooms,
    deptGroups: mergedDeptGroups,
    conflicts,
  };
}
