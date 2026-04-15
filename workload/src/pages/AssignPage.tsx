import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { validateWorkload, hoursPerClass } from '../logic/validation';
import { sanpinMaxForClass, TEACHER_MAX_HOURS } from '../logic/sanpin';
import { shortTeacherName } from '../logic/groupNames';
import { isTeacherBlocked, computeDeptPlanned, visibleClassesForTable } from '../logic/assignHelpers';
import { detectGroupPairs } from '../logic/outputGenerator';
import { useToast } from '../hooks/useToast';
import { useHistory } from '../hooks/useHistory';
import type { CurriculumPlan, Assignment, GroupPair, DeptTable, RNTeacher, ValidationIssue } from '../types';
import styles from './AssignPage.module.css';

interface Props {
  plan: CurriculumPlan | null;
}

export function AssignPage({ plan }: Props) {
  const {
    teachers,
    deptGroups,
    assignments,
    homeroomAssignments,
    setAssignment,
    removeAssignment,
    bulkSetAssignments,
    setGroupNameOverride,
    activeTab,
  } = useStore(useShallow((s) => ({
    teachers: s.teachers,
    deptGroups: s.deptGroups,
    assignments: s.assignments,
    homeroomAssignments: s.homeroomAssignments,
    setAssignment: s.setAssignment,
    removeAssignment: s.removeAssignment,
    bulkSetAssignments: s.bulkSetAssignments,
    setGroupNameOverride: s.setGroupNameOverride,
    activeTab: s.activeTab,
  })));
  const [activeDeptId, setActiveDeptId] = useState<string>(() => deptGroups[0]?.id ?? '');
  const [showValidation, setShowValidation] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const { notify } = useToast();

  // З9-3а: Undo/Redo history (session-only)
  type AssignSnapshot = { assignments: Assignment[] };
  const history = useHistory<AssignSnapshot>();
  const assignmentsRef = useRef(assignments);
  assignmentsRef.current = assignments;

  function pushHistory(description?: string) {
    history.push({ assignments: [...assignmentsRef.current] }, description);
  }

  function handleUndo() {
    const entry = history.undo({ assignments: [...assignmentsRef.current] });
    if (!entry) return;
    bulkSetAssignments(entry.snapshot.assignments);
    notify(entry.description ? `Отменено: ${entry.description}` : 'Назначения: изменение отменено', 'info');
  }

  function handleRedo() {
    const entry = history.redo({ assignments: [...assignmentsRef.current] });
    if (!entry) return;
    bulkSetAssignments(entry.snapshot.assignments);
    notify(entry.description ? `Возвращено: ${entry.description}` : 'Назначения: изменение возвращено', 'info');
  }

  // Stable refs so the keyboard handler never goes stale
  const handleUndoRef = useRef(handleUndo);
  const handleRedoRef = useRef(handleRedo);
  handleUndoRef.current = handleUndo;
  handleRedoRef.current = handleRedo;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // AssignPage is always mounted — only handle keys when this tab is active
      if (activeTabRef.current !== 'assign') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndoRef.current();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedoRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Wrapped assignment actions that push to undo history
  function wrappedSetAssignment(a: Assignment) {
    pushHistory(`назначение «${a.subject}» — ${a.className}`);
    setAssignment(a);
  }

  function wrappedRemoveAssignment(tid: string, cn: string, subj: string) {
    pushHistory(`снятие «${subj}» — ${cn}`);
    removeAssignment(tid, cn, subj);
  }

  function wrappedClearAllForClass(cn: string, tableSubjects: string[]) {
    pushHistory(`снятие всех назначений — ${cn}`);
    const subjectSet = new Set(tableSubjects);
    bulkSetAssignments(
      assignmentsRef.current.filter((a) => !(a.className === cn && subjectSet.has(a.subject))),
    );
  }

  if (!plan) {
    return (
      <div className={styles.placeholder}>
        <h2>Назначения</h2>
        <p>Сначала загрузите учебный план (вкладка 1)</p>
      </div>
    );
  }

  const activeDeptGroup = deptGroups.find((g) => g.id === activeDeptId) ?? deptGroups[0];

  // ── Shared pure helpers ──────────────────────────────────────────────────────

  function isGroupSplit(subjectName: string): boolean {
    return plan!.grades.some((g) => g.subjects.find((s) => s.name === subjectName)?.groupSplit ?? false);
  }

  function groupCount(className: string): 1 | 2 {
    return plan!.groupCounts?.[className] ?? 2;
  }

  // З11-2: sum across all parts — same subject may appear in both mandatory and optional sections
  function upHours(className: string, subject: string): number {
    let total = 0;
    for (const g of plan!.grades) {
      for (const s of g.subjects) {
        if (s.name === subject && className in s.hoursPerClass) {
          total += s.hoursPerClass[className];
        }
      }
    }
    return total;
  }

  function getShortName(subjectName: string): string {
    for (const g of plan!.grades) {
      const s = g.subjects.find((s) => s.name === subjectName);
      if (s?.shortName) return s.shortName;
    }
    return subjectName;
  }

  const assignedCount = useCallback(
    (className: string, subject: string): number =>
      assignments
        .filter((a) => a.className === className && a.subject === subject)
        .reduce((count, a) => count + (a.bothGroups ? 2 : 1), 0),
    [assignments],
  );

  const isAssigned = useCallback(
    (teacherId: string, className: string, subject: string): boolean =>
      assignments.some(
        (a) => a.teacherId === teacherId && a.className === className && a.subject === subject,
      ),
    [assignments],
  );

  // З17-1: use hoursPerClass() which deduplicates groupSplit subjects
  const classTotalsMap = useMemo(() => {
    const totals = hoursPerClass(assignments);
    for (const h of homeroomAssignments) {
      totals[h.className] = (totals[h.className] ?? 0) + 1;
    }
    return totals;
  }, [assignments, homeroomAssignments]);

  const classTotal = useCallback(
    (className: string): number => classTotalsMap[className] ?? 0,
    [classTotalsMap],
  );

  const teacherTotal = useCallback(
    (teacherId: string): number =>
      assignments
        .filter((a) => a.teacherId === teacherId)
        .reduce((sum, a) => sum + a.hoursPerWeek * (a.bothGroups ? 2 : 1), 0),
    [assignments],
  );

  const allGroupPairs = detectGroupPairs(assignments, teachers, plan.groupNameOverrides, plan);
  const issues = showValidation
    ? validateWorkload(plan, teachers, assignments, homeroomAssignments)
    : [];
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warning').length;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <h2 className={styles.heading}>Назначения</h2>
        <button
          className={styles.validateBtn}
          onClick={() => setShowValidation((v) => !v)}
        >
          {showValidation ? 'Скрыть проверку' : 'Проверить нагрузку'}
          {!showValidation && (errorCount + warnCount > 0) && (
            <span className={styles.badge}>{errorCount + warnCount}</span>
          )}
        </button>
        <div className={styles.undoRedoGroup}>
          <button
            className={styles.undoBtn}
            onClick={handleUndo}
            disabled={!history.canUndo}
            title="Отменить (Ctrl+Z)"
          >↩ Отменить</button>
          <button
            className={styles.undoBtn}
            onClick={handleRedo}
            disabled={!history.canRedo}
            title="Повторить (Ctrl+Shift+Z)"
          >↪ Повторить</button>
        </div>
      </div>

      {showValidation && <ValidationPanel issues={issues} />}

      <div className={styles.deptTabs}>
        {deptGroups.map((g) => {
          const teacherCount = teachers.filter((t) =>
            g.tables.some((tbl) => tbl.teacherIds.includes(t.id)),
          ).length;
          return (
            <button
              key={g.id}
              className={`${styles.deptTab} ${g.id === activeDeptId ? styles.deptTabActive : ''}`}
              onClick={() => { setActiveDeptId(g.id); setExpandedKey(null); }}
            >
              {g.name}
              <span className={styles.deptCount}>{teacherCount}</span>
            </button>
          );
        })}
      </div>

      {!activeDeptGroup ? (
        <p className={styles.empty}>Добавьте кафедры на вкладке «Кафедры»</p>
      ) : activeDeptGroup.tables.length === 0 ? (
        <p className={styles.empty}>
          В кафедре «{activeDeptGroup.name}» нет таблиц. Добавьте их на вкладке «Кафедры».
        </p>
      ) : (
        <div className={styles.tablesStack}>
          {activeDeptGroup.tables.length > 1 && (
            <div className={styles.tableNav}>
              {activeDeptGroup.tables.map((tbl, i) => (
                <a key={tbl.id} href={`#table-${tbl.id}`} className={styles.tableNavLink}>
                  {i + 1}. {tbl.name}
                </a>
              ))}
            </div>
          )}
          {activeDeptGroup.tables.map((table) => (
            <DeptTableSection
              key={table.id}
              anchorId={`table-${table.id}`}
              table={table}
              plan={plan}
              teachers={teachers}
              assignments={assignments}
              expandedKey={expandedKey}
              onExpandKey={setExpandedKey}
              setAssignment={wrappedSetAssignment}
              removeAssignment={wrappedRemoveAssignment}
              batchSetAssignment={setAssignment}
              onBeforeAssignAll={() => pushHistory('назначение на все классы')}
              onClearAllForClass={wrappedClearAllForClass}
              setGroupNameOverride={setGroupNameOverride}
              isGroupSplit={isGroupSplit}
              groupCount={groupCount}
              upHours={upHours}
              getShortName={getShortName}
              assignedCount={assignedCount}
              isAssigned={isAssigned}
              classTotal={classTotal}
              teacherTotal={teacherTotal}
              allGroupPairs={allGroupPairs}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── DeptTableSection ────────────────────────────────────────────────────────────

interface DeptTableSectionProps {
  anchorId: string;
  table: DeptTable;
  plan: CurriculumPlan;
  teachers: RNTeacher[];
  assignments: Assignment[];
  expandedKey: string | null;
  onExpandKey: (key: string | null) => void;
  setAssignment: (a: Assignment) => void;
  removeAssignment: (tid: string, cn: string, subj: string) => void;
  batchSetAssignment: (a: Assignment) => void;
  onBeforeAssignAll: () => void;
  /** З16-2: Clear all assignments for a class in this table. tableSubjects = uniqueSubjectNames computed here. */
  onClearAllForClass: (cn: string, tableSubjects: string[]) => void;
  setGroupNameOverride: (cn: string, subj: string, names: [string, string]) => void;
  isGroupSplit: (subj: string) => boolean;
  groupCount: (cn: string) => 1 | 2;
  upHours: (cn: string, subj: string) => number;
  getShortName: (subj: string) => string;
  assignedCount: (cn: string, subj: string) => number;
  isAssigned: (tid: string, cn: string, subj: string) => boolean;
  classTotal: (cn: string) => number;
  teacherTotal: (tid: string) => number;
  allGroupPairs: GroupPair[];
}

function DeptTableSection({
  anchorId, table, plan, teachers, assignments,
  expandedKey, onExpandKey, setAssignment, removeAssignment, batchSetAssignment, onBeforeAssignAll,
  onClearAllForClass,
  setGroupNameOverride, isGroupSplit, groupCount, upHours, getShortName,
  assignedCount, isAssigned, classTotal, teacherTotal, allGroupPairs,
}: DeptTableSectionProps) {
  const { notify } = useToast();
  const tableTeachers = teachers
    .filter((t) => table.teacherIds.includes(t.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const allSubjects = plan.grades.flatMap((g) => g.subjects);
  const tableSubjects = table.subjectFilter.length > 0
    ? allSubjects.filter((s) => table.subjectFilter.includes(s.name))
    : allSubjects;
  const uniqueSubjectNames = [...new Set(tableSubjects.map((s) => s.name))];
  const visibleClassNames = visibleClassesForTable(
    plan.classNames,
    table.subjectFilter.length === 0,
    uniqueSubjectNames,
    upHours,
  );
  const hasGroupSplitSubjects = uniqueSubjectNames.some((name) => isGroupSplit(name));

  // Show "Все классы" button when the table has exactly one non-split subject
  // (e.g. Музыка, ИЗО, ОБЗ — one teacher covers all classes for that subject)
  const isSingleNonSplitTable =
    uniqueSubjectNames.length === 1 && !isGroupSplit(uniqueSubjectNames[0]);

  function handleAssignAllClasses(teacherId: string) {
    // Push ONE history snapshot before the batch — wrappedSetAssignment would push N stale
    // snapshots (assignmentsRef doesn't update until after React re-renders the parent)
    onBeforeAssignAll();
    for (const cn of plan.classNames) {
      handleAutoAssignAll(teacherId, cn);
    }
    notify('Назначено на все классы', 'success');
  }

  function handleAutoAssignAll(teacherId: string, className: string) {
    for (const s of uniqueSubjectNames) {
      if (upHours(className, s) === 0) continue;
      if (isAssigned(teacherId, className, s)) continue;
      const gc = groupCount(className);
      const split = isGroupSplit(s);
      const taken = assignedCount(className, s);
      if (!split && taken >= 1) continue;
      if (split && taken >= gc) continue;
      // Use raw store setAssignment (no history push) — history already pushed above
      batchSetAssignment({ teacherId, className, subject: s, hoursPerWeek: upHours(className, s) });
    }
  }

  function handleClearAllForClass(cn: string) {
    onClearAllForClass(cn, uniqueSubjectNames);
    notify(`Все назначения для класса ${cn} сняты`, 'error');
  }

  function toggleAssign(teacherId: string, className: string, subject: string) {
    const hours = upHours(className, subject);
    if (hours === 0) return;
    if (isAssigned(teacherId, className, subject)) {
      removeAssignment(teacherId, className, subject);
    } else {
      setAssignment({ teacherId, className, subject, hoursPerWeek: hours });
    }
  }

  function handleSetBothGroups(teacherId: string, className: string, subject: string, bothGroups: boolean) {
    const hours = upHours(className, subject);
    setAssignment({ teacherId, className, subject, hoursPerWeek: hours, bothGroups });
  }

  function teacherDeptTotal(teacherId: string): number {
    return assignments
      .filter((a) => a.teacherId === teacherId && uniqueSubjectNames.includes(a.subject))
      .reduce((sum, a) => sum + a.hoursPerWeek * (a.bothGroups ? 2 : 1), 0);
  }

  function deptAssigned(className: string): number {
    return assignments
      .filter((a) => a.className === className && uniqueSubjectNames.includes(a.subject))
      .reduce((sum, a) => sum + a.hoursPerWeek * (a.bothGroups ? 2 : 1), 0);
  }

  function deptPlanned(className: string): number {
    return computeDeptPlanned(
      uniqueSubjectNames,
      (s) => upHours(className, s),
      isGroupSplit,
      groupCount(className),
    );
  }

  function deptUnassigned(className: string): number {
    return Math.max(0, deptPlanned(className) - deptAssigned(className));
  }

  // З10-2: workload summary text for a teacher
  // З12-4: omit zero-hour subjects (only subjects relevant to this class appear)
  // З12-5: append ×2 when teacher has bothGroups=true in that class
  function workloadText(teacherId: string): string {
    if (uniqueSubjectNames.length === 1) {
      const subj = uniqueSubjectNames[0];
      return plan.classNames
        .filter((cn) => isAssigned(teacherId, cn, subj))
        .map((cn) => {
          const a = assignments.find(
            (a) => a.teacherId === teacherId && a.className === cn && a.subject === subj,
          );
          return a?.bothGroups ? `${cn}×2` : cn;
        })
        .join(', ');
    }
    const parts: string[] = [];
    for (const cn of plan.classNames) {
      const hasAny = uniqueSubjectNames.some((s) => isAssigned(teacherId, cn, s));
      if (!hasAny) continue;
      // З12-4: only non-zero hours
      const nonZeroHours = uniqueSubjectNames
        .map((s) => {
          const a = assignments.find(
            (a) => a.teacherId === teacherId && a.className === cn && a.subject === s,
          );
          return a ? a.hoursPerWeek : 0;
        })
        .filter((h) => h > 0);
      // З12-5: ×2 suffix when any assignment in this class has bothGroups
      const hasBothGroups = uniqueSubjectNames.some((s) => {
        const a = assignments.find(
          (a) => a.teacherId === teacherId && a.className === cn && a.subject === s,
        );
        return a?.bothGroups === true;
      });
      parts.push(`${cn}(${nonZeroHours.join('/')})${hasBothGroups ? '×2' : ''}`);
    }
    return parts.join(', ');
  }

  if (tableTeachers.length === 0) {
    return (
      <div id={anchorId} className={styles.tableSection}>
        {table.name && <h3 className={styles.tableSectionHeading}>{table.name}</h3>}
        <p className={styles.empty}>
          В таблице «{table.name}» нет учителей. Добавьте их на вкладке «Кафедры».
        </p>
      </div>
    );
  }

  if (uniqueSubjectNames.length === 0) {
    return (
      <div id={anchorId} className={styles.tableSection}>
        {table.name && <h3 className={styles.tableSectionHeading}>{table.name}</h3>}
        <p className={styles.empty}>Предметы не загружены. Загрузите учебный план на вкладке 1.</p>
      </div>
    );
  }

  if (visibleClassNames.length === 0) {
    return (
      <div id={anchorId} className={styles.tableSection}>
        {table.name && <h3 className={styles.tableSectionHeading}>{table.name}</h3>}
        <p className={styles.empty}>Нет предметов в учебном плане для данной таблицы.</p>
      </div>
    );
  }

  return (
    <div id={anchorId} className={styles.tableSection}>
      {table.name && <h3 className={styles.tableSectionHeading}>{table.name}</h3>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.teacherCol}>Учитель</th>
              <th className={styles.workloadCol}>Нагрузка</th>
              <th className={styles.deptTotalCol}>Итого<br />предмет</th>
              <th className={styles.allTotalCol}>Всего<br />у учит.</th>
              {visibleClassNames.map((cn) => {
                const total = classTotal(cn);
                const max = sanpinMaxForClass(cn);
                const planned = deptPlanned(cn);
                const assigned = deptAssigned(cn);
                const deptOver = planned > 0 && assigned > planned;
                const gc = groupCount(cn);
                const deptComplete = planned > 0 && assigned >= planned;
                return (
                  <th
                    key={cn}
                    className={
                      deptOver ? styles.classHeaderOver :
                      deptComplete ? styles.classHeaderComplete :
                      styles.classHeader
                    }
                  >
                    {cn}
                    <div className={`${styles.classTotal} ${deptOver ? styles.classTotalOver : ''}`}>
                      {total}/{max ?? '?'}
                    </div>
                    {hasGroupSplitSubjects && (
                      <span
                        className={`${styles.groupCountBtn} ${gc === 1 ? styles.groupCountOne : ''}`}
                        title="Количество групп задаётся в Учебном плане"
                      >
                        {gc} гр
                      </span>
                    )}
                    {deptAssigned(cn) > 0 && (
                      <button
                        className={styles.clearAllBtn}
                        onClick={() => handleClearAllForClass(cn)}
                        title={`Снять все назначения для класса ${cn} в этой таблице`}
                      >
                        Отменить все
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
            <tr className={styles.deptStatsRow}>
              <td className={`${styles.teacherCol} ${styles.deptStatsLabel}`}>Кафедра</td>
              <td className={styles.workloadCell}></td>
              <td className={styles.deptTotalCol}></td>
              <td className={styles.allTotalCol}></td>
              {visibleClassNames.map((cn) => {
                const assigned = deptAssigned(cn);
                const planned = deptPlanned(cn);
                const complete = planned > 0 && assigned >= planned;
                return (
                  <td key={cn} className={`${styles.deptStatCell} ${complete ? styles.deptStatComplete : ''}`}>
                    {planned > 0 ? `${assigned}/${planned}` : '—'}
                  </td>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {tableTeachers.map((teacher) => {
              const deptTotal = teacherDeptTotal(teacher.id);
              const total = teacherTotal(teacher.id);
              const over = total > TEACHER_MAX_HOURS;
              const pairsForTeacher = allGroupPairs.filter(
                (p) => p.teacherAId === teacher.id || p.teacherBId === teacher.id,
              );
              return (
                <tr key={teacher.id}>
                  <td className={styles.teacherCell}>
                    <span className={styles.teacherName} title={teacher.name}>{shortTeacherName(teacher.name)}</span>
                    {isSingleNonSplitTable && tableTeachers.length === 1 && (
                      <button
                        className={styles.allClassesBtn}
                        onClick={() => handleAssignAllClasses(teacher.id)}
                        title={`Назначить ${shortTeacherName(teacher.name)} на все классы по предмету «${uniqueSubjectNames[0]}»`}
                      >
                        Все классы
                      </button>
                    )}
                  </td>
                  <td className={styles.workloadCell} title={workloadText(teacher.id)}>
                    {workloadText(teacher.id) || '—'}
                  </td>
                  <td className={styles.deptTotalCell}>
                    {deptTotal > 0 ? deptTotal : '—'}
                  </td>
                  <td className={`${styles.allTotalCell} ${over ? styles.totalOver : ''}`}>
                    {total}
                  </td>
                  {visibleClassNames.map((cn) => {
                    const cellKey = `${table.id}:${teacher.id}:${cn}`;
                    const pairsForClass = pairsForTeacher.filter((p) => p.className === cn);
                    return (
                      <SubjectCell
                        key={cn}
                        teacherId={teacher.id}
                        className={cn}
                        subjects={uniqueSubjectNames}
                        upHours={upHours}
                        isAssigned={isAssigned}
                        onToggle={toggleAssign}
                        getShortName={getShortName}
                        groupCount={groupCount(cn)}
                        assignedCount={assignedCount}
                        plan={plan}
                        isExpanded={expandedKey === cellKey}
                        onExpand={() => onExpandKey(cellKey)}
                        onClose={() => onExpandKey(null)}
                        onAutoAssignAll={() => handleAutoAssignAll(teacher.id, cn)}
                        assignments={assignments}
                        onSetBothGroups={handleSetBothGroups}
                        groupPairsForClass={pairsForClass}
                        onSetGroupNames={setGroupNameOverride}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className={styles.unassignedRow}>
              <td className={`${styles.teacherCol} ${styles.unassignedLabel}`}>Не распределено</td>
              <td className={styles.workloadCell}></td>
              <td className={`${styles.deptTotalCol} ${styles.unassignedCell} ${visibleClassNames.reduce((sum, cn) => sum + deptUnassigned(cn), 0) > 0 ? styles.unassignedNonZero : ''}`}>
                {visibleClassNames.reduce((sum, cn) => sum + deptUnassigned(cn), 0) || '—'}
              </td>
              <td className={styles.allTotalCol}></td>
              {visibleClassNames.map((cn) => {
                const hrs = deptUnassigned(cn);
                return (
                  <td key={cn} className={`${styles.unassignedCell} ${hrs > 0 ? styles.unassignedNonZero : ''}`}>
                    {hrs > 0 ? hrs : '—'}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Per-class cell ──────────────────────────────────────────────────────────────

interface SubjectCellProps {
  teacherId: string;
  className: string;
  subjects: string[];
  upHours: (cn: string, subject: string) => number;
  isAssigned: (tid: string, cn: string, subject: string) => boolean;
  onToggle: (tid: string, cn: string, subject: string) => void;
  getShortName: (name: string) => string;
  groupCount: 1 | 2;
  assignedCount: (cn: string, subject: string) => number;
  plan: CurriculumPlan;
  isExpanded: boolean;
  onExpand: () => void;
  onClose: () => void;
  onAutoAssignAll: () => void;
  assignments: Assignment[];
  onSetBothGroups: (teacherId: string, className: string, subject: string, bothGroups: boolean) => void;
  groupPairsForClass: GroupPair[];
  onSetGroupNames: (className: string, subject: string, names: [string, string]) => void;
}

function SubjectCell({
  teacherId, className, subjects, upHours, isAssigned, onToggle, getShortName,
  groupCount, assignedCount, plan, isExpanded, onExpand, onClose, onAutoAssignAll,
  assignments, onSetBothGroups, groupPairsForClass, onSetGroupNames,
}: SubjectCellProps) {
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [editNameA, setEditNameA] = useState('');
  const [editNameB, setEditNameB] = useState('');

  const assignedSubjects = subjects.filter((s) => isAssigned(teacherId, className, s));
  const availableSubjects = subjects.filter((s) => upHours(className, s) > 0);

  function isGroupSplit(subjectName: string): boolean {
    return plan.grades.some((g) => g.subjects.find((s) => s.name === subjectName)?.groupSplit ?? false);
  }

  function isBlocked(subjectName: string): boolean {
    return isTeacherBlocked(
      assignedCount(className, subjectName),
      isGroupSplit(subjectName),
      groupCount,
      isAssigned(teacherId, className, subjectName),
    );
  }

  function handleCellClick() {
    if (assignedSubjects.length === 0) {
      const toAssign = availableSubjects.filter((s) => !isBlocked(s) && !isAssigned(teacherId, className, s));
      onAutoAssignAll();
      if (toAssign.length !== 1) {
        onExpand();
      }
    } else {
      if (isExpanded) {
        onClose();
      } else {
        onExpand();
      }
    }
  }

  if (availableSubjects.length === 0) {
    return <td className={styles.emptyCell}>—</td>;
  }

  return (
    <td className={styles.assignCell} onClick={handleCellClick}>
      {assignedSubjects.length > 0 ? (
        <div className={styles.chips}>
          {assignedSubjects.map((s) => {
            const a = assignments.find(
              (a) => a.teacherId === teacherId && a.className === className && a.subject === s,
            );
            return (
              <span key={s} className={`${styles.chip} ${a?.bothGroups ? styles.chipBothGroups : ''}`}>
                {getShortName(s)}{a?.bothGroups ? ' ×2' : ''}{' '}
                <span className={styles.chipHours}>({upHours(className, s)})</span>
              </span>
            );
          })}
        </div>
      ) : (
        <span className={styles.plusBtn}>+</span>
      )}

      {isExpanded && (
        <div className={styles.dropdown} onClick={(e) => e.stopPropagation()}>
          {availableSubjects.map((s) => {
            const blocked = isBlocked(s);
            const a = assignments.find(
              (a) => a.teacherId === teacherId && a.className === className && a.subject === s,
            );
            const pair = groupPairsForClass.find(
              (p) => p.subject === s && (p.teacherAId === teacherId || p.teacherBId === teacherId),
            );
            const isEditing = editingSubject === s;

            return (
              <div key={s}>
                <label className={`${styles.dropdownRow} ${blocked ? styles.dropdownRowBlocked : ''}`}>
                  <input
                    type="checkbox"
                    checked={isAssigned(teacherId, className, s)}
                    onChange={() => !blocked && onToggle(teacherId, className, s)}
                    disabled={blocked}
                  />
                  <span title={s}>{getShortName(s)}</span>
                  <span className={styles.dropdownHours}>{upHours(className, s)} ч</span>
                  {blocked && <span className={styles.dropdownBlocked}>занято</span>}
                  {isAssigned(teacherId, className, s) && isGroupSplit(s) && groupCount === 2 && (
                    <button
                      className={`${styles.bothGroupsBtn} ${a?.bothGroups ? styles.bothGroupsBtnActive : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onSetBothGroups(teacherId, className, s, !a?.bothGroups);
                      }}
                      title={a?.bothGroups ? 'Отменить — только одна группа' : 'Назначить на обе группы'}
                    >
                      {a?.bothGroups ? '×2 ✓' : 'обе гр.'}
                    </button>
                  )}
                </label>
                {pair && (
                  isEditing ? (
                    <div className={styles.groupNameEditor}>
                      <input
                        className={styles.groupNameInput}
                        value={editNameA}
                        onChange={(e) => setEditNameA(e.target.value)}
                        placeholder={pair.groupNameA}
                      />
                      <input
                        className={styles.groupNameInput}
                        value={editNameB}
                        onChange={(e) => setEditNameB(e.target.value)}
                        placeholder={pair.groupNameB}
                      />
                      <div className={styles.groupNameActions}>
                        <button
                          className={styles.groupNameSaveBtn}
                          onClick={() => {
                            const nameA = editNameA.trim() || pair.groupNameA;
                            const nameB = editNameB.trim() || pair.groupNameB;
                            onSetGroupNames(className, s, [nameA, nameB]);
                            setEditingSubject(null);
                          }}
                        >
                          Сохранить
                        </button>
                        <button
                          className={styles.groupNameCancelBtn}
                          onClick={() => setEditingSubject(null)}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.groupNames}>
                      <span className={styles.groupNameTag}>{pair.groupNameA}</span>
                      <span className={styles.groupNameSep}>|</span>
                      <span className={styles.groupNameTag}>{pair.groupNameB}</span>
                      <button
                        className={styles.groupNameEditBtn}
                        title="Переименовать группы"
                        onClick={() => {
                          setEditingSubject(s);
                          setEditNameA(pair.groupNameA);
                          setEditNameB(pair.groupNameB);
                        }}
                      >
                        ✎
                      </button>
                    </div>
                  )
                )}
              </div>
            );
          })}
          <button className={styles.closeDropdown} onClick={onClose}>Закрыть</button>
        </div>
      )}
    </td>
  );
}

// ── Validation panel ────────────────────────────────────────────────────────────

function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) {
    return <div className={styles.validOk}>Всё в порядке — нарушений не найдено.</div>;
  }
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return (
    <div className={styles.validPanel}>
      {errors.map((i, idx) => (
        <div key={idx} className={styles.validError}>
          ⚠ {i.message}
          {i.detail && <div className={styles.validDetail}>{i.detail}</div>}
        </div>
      ))}
      {warnings.map((i, idx) => (
        <div key={idx} className={styles.validWarn}>○ {i.message}</div>
      ))}
    </div>
  );
}
