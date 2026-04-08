import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { parseUP } from '../logic/parseUP';
import { createUPSnapshot } from '../logic/upSnapshot';
import { applyGroupSplitToggle } from '../logic/planUtils';
import { downloadUPTemplate } from '../logic/upTemplate';
import { downloadPlanXlsx } from '../logic/planExport';
import { compareClassNames } from '../logic/classSort';
import { useToast } from '../hooks/useToast';
import type { CurriculumPlan, SubjectRow } from '../types';
import styles from './ImportPage.module.css';

/** З12-3: Apply stored short names to a freshly parsed plan before setting it as draft. */
function applyStoredShortNames(plan: CurriculumPlan, shortNames: Record<string, string>): CurriculumPlan {
  if (Object.keys(shortNames).length === 0) return plan;
  return {
    ...plan,
    grades: plan.grades.map((g) => ({
      ...g,
      subjects: g.subjects.map((s) => {
        const n = s.name.trim().replace(/\s+/g, ' ');
        const stored = shortNames[n];
        return stored ? { ...s, shortName: stored } : s;
      }),
    })),
  };
}

/** З12-2: Undo entry — always stores the plan; optionally stores assignments+homeroom (class deletion). */
type UndoEntry = {
  plan: CurriculumPlan;
  assignments?: import('../types').Assignment[];
  homeroom?: import('../types').HomeroomAssignment[];
  description?: string;
};

