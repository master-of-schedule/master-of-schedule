/**
 * Редактор нагрузки — domain types
 *
 * LessonRequirement is imported from the РШР app (v3) to keep the output
 * format in sync. All other types are РН-specific.
 */

// Re-export РШР output type so the rest of the app imports from one place
export type { LessonRequirement } from '@rsh/types/schedule';

// ─── Учебный план ─────────────────────────────────────────────────────────────

/** One subject row inside a grade block */
export interface SubjectRow {
  /** Full subject name as in UP */
  name: string;
  /** Short name for export (editable by user) */
  shortName: string;
  /** Hours per week per class: classname → hours (0 = not taught in this class) */
  hoursPerClass: Record<string, number>;
  /** True if this subject requires a group split (Физкультура, Труд, etc.) */
  groupSplit: boolean;
  /**
   * З11-1: Which UP section this subject belongs to.
   * 'mandatory' = Обязательная часть; 'optional' = Школьная/вариативная часть.
   * Defaults to 'mandatory' for legacy data without this field.
   */
  part: 'mandatory' | 'optional';
}

/** One grade's block in the UP (e.g. "5 класс") */
export interface GradeBlock {
  grade: number;
  subjects: SubjectRow[];
  /**
   * Total hours per class as stated in the UP итого row.
   * Optional — not all UP files have an итого row.
   * Used in ImportPage to compare against computed sum and highlight discrepancies.
   */
  expectedTotals?: Record<string, number>;
}

/** Parsed Учебный план */
export interface CurriculumPlan {
  grades: GradeBlock[];
  /** All unique class names found across all grade blocks, in order */
  classNames: string[];
  /**
   * Number of groups per class for subjects with groupSplit=true.
   * 1 = class is not split; 2 = class is split into 2 groups (default).
   * Missing key = default (2).
   */
  groupCounts?: Record<string, 1 | 2>;
  /**
   * З6-9: User-defined group name overrides.
   * Key structure: overrides[className][subjectName] = [groupNameA, groupNameB]
   * When set, replaces auto-generated "className (initials)" names in export.
   */
  groupNameOverrides?: Record<string, Record<string, [string, string]>>;
}

// ─── Учителя ──────────────────────────────────────────────────────────────────

export interface RNTeacher {
  id: string;
  /** Full name */
  name: string;
  /** Initials, e.g. "ЛВ" (two uppercase letters, no dots) — auto-derived, editable */
  initials: string;
  /** Subjects this teacher can teach */
  subjects: string[];
  /** Default room short name */
  defaultRoom?: string;
  /** Homeroom class name, e.g. "5а" */
  homeroomClass?: string;
}

// ─── Кафедры ──────────────────────────────────────────────────────────────────

/**
 * One assignment table within a DeptGroup.
 * Structurally identical to the old Department — same fields.
 */
export interface DeptTable {
  id: string;
  name: string;
  /** Teacher IDs belonging to this table */
  teacherIds: string[];
  /**
   * Subjects shown in this table.
   * Empty = show all subjects in the parent group's scope (catch-all).
   */
  subjectFilter: string[];
}

/**
 * З7-3: A "кафедра" — one or more assignment tables under a single dept head.
 * Replaces the old flat Department list.
 */
export interface DeptGroup {
  id: string;
  name: string;
  /** Ordered list of tables within this кафедра */
  tables: DeptTable[];
}

/** @deprecated Use DeptTable. Kept only for store migration (v1→v2). */
export interface Department {
  id: string;
  name: string;
  teacherIds: string[];
  subjectFilter: string[];
}

// ─── Назначения ───────────────────────────────────────────────────────────────

/**
 * Assignment: a teacher is assigned to teach a subject to a class.
 * Derived from the checkbox table — one record per assigned cell.
 */
export interface Assignment {
  teacherId: string;
  className: string;
  subject: string;
  /** Hours per week (from UP for this class+subject) */
  hoursPerWeek: number;
  /**
   * З6-8: True when one teacher handles both groups of a split subject.
   * Counts as 2 slots in assignedCount; generates 2 LessonRequirements in export.
   */
  bothGroups?: boolean;
}

// ─── Группы ───────────────────────────────────────────────────────────────────

/**
 * Group pair: two teachers assigned to the same class+subject = group split.
 * Names generated as "className (initials)".
 */
export interface GroupPair {
  className: string;
  subject: string;
  teacherAId: string;
  teacherBId: string;
  /** e.g. "5а (ЛВ)" */
  groupNameA: string;
  /** e.g. "5а (СП)" */
  groupNameB: string;
}

// ─── Разговоры о важном ───────────────────────────────────────────────────────

/**
 * Homeroom assignment: class → teacher.
 * Auto-generates 1h/week "Разговоры о важном" requirement.
 */
export interface HomeroomAssignment {
  className: string;
  teacherId: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  /** Optional extra context shown below the message (e.g. subject breakdown for SanPiN overloads) */
  detail?: string;
  /** Optional: class or teacher name this applies to */
  target?: string;
}