export function ImportPage() {
  const {
    curriculumPlan, setCurriculumPlan, setSubjectShortName, assignments,
    homeroomAssignments, deleteClass, subjectShortNames,
    bulkSetAssignments, bulkSetHomeroomAssignments, activeTab,
  } = useStore();
  const { notify } = useToast();
  const [draft, setDraft] = useState<CurriculumPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // З11-3: local undo/redo stack for UP edits (plan snapshots before mutations)
  // З12-2: extended to also snapshot assignments+homeroom for class deletion undo
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);

  function pushUndo(includeAssignments = false, description?: string) {
    const current = draft ?? curriculumPlan;
    if (!current) return;
    const entry: UndoEntry = { plan: current, description };
    if (includeAssignments) {
      entry.assignments = [...assignments];
      entry.homeroom = [...homeroomAssignments];
    }
    undoStack.current = [...undoStack.current.slice(-49), entry];
    redoStack.current = [];
  }

  const handleUndoRedo = useCallback((e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.key !== 'z') return;
    e.preventDefault();
    if (e.shiftKey) {
      // Redo
      if (redoStack.current.length === 0) return;
      const next = redoStack.current[0];
      redoStack.current = redoStack.current.slice(1);
      const current = draft ?? curriculumPlan;
      if (current) {
        const entry: UndoEntry = { plan: current };
        if (next.assignments) { entry.assignments = [...assignments]; entry.homeroom = [...homeroomAssignments]; }
        undoStack.current = [...undoStack.current, entry];
      }
      if (draft !== null) setDraft(next.plan); else setCurriculumPlan(next.plan);
      if (next.assignments) { bulkSetAssignments(next.assignments); bulkSetHomeroomAssignments(next.homeroom ?? []); }
      notify(next.description ? `Возвращено: ${next.description}` : 'Изменение возвращено', 'info');
    } else {
      // Undo
      if (undoStack.current.length === 0) return;
      const prev = undoStack.current[undoStack.current.length - 1];
      undoStack.current = undoStack.current.slice(0, -1);
      const current = draft ?? curriculumPlan;
      if (current) {
        const entry: UndoEntry = { plan: current };
        if (prev.assignments) { entry.assignments = [...assignments]; entry.homeroom = [...homeroomAssignments]; }
        redoStack.current = [entry, ...redoStack.current.slice(0, 49)];
      }
      if (draft !== null) setDraft(prev.plan); else setCurriculumPlan(prev.plan);
      if (prev.assignments) { bulkSetAssignments(prev.assignments); bulkSetHomeroomAssignments(prev.homeroom ?? []); }
      notify(prev.description ? `Отменено: ${prev.description}` : 'Изменение отменено', 'info');
    }
  }, [draft, curriculumPlan, assignments, homeroomAssignments, setCurriculumPlan, bulkSetAssignments, bulkSetHomeroomAssignments, notify]);

  // Only register Ctrl+Z when this tab is active — ImportPage is always mounted
  // so the undo stack (refs) survive tab switches, but the listener must not
  // conflict with the AssignPage handler when the assign tab is open.
  useEffect(() => {
    if (activeTab !== 'import') return;
    window.addEventListener('keydown', handleUndoRedo);
    return () => window.removeEventListener('keydown', handleUndoRedo);
  }, [handleUndoRedo, activeTab]);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const plan = await parseUP(file);
      // З12-3: apply stored short names so they survive loading a different file
      setDraft(applyStoredShortNames(plan, subjectShortNames));
      notify('Файл загружен — проверьте данные и нажмите «Подтвердить»', 'info');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось прочитать файл');
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  // З3-2: applies to ALL grade blocks that have the same subject name (regardless of part — same name → same short label)
  // З11-5: also persist the mapping in the store so it survives UP reloads
  function handleShortNameChange(_grade: number, subjectName: string, value: string) {
    const target = draft ?? curriculumPlan;
    if (!target) return;
    const updated = {
      ...target,
      grades: target.grades.map((g) => ({
        ...g,
        subjects: g.subjects.map((s) =>
          s.name !== subjectName ? s : { ...s, shortName: value },
        ),
      })),
    };
    setSubjectShortName(subjectName, value);
    if (draft) setDraft(updated); else setCurriculumPlan(updated);
  }

  // З11-2: part param ensures we only update the specific row (mandatory vs optional can share a name)
  function handleHoursChange(_grade: number, subjectName: string, part: SubjectRow['part'], className: string, value: number) {
    const target = draft ?? curriculumPlan;
    if (!target) return;
    pushUndo(false, `изменение часов «${subjectName}» — ${className}`);
    const updated = {
      ...target,
      grades: target.grades.map((g) => ({
        ...g,
        subjects: g.subjects.map((s) => {
          if (s.name !== subjectName || s.part !== part) return s;
          const next = { ...s.hoursPerClass };
          if (value === 0) delete next[className];
          else next[className] = value;
          return { ...s, hoursPerClass: next };
        }),
      })),
    };
    if (draft) setDraft(updated); else setCurriculumPlan(updated);
  }

  // З12-1: change part ('mandatory' | 'optional') for all rows matching (name, currentPart) across all grades
  function handlePartChange(_grade: number, subjectName: string, currentPart: SubjectRow['part'], newPart: SubjectRow['part']) {
    const target = draft ?? curriculumPlan;
    if (!target) return;
    pushUndo(false, `изменение части «${subjectName}»`);
    const updated = {
      ...target,
      grades: target.grades.map((g) => ({
        ...g,
        subjects: g.subjects.map((s) =>
          s.name !== subjectName || s.part !== currentPart ? s : { ...s, part: newPart },
        ),
      })),
    };
    if (draft) setDraft(updated); else setCurriculumPlan(updated);
  }

  // З3-3: toggle is live on both draft and confirmed plan; З11-2: scoped to specific part
  function handleGroupSplitToggle(grade: number, subjectName: string, part: SubjectRow['part'], onlyThisGrade?: boolean) {
    const target = draft ?? curriculumPlan;
    if (!target) return;
    pushUndo(false, `деление на группы «${subjectName}»`);
    const updated = applyGroupSplitToggle(target, grade, subjectName, part, !!onlyThisGrade);
    if (draft) setDraft(updated); else setCurriculumPlan(updated);
  }

  function handleSubjectAdd(grade: number, subjectName: string) {
    const target = draft ?? curriculumPlan;
    if (!target) return;
    pushUndo(false, `добавление предмета «${subjectName}»`);
    const updated = {
      ...target,
      grades: target.grades.map((g) => {
        if (g.grade !== grade) return g;
        if (g.subjects.find((s) => s.name === subjectName && s.part === 'optional')) return g;
        return {
          ...g,
          subjects: [...g.subjects, { name: subjectName, shortName: subjectName, groupSplit: false, hoursPerClass: {}, part: 'optional' as const }],
        };
      }),
    };
    if (draft) setDraft(updated); else setCurriculumPlan(updated);
  }

  // З11-2: delete only the specific (name, part) row
  function handleSubjectDelete(grade: number, subjectName: string, part: SubjectRow['part']) {
    const target = draft ?? curriculumPlan;
    if (!target) return;
    pushUndo(false, `удаление предмета «${subjectName}»`);
    const hasAssignments = assignments.some((a) => a.subject === subjectName);
    if (hasAssignments && !confirm(`Предмет «${subjectName}» уже используется в назначениях. Удалить всё равно?`)) return;
    const updated = {
      ...target,
      grades: target.grades.map((g) => {
        if (g.grade !== grade) return g;
        return { ...g, subjects: g.subjects.filter((s) => !(s.name === subjectName && s.part === part)) };
      }),
    };
    if (draft) setDraft(updated); else setCurriculumPlan(updated);
    notify(`Предмет «${subjectName}» удалён`, 'error');
  }

  // З7-1б: group count is edited only in ImportPage
  function handleGroupCountChange(className: string, count: 1 | 2) {
    const target = draft ?? curriculumPlan;
    if (!target) return;
    pushUndo(false, `количество групп ${className}`);
    const groupCounts = { ...(target.groupCounts ?? {}), [className]: count };
    const updated = { ...target, groupCounts };
    if (draft) setDraft(updated); else setCurriculumPlan(updated);
  }

  // З9-1б: copy all hoursPerClass from sourceClass into a new class
  function handleClassCopy(_grade: number, sourceClass: string, newClass: string) {
    const target = draft ?? curriculumPlan;
    if (!target) return;
    pushUndo(false, `копирование ${sourceClass} → ${newClass}`);
    const updated: CurriculumPlan = {
      ...target,
      classNames: [...target.classNames, newClass].sort(compareClassNames),
      groupCounts: {
        ...(target.groupCounts ?? {}),
        [newClass]: target.groupCounts?.[sourceClass] ?? 2,
      },
      grades: target.grades.map((g) => {
        if (g.grade !== _grade) return g;
        return {
          ...g,
          subjects: g.subjects.map((s) => ({
            ...s,
            hoursPerClass: { ...s.hoursPerClass, [newClass]: s.hoursPerClass[sourceClass] ?? 0 },
          })),
        };
      }),
    };
    if (draft) setDraft(updated); else setCurriculumPlan(updated);
    notify(`Класс ${newClass} добавлен (копия ${sourceClass})`, 'success');
  }

  // З7-1а: add a new class to a grade block
  function handleClassAdd(_grade: number, className: string) {
    const target = draft ?? curriculumPlan;
    if (!target) return;
    pushUndo(false, `добавление класса ${className}`);
    const updated: CurriculumPlan = {
      ...target,
      classNames: [...target.classNames, className].sort(compareClassNames),
      grades: target.grades.map((g) => {
        if (g.grade !== _grade) return g;
        return {
          ...g,
          subjects: g.subjects.map((s) => ({
            ...s,
            hoursPerClass: { ...s.hoursPerClass, [className]: 0 },
          })),
        };
      }),
    };
    if (draft) setDraft(updated); else setCurriculumPlan(updated);
    notify(`Класс ${className} добавлен`, 'success');
  }

  // З7-1а: delete a class from the plan (and all dependent data when confirmed)
  // З12-2: snapshot assignments+homeroom before deletion so Ctrl+Z fully restores them
  function handleClassDelete(_grade: number, className: string) {
    const target = draft ?? curriculumPlan;
    if (!target) return;
    if (!draft) {
      const hasAssignments = assignments.some((a) => a.className === className);
      if (
        hasAssignments &&
        !confirm(`В классе ${className} есть назначения. Удалить вместе с ними?`)
      ) return;
      // З12-2: snapshot plan + assignments + homeroom so Ctrl+Z fully restores them
      pushUndo(true, `удаление класса ${className}`);
      deleteClass(className);
    } else {
      pushUndo(false, `удаление класса ${className}`);
      const updated: CurriculumPlan = {
        ...target,
        classNames: target.classNames.filter((cn) => cn !== className),
        grades: target.grades.map((g) => {
          if (g.grade !== _grade) return g;
          return {
            ...g,
            subjects: g.subjects.map((s) => {
              const { [className]: _removed, ...rest } = s.hoursPerClass;
              return { ...s, hoursPerClass: rest };
            }),
          };
        }),
      };
      setDraft(updated);
    }
    notify(`Класс ${className} удалён`, 'error');
  }

  // MU-3: export current plan as JSON snapshot
  function handleExportUP() {
    const plan = draft ?? curriculumPlan;
    if (!plan) return;
    const snap = createUPSnapshot(plan);
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'учебный_план.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleConfirm() {
    if (draft) {
      pushUndo(false, 'подтверждение плана');
      const parallelCount = draft.grades.length;
      const subjectCount = draft.grades.reduce((n, g) => n + g.subjects.length, 0);
      setCurriculumPlan(draft);
      setDraft(null);
      notify(`Учебный план подтверждён: ${parallelCount} параллелей, ${subjectCount} предметов`, 'success');
    }
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>Учебный план</h2>

      {/* З11-4: Prominent draft banner at the top — hard to miss */}
      {draft && (
        <div className={styles.draftBanner}>
          <span className={styles.draftBannerText}>
            Новый учебный план загружен — проверьте данные и нажмите «Подтвердить».
          </span>
          <div className={styles.draftBannerActions}>
            <button className={styles.confirmBtnPrimary} onClick={handleConfirm}>
              Подтвердить
            </button>
            <button className={styles.cancelBtn} onClick={() => setDraft(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {!draft && (
        <>
          <div
            className={styles.dropzone}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              className={styles.fileInput}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {loading ? (
              <p>Читаю файл...</p>
            ) : (
              <>
                <p className={styles.dropText}>Перетащите файл учебного плана (.xlsx) сюда</p>
                <p className={styles.dropHint}>или нажмите чтобы выбрать</p>
              </>
            )}
          </div>
          <button className={styles.templateBtn} onClick={downloadUPTemplate}>
            Скачать шаблон .xlsx
          </button>
        </>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {curriculumPlan && !draft && (
        <div className={styles.loaded}>
          <p className={styles.loadedInfo}>
            Загружен УП: {curriculumPlan.grades.length} параллелей,{' '}
            {curriculumPlan.grades.reduce((n, g) => n + g.subjects.length, 0)} предметов
          </p>
          <div className={styles.loadedActions}>
            <button className={styles.reloadBtn} onClick={() => inputRef.current?.click()}>
              Загрузить другой файл
            </button>
            <button className={styles.exportUpBtn} onClick={handleExportUP}>
              Скачать УП (JSON)
            </button>
            <button className={styles.exportUpBtn} onClick={() => downloadPlanXlsx(curriculumPlan)}>
              Скачать УП (.xlsx)
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className={styles.fileInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <PlanPreview
            plan={curriculumPlan}
            onShortNameChange={handleShortNameChange}
            onPartChange={handlePartChange}
            onGroupSplitToggle={handleGroupSplitToggle}
            onHoursChange={handleHoursChange}
            onSubjectAdd={handleSubjectAdd}
            onSubjectDelete={handleSubjectDelete}
            onGroupCountChange={handleGroupCountChange}
            onClassDelete={handleClassDelete}
            onClassAdd={handleClassAdd}
            onClassCopy={handleClassCopy}
          />
        </div>
      )}

      {draft && (
        <PlanPreview
          plan={draft}
          onShortNameChange={handleShortNameChange}
          onPartChange={handlePartChange}
          onGroupSplitToggle={handleGroupSplitToggle}
          onHoursChange={handleHoursChange}
          onSubjectAdd={handleSubjectAdd}
          onSubjectDelete={handleSubjectDelete}
          onGroupCountChange={handleGroupCountChange}
          onClassDelete={handleClassDelete}
          onClassAdd={handleClassAdd}
          onClassCopy={handleClassCopy}
        />
      )}
    </div>
  );
}

// ── Preview table ──────────────────────────────────────────────────────────────

interface PlanPreviewProps {
  plan: CurriculumPlan;
  readOnly?: boolean;
  onShortNameChange?: (grade: number, subjectName: string, value: string) => void;
  onPartChange?: (grade: number, subjectName: string, currentPart: SubjectRow['part'], newPart: SubjectRow['part']) => void;
  onGroupSplitToggle?: (grade: number, subjectName: string, part: SubjectRow['part'], onlyThisGrade?: boolean) => void;
  onHoursChange?: (grade: number, subjectName: string, part: SubjectRow['part'], className: string, value: number) => void;
  onSubjectAdd?: (grade: number, subjectName: string) => void;
  onSubjectDelete?: (grade: number, subjectName: string, part: SubjectRow['part']) => void;
  onGroupCountChange?: (className: string, count: 1 | 2) => void;
  onClassDelete?: (grade: number, className: string) => void;
  onClassAdd?: (grade: number, className: string) => void;
  onClassCopy?: (grade: number, sourceClass: string, newClass: string) => void;
}

function PlanPreview({ plan, readOnly, onShortNameChange, onPartChange, onGroupSplitToggle, onHoursChange, onSubjectAdd, onSubjectDelete, onGroupCountChange, onClassDelete, onClassAdd, onClassCopy }: PlanPreviewProps) {
  return (
    <div className={styles.preview}>
      {plan.grades.map((g) => (
        <details key={g.grade} className={styles.gradeBlock} open={plan.grades.length <= 4}>
          <summary className={styles.gradeSummary}>
            {g.grade} класс — {g.subjects.length} предметов
          </summary>
          <GradeTable
            grade={g.grade}
            subjects={g.subjects}
            expectedTotals={g.expectedTotals}
            classNames={plan.classNames.filter((cn) => gradeOf(cn) === g.grade)}
            groupCounts={plan.groupCounts}
            readOnly={readOnly}
            onShortNameChange={onShortNameChange}
            onPartChange={onPartChange}
            onGroupSplitToggle={onGroupSplitToggle}
            onHoursChange={onHoursChange}
            onSubjectAdd={onSubjectAdd}
            onSubjectDelete={onSubjectDelete}
            onGroupCountChange={onGroupCountChange}
            onClassDelete={onClassDelete}
            onClassAdd={onClassAdd}
            onClassCopy={onClassCopy}
          />
        </details>
      ))}
    </div>
  );
}

/** Extract grade number from class name, e.g. "5а" → 5 */
function gradeOf(className: string): number {
  return parseInt(className, 10) || 0;
}

interface GradeTableProps {
  grade: number;
  subjects: SubjectRow[];
  expectedTotals?: Record<string, number>;
  classNames: string[];
  groupCounts?: Record<string, 1 | 2>;
  readOnly?: boolean;
  onShortNameChange?: (grade: number, subjectName: string, value: string) => void;
  onPartChange?: (grade: number, subjectName: string, currentPart: SubjectRow['part'], newPart: SubjectRow['part']) => void;
  onGroupSplitToggle?: (grade: number, subjectName: string, part: SubjectRow['part'], onlyThisGrade?: boolean) => void;
  onHoursChange?: (grade: number, subjectName: string, part: SubjectRow['part'], className: string, value: number) => void;
  onSubjectAdd?: (grade: number, subjectName: string) => void;
  onSubjectDelete?: (grade: number, subjectName: string, part: SubjectRow['part']) => void;
  onGroupCountChange?: (className: string, count: 1 | 2) => void;
  onClassDelete?: (grade: number, className: string) => void;
  onClassAdd?: (grade: number, className: string) => void;
  onClassCopy?: (grade: number, sourceClass: string, newClass: string) => void;
}

function GradeTable({
  grade,
  subjects,
  expectedTotals,
  classNames,
  groupCounts,
  readOnly,
  onShortNameChange,
  onPartChange,
  onGroupSplitToggle,
  onHoursChange,
  onSubjectAdd,
  onSubjectDelete,
  onGroupCountChange,
  onClassDelete,
  onClassAdd,
  onClassCopy,
}: GradeTableProps) {
  const [addingSubject, setAddingSubject] = useState(false);
  const [addingClass, setAddingClass] = useState(false);
  const [copyingFromClass, setCopyingFromClass] = useState<string | null>(null);
  const [newClassName, setNewClassName] = useState('');
  const [addClassError, setAddClassError] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [addError, setAddError] = useState('');

  function commitClassAdd() {
    const name = newClassName.trim();
    if (!name) { setAddClassError('Введите название'); return; }
    if (classNames.includes(name)) { setAddClassError('Такой класс уже есть'); return; }
    if (copyingFromClass) {
      onClassCopy?.(grade, copyingFromClass, name);
      setCopyingFromClass(null);
    } else {
      onClassAdd?.(grade, name);
    }
    setNewClassName('');
    setAddClassError('');
    setAddingClass(false);
  }

  function commitAdd() {
    const name = newSubjectName.trim();
    if (!name) { setAddError('Введите название'); return; }
    if (subjects.find((s) => s.name === name)) { setAddError('Такой предмет уже есть'); return; }
    onSubjectAdd?.(grade, name);
    setNewSubjectName('');
    setAddError('');
    setAddingSubject(false);
  }

  // Computed sum per class
  const computedTotals: Record<string, number> = {};
  for (const cn of classNames) {
    computedTotals[cn] = subjects.reduce((sum, s) => sum + (s.hoursPerClass[cn] ?? 0), 0);
  }

  // З11-1: Detect where optional section starts for separator row
  const firstOptionalIdx = subjects.findIndex((s) => s.part === 'optional');

  const colSpanAll = 4 + classNames.length + (readOnly ? 0 : 2);

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Предмет</th>
            <th>Кратко</th>
            <th>Группы</th>
            <th className={styles.partHeader}>Часть</th>
            {classNames.map((cn) => (
              <th key={cn} className={styles.classHeader}>
                <div>{cn}</div>
                {!readOnly && (
                  <div className={styles.classHeaderControls}>
                    <select
                      className={styles.groupCountSelect}
                      value={groupCounts?.[cn] ?? 2}
                      onChange={(e) => onGroupCountChange?.(cn, Number(e.target.value) as 1 | 2)}
                      title="Количество групп"
                    >
                      <option value={1}>1 гр</option>
                      <option value={2}>2 гр</option>
                    </select>
                    <button
                      className={styles.copyClassBtn}
                      onClick={() => { setCopyingFromClass(cn); setAddingClass(true); setNewClassName(''); setAddClassError(''); }}
                      title={`Скопировать класс ${cn}`}
                    >⎘</button>
                    <button
                      className={styles.deleteClassBtn}
                      onClick={() => onClassDelete?.(grade, cn)}
                      title={`Удалить класс ${cn}`}
                    >✕</button>
                  </div>
                )}
              </th>
            ))}
            {!readOnly && (
              <th className={styles.addClassTh}>
                {!addingClass && (
                  <button
                    className={styles.addClassHeaderBtn}
                    onClick={() => { setAddingClass(true); setCopyingFromClass(null); setNewClassName(''); setAddClassError(''); }}
                  >+ Класс</button>
                )}
              </th>
            )}
            {!readOnly && <th></th>}
          </tr>
        </thead>
        <tbody>
          {subjects.map((s, idx) => (
            <Fragment key={`${s.name}::${s.part}`}>
              {/* З11-1: Section separator before the first optional subject */}
              {idx === firstOptionalIdx && firstOptionalIdx > 0 && (
                <tr className={styles.sectionSeparator}>
                  <td colSpan={colSpanAll} className={styles.sectionSeparatorCell}>
                    Школьная / вариативная часть
                  </td>
                </tr>
              )}
              <tr>
                <td>{s.name}</td>
                <td>
                  {readOnly ? (
                    s.shortName
                  ) : (
                    <input
                      className={styles.shortNameInput}
                      value={s.shortName}
                      onChange={(e) => onShortNameChange?.(grade, s.name, e.target.value)}
                    />
                  )}
                </td>
                <td className={styles.centerCell}>
                  {readOnly ? (
                    s.groupSplit ? '✓' : ''
                  ) : (
                    <div className={styles.groupSplitCell}>
                      <input
                        type="checkbox"
                        checked={s.groupSplit}
                        onChange={() => onGroupSplitToggle?.(grade, s.name, s.part)}
                        title="Применить ко всем параллелям"
                      />
                      <button
                        className={styles.onlyThisGradeBtn}
                        onClick={() => onGroupSplitToggle?.(grade, s.name, s.part, true)}
                        title="Изменить только в этой параллели"
                        type="button"
                      >
                        только эту
                      </button>
                    </div>
                  )}
                </td>
                <td className={styles.partCell}>
                  {readOnly ? (
                    s.part === 'mandatory' ? 'Обяз.' : 'Выбор'
                  ) : (
                    <select
                      className={styles.partSelect}
                      value={s.part}
                      onChange={(e) => onPartChange?.(grade, s.name, s.part, e.target.value as SubjectRow['part'])}
                    >
                      <option value="mandatory">Обяз.</option>
                      <option value="optional">Выбор</option>
                    </select>
                  )}
                </td>
                {classNames.map((cn) => (
                  <td key={cn} className={styles.hoursCell}>
                    {readOnly ? (
                      s.hoursPerClass[cn] || ''
                    ) : (
                      <input
                        type="number"
                        min="0"
                        className={styles.hoursInput}
                        value={s.hoursPerClass[cn] ?? ''}
                        onChange={(e) => onHoursChange?.(grade, s.name, s.part, cn, parseInt(e.target.value) || 0)}
                      />
                    )}
                  </td>
                ))}
                {!readOnly && (
                  <td className={styles.deleteCellSubject}>
                    <button
                      className={styles.deleteSubjectBtn}
                      onClick={() => onSubjectDelete?.(grade, s.name, s.part)}
                      title="Удалить предмет"
                    >✕</button>
                  </td>
                )}
                {!readOnly && <td></td>}
              </tr>
            </Fragment>
          ))}
          {!readOnly && (
            addingSubject ? (
              <tr>
                <td colSpan={colSpanAll}>
                  <div className={styles.addSubjectRow}>
                    <input
                      className={styles.addSubjectInput}
                      placeholder="Название предмета"
                      value={newSubjectName}
                      autoFocus
                      onChange={(e) => { setNewSubjectName(e.target.value); setAddError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') setAddingSubject(false); }}
                    />
                    <button className={styles.addSubjectConfirm} onClick={commitAdd}>Добавить</button>
                    <button className={styles.addSubjectCancel} onClick={() => setAddingSubject(false)}>Отмена</button>
                    {addError && <span className={styles.addSubjectError}>{addError}</span>}
                  </div>
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={colSpanAll}>
                  <button className={styles.addSubjectBtn} onClick={() => { setAddingSubject(true); setNewSubjectName(''); setAddError(''); }}>
                    + Предмет
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
        <tfoot>
          <tr className={styles.totalsRow}>
            <td colSpan={4}>Итого</td>
            {classNames.map((cn) => {
              const computed = computedTotals[cn];
              const expected = expectedTotals?.[cn];
              const mismatch = expected !== undefined && computed !== expected;
              return (
                <td key={cn} className={`${styles.hoursCell} ${mismatch ? styles.totalsMismatch : ''}`}>
                  {computed}
                  {mismatch && <span className={styles.totalsExpected}> / {expected}</span>}
                </td>
              );
            })}
            {!readOnly && <td></td>}
            {!readOnly && <td></td>}
          </tr>
        </tfoot>
      </table>
      {!readOnly && addingClass && (
        <div className={styles.addClassRow}>
          {copyingFromClass && (
            <span className={styles.copyFromLabel}>Копия от {copyingFromClass}:</span>
          )}
          <input
            className={styles.addClassInput}
            placeholder={`${grade}а`}
            value={newClassName}
            autoFocus
            onChange={(e) => { setNewClassName(e.target.value); setAddClassError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') commitClassAdd(); if (e.key === 'Escape') { setAddingClass(false); setCopyingFromClass(null); } }}
          />
          <button className={styles.addSubjectConfirm} onClick={commitClassAdd}>Добавить</button>
          <button className={styles.addSubjectCancel} onClick={() => { setAddingClass(false); setCopyingFromClass(null); }}>Отмена</button>
          {addClassError && <span className={styles.addSubjectError}>{addClassError}</span>}
        </div>
      )}
    </div>
  );
}
