import { useRef, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useDownloadFolder, isFileSystemAccessSupported } from '../hooks/useDownloadFolder';
import { useStore } from '../store';
import { generateOutput } from '../logic/outputGenerator';
import { validateWorkload } from '../logic/validation';
import { buildDeptReportData, printDeptReport } from '../logic/deptReport';
import { compareClassNames } from '../logic/classSort';
import { buildOfficialReport } from '../logic/officialReport';
import { printOfficialReport } from '../logic/exportPdfReport';
import { downloadWordReport } from '../logic/exportWordReport';
import { shortTeacherName } from '../logic/groupNames';
import { parseUPSnapshot, detectOrphanedSubjects } from '../logic/upSnapshot';
import {
  createDeptSnapshot,
  parseDeptSnapshot,
  validateDeptSnapshot,
  detectSnapshotConflicts,
  getGroupSubjects,
} from '../logic/deptSnapshot';
import { useToast } from '../hooks/useToast';
import type { LessonRequirement, CurriculumPlan } from '../types';
import styles from './ExportPage.module.css';

export function ExportPage() {
  const {
    curriculumPlan, teachers, deptGroups, assignments, homeroomAssignments,
    setCurriculumPlan, pruneOrphanedAssignments, applyDeptSnapshot, bootstrapFromDeptSnapshot,
    bulkSetAssignments, setImportConflictBanner,
  } = useStore();
  const { notify } = useToast();
  const upInputRef = useRef<HTMLInputElement>(null);

  // З11-8: independent folder per export button
  const exportFolder = useDownloadFolder('export');
  const deptFileFolder = useDownloadFolder('dept-file');

  // З15-1: official workload report variant
  const [variantDate, setVariantDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [variantLabel, setVariantLabel] = useState('');

  // MU-1: dept export
  const [selectedGroupId, setSelectedGroupId] = useState('');

  // З10-1: "Отправить завучу" — auto-export when only one dept group (dept-head mode)
  const isSingleGroup = deptGroups.length === 1;

  // MU-2: dept import
  const deptInputRef = useRef<HTMLInputElement>(null);

  const requirements = useMemo(
    () => generateOutput(assignments, teachers, homeroomAssignments, curriculumPlan?.groupNameOverrides, curriculumPlan ?? undefined),
    [assignments, teachers, homeroomAssignments, curriculumPlan],
  );
  const classReqs = useMemo(
    () => requirements.filter((r) => r.type === 'class').sort((a, b) => {
      const c = compareClassNames(a.classOrGroup, b.classOrGroup);
      return c !== 0 ? c : a.subject.localeCompare(b.subject, 'ru');
    }),
    [requirements],
  );
  const groupReqs = useMemo(
    () => requirements.filter((r) => r.type === 'group').sort((a, b) => {
      const c = compareClassNames(a.className ?? '', b.className ?? '');
      return c !== 0 ? c : a.subject.localeCompare(b.subject, 'ru');
    }),
    [requirements],
  );

  const issues = useMemo(
    () => curriculumPlan
      ? validateWorkload(curriculumPlan, teachers, assignments, homeroomAssignments)
      : [],
    [curriculumPlan, teachers, assignments, homeroomAssignments],
  );
  const errors = useMemo(() => issues.filter((i) => i.severity === 'error'), [issues]);
  const warnings = useMemo(() => issues.filter((i) => i.severity === 'warning'), [issues]);

  async function handleUpImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const snap = parseUPSnapshot(raw);
      const orphaned = detectOrphanedSubjects(snap.plan, assignments);
      if (orphaned.length > 0) {
        const list = orphaned.join(', ');
        if (!confirm(`Следующие предметы есть в назначениях, но отсутствуют в новом плане:\n${list}\n\nУдалить связанные назначения?`)) {
          notify('Импорт отменён', 'info');
          return;
        }
        pruneOrphanedAssignments(snap.plan.grades.flatMap((g) => g.subjects.map((s) => s.name)));
      }
      setCurriculumPlan(snap.plan);
      notify(
        `Учебный план обновлён${orphaned.length > 0 ? ` (убрано предметов: ${orphaned.length})` : ' — назначения не изменены'}`,
        'success',
      );
    } catch (err) {
      notify(`Ошибка: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }

  async function saveBlobToFolderOrDownload(
    blob: Blob,
    filename: string,
    folder: typeof deptFileFolder,
  ): Promise<boolean> {
    if (isFileSystemAccessSupported && folder.folderHandle) {
      const handle = await folder.ensurePermission(folder.folderHandle);
      if (handle) {
        const fh = await handle.getFileHandle(filename, { create: true });
        const writable = await fh.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return false;
  }

  async function exportDeptSnapshot(groupId: string) {
    if (!curriculumPlan) return;
    const group = deptGroups.find((g) => g.id === groupId);
    const groupName = group?.name ?? groupId;
    try {
      const snap = createDeptSnapshot(groupId, { curriculumPlan, teachers, deptGroups, assignments });
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
      await saveBlobToFolderOrDownload(blob, `нагрузка_${groupName}.json`, deptFileFolder);
      notify(`Файл кафедры «${groupName}» скачан`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  function handleSendToPrincipal() {
    if (!isSingleGroup) return;
    return exportDeptSnapshot(deptGroups[0].id);
  }

  function handleExportDept() {
    if (!selectedGroupId) return;
    return exportDeptSnapshot(selectedGroupId);
  }

  async function handleImportDept(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const snap = parseDeptSnapshot(raw);

      // З9-BUG-1a / З14-1: bootstrap when no plan yet, OR when group ID is not in current
      // deptGroups and no assignments exist yet (dept head who loaded план.json separately).
      const groupExists = deptGroups.some((g) => g.id === snap.groupId);
      const isBlank = !curriculumPlan || (!groupExists && assignments.length === 0);
      if (isBlank) {
        bootstrapFromDeptSnapshot(snap);
        notify(`Данные кафедры «${snap.groupName}» загружены`, 'success');
        return;
      }

      const validationErr = validateDeptSnapshot(snap, { deptGroups, curriculumPlan });
      // З16-1: plan-hash-mismatch is no longer a hard block — import proceeds with conflict detection.
      // All other errors (unknown-group, empty-subject-filter) still block.
      if (validationErr && validationErr.kind !== 'plan-hash-mismatch') {
        const messages: Record<string, string> = {
          'not-dept-snapshot': 'Это не файл кафедры. Загрузите файл, экспортированный кнопкой «Выгрузить файл завуча».',
          'unknown-group': `Кафедра «${snap.groupId}» не найдена в текущих данных.`,
          'empty-subject-filter': 'У кафедры нет предметов — невозможно определить границы слияния.',
        };
        notify(messages[validationErr.kind] ?? `Ошибка: ${validationErr.kind}`, 'error', 0);
        return;
      }
      const hasMismatch = validationErr?.kind === 'plan-hash-mismatch';

      const masterGroup = deptGroups.find((g) => g.id === snap.groupId)!;
      const masterSubjects = getGroupSubjects(masterGroup);
      const replacedCount = assignments.filter((a) => masterSubjects.includes(a.subject)).length;
      applyDeptSnapshot(snap);

      // З17-4: warn about duplicate teachers (same name, different IDs)
      const postTeachers = useStore.getState().teachers;
      const nameCount = new Map<string, number>();
      for (const t of postTeachers) nameCount.set(t.name, (nameCount.get(t.name) ?? 0) + 1);
      const duplicates = [...nameCount.entries()].filter(([, c]) => c > 1).map(([name]) => name);
      if (duplicates.length > 0) {
        notify(
          `Возможные дубликаты учителей: ${duplicates.join(', ')}. Проверьте вкладку «Учителя».`,
          'warning',
          0,
        );
      }

      if (hasMismatch) {
        const conflicts = detectSnapshotConflicts(snap, curriculumPlan!);
        if (conflicts.orphanedCount > 0) {
          // Auto-prune: orphaned assignments are invisible in AssignPage — the grid is built from
          // current plan subjects/classNames only. Use post-apply state from the store.
          const badSubjects = new Set(conflicts.unknownSubjects);
          const badClasses = new Set(conflicts.unknownClassNames);
          const fresh = useStore.getState().assignments;
          bulkSetAssignments(fresh.filter((a) => !badSubjects.has(a.subject) && !badClasses.has(a.className)));
          setImportConflictBanner({ groupName: snap.groupName, conflicts });
        } else {
          notify(`Назначения для «${snap.groupName}» импортированы (план изменился, конфликтов нет)`, 'success');
        }
      } else {
        notify(
          `Назначения для «${snap.groupName}» обновлены — импортировано ${snap.assignments.length} (заменено ${replacedCount})`,
          'success',
        );
      }
    } catch (err) {
      notify(`Ошибка: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }

  function handleDownloadPdf() {
    if (!curriculumPlan) return;
    const report = buildOfficialReport(curriculumPlan, assignments, teachers, homeroomAssignments, variantDate, variantLabel, deptGroups);
    printOfficialReport(report);
  }

  async function handleDownloadWord() {
    if (!curriculumPlan) return;
    const report = buildOfficialReport(curriculumPlan, assignments, teachers, homeroomAssignments, variantDate, variantLabel, deptGroups);
    await downloadWordReport(report);
  }

  // З11-7: print dept workload PDF for a specific group
  function handlePrintDeptReport(groupId: string) {
    const group = deptGroups.find((g) => g.id === groupId);
    if (!group) return;
    const entries = buildDeptReportData(group, assignments, teachers);
    printDeptReport(group, entries);
  }

  async function handleExport() {
    // З6-1: use short subject names and initials in the exported file
    const subjectShortName = buildSubjectShortNameMap(curriculumPlan);

    const wb = XLSX.utils.book_new();

    // Sheet 1: Занятия (классы)
    const classRows = [
      ['Класс', 'Предмет', 'Учитель', 'Кол-во в неделю'],
      ...classReqs.map((r) => [
        r.classOrGroup,
        subjectShortName(r.subject),
        shortTeacherName(r.teacher),
        r.countPerWeek,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(classRows), 'Занятия (классы)');

    // Sheet 2: Занятия (группы)
    const groupRows = [
      ['Группа', 'Класс', 'Предмет', 'Учитель', 'Параллельная группа', 'Кол-во в неделю'],
      ...groupReqs.map((r) => [
        r.classOrGroup,
        r.className ?? '',
        subjectShortName(r.subject),
        shortTeacherName(r.teacher),
        r.parallelGroup ?? '',
        r.countPerWeek,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(groupRows), 'Занятия (группы)');

    // З11-8: save to folder if available, otherwise blob download
    if (isFileSystemAccessSupported && exportFolder.folderHandle) {
      const handle = await exportFolder.ensurePermission(exportFolder.folderHandle);
      if (handle) {
        const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const fh = await handle.getFileHandle('занятия.xlsx', { create: true });
        const writable = await fh.createWritable();
        await writable.write(blob);
        await writable.close();
        notify('Файл занятия.xlsx сохранён', 'success');
        return;
      }
    }
    XLSX.writeFile(wb, 'занятия.xlsx');
    notify('Файл занятия.xlsx сохранён', 'success');
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>Экспорт</h2>

      {errors.length > 0 && (
        <div className={styles.errorBanner}>
          <strong>Есть ошибки ({errors.length}):</strong>
          <ul>
            {errors.map((e, i) => <li key={i}>{e.message}</li>)}
          </ul>
        </div>
      )}

      {warnings.length > 0 && errors.length === 0 && (
        <div className={styles.warnBanner}>
          <strong>Предупреждения ({warnings.length})</strong> — экспорт возможен, но проверьте нагрузку.
        </div>
      )}

      <div className={styles.summary}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryNum}>{classReqs.length}</div>
          <div className={styles.summaryLabel}>Занятия (классы)</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryNum}>{groupReqs.length}</div>
          <div className={styles.summaryLabel}>Занятия (группы)</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryNum}>{requirements.length}</div>
          <div className={styles.summaryLabel}>Всего строк</div>
        </div>
      </div>

      <div className={styles.actions}>
        <div className={styles.btnGroup}>
          <button
            className={`${styles.exportBtn} ${errors.length > 0 ? styles.exportBtnWarn : ''}`}
            onClick={handleExport}
            disabled={requirements.length === 0}
          >
            Скачать занятия.xlsx
          </button>
          {isFileSystemAccessSupported && (
            <span className={styles.folderHint}>
              {exportFolder.folderName
                ? <>📁 {exportFolder.folderName} · <button className={styles.folderChangeBtn} onClick={exportFolder.pickFolder}>изменить</button></>
                : <button className={styles.folderChangeBtn} onClick={exportFolder.pickFolder}>📁 выбрать папку</button>
              }
            </span>
          )}
        </div>
        {/* З11-7: dept-head mode — single group */}
        {isSingleGroup && (
          <button
            className={styles.printBtn}
            onClick={() => handlePrintDeptReport(deptGroups[0].id)}
            disabled={assignments.length === 0}
            title="Открыть печатную форму нагрузки кафедры"
          >
            Печатать нагрузку кафедры
          </button>
        )}
      </div>

      {/* З15-1: official workload report */}
      <div className={styles.reportSection}>
        <h3 className={styles.reportHeading}>Форма нагрузки</h3>
        <div className={styles.variantRow}>
          <input
            type="date"
            className={styles.variantDate}
            value={variantDate}
            onChange={(e) => setVariantDate(e.target.value)}
          />
          <input
            type="text"
            className={styles.variantLabel}
            placeholder="метка (необязательно)"
            value={variantLabel}
            onChange={(e) => setVariantLabel(e.target.value)}
          />
        </div>
        <div className={styles.reportBtns}>
          <button
            className={styles.printBtn}
            onClick={handleDownloadWord}
            disabled={!curriculumPlan || assignments.length === 0}
            title="Скачать документ нагрузки в формате Word (.docx)"
          >
            Скачать Word
          </button>
          <button
            className={styles.printBtn}
            onClick={handleDownloadPdf}
            disabled={!curriculumPlan || assignments.length === 0}
            title="Открыть форму нагрузки для печати / сохранения PDF"
          >
            Скачать PDF
          </button>
        </div>
      </div>

      <div className={styles.upImportSection}>
        <h3 className={styles.upImportHeading}>Обновить учебный план</h3>
        <p className={styles.upImportHint}>
          Если структура учебного плана изменилась, загрузите обновлённый файл «учебный_план.json» —
          его можно скачать во вкладке «Учебный план». Назначения сохранятся.
        </p>
        <button className={styles.upImportBtn} onClick={() => upInputRef.current?.click()}>
          Загрузить учебный_план.json
        </button>
        <input
          ref={upInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleUpImport}
        />
      </div>

      <div className={styles.exchangeSection}>
        <h3 className={styles.exchangeHeading}>Обмен с кафедрами</h3>

        {/* З10-1: Send to principal — only shown in dept-head mode (single group) */}
        {isSingleGroup && (
          <div className={styles.exchangeSubsection}>
            <p className={styles.exchangeLabel}>Отправить завучу</p>
            <div className={styles.exchangeRow}>
              <button
                className={styles.exchangeBtn}
                disabled={!curriculumPlan}
                onClick={handleSendToPrincipal}
              >
                Отправить завучу
              </button>
              {isFileSystemAccessSupported && (
                <span className={styles.folderHint}>
                  {deptFileFolder.folderName
                    ? <>📁 {deptFileFolder.folderName} · <button className={styles.folderChangeBtn} onClick={deptFileFolder.pickFolder}>изменить</button></>
                    : <button className={styles.folderChangeBtn} onClick={deptFileFolder.pickFolder}>📁 выбрать папку</button>
                  }
                </span>
              )}
            </div>
          </div>
        )}

        {/* MU-1: Export dept starter file */}
        {!isSingleGroup && (
        <div className={styles.exchangeSubsection}>
          <p className={styles.exchangeLabel}>Экспорт для кафедры</p>
          <div className={styles.exchangeRow}>
            <select
              className={styles.groupSelect}
              value={selectedGroupId}
              onChange={(e) => { setSelectedGroupId(e.target.value); }}
            >
              <option value="">— выбрать кафедру —</option>
              {deptGroups.map((g) => {
                const hasSubjects = getGroupSubjects(g).length > 0;
                return (
                  <option key={g.id} value={g.id} disabled={!hasSubjects}>
                    {g.name}{!hasSubjects ? ' (нет предметов)' : ''}
                  </option>
                );
              })}
            </select>
            <button
              className={styles.exchangeBtn}
              disabled={!selectedGroupId || !curriculumPlan}
              onClick={handleExportDept}
            >
              Выгрузить файл завуча
            </button>
            {/* З11-7: print dept PDF */}
            <button
              className={styles.exchangeBtn}
              disabled={!selectedGroupId || assignments.length === 0}
              onClick={() => handlePrintDeptReport(selectedGroupId)}
              title="Открыть печатную форму нагрузки кафедры"
            >
              Печатать нагрузку кафедры
            </button>
          </div>
        </div>
        )}

        {/* MU-2: Import dept snapshot */}
        <div className={styles.exchangeSubsection}>
          <p className={styles.exchangeLabel}>Импорт от кафедры</p>
          <button
            className={styles.exchangeBtn}
            onClick={() => deptInputRef.current?.click()}
          >
            Импортировать файл кафедры
          </button>
          <input
            ref={deptInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImportDept}
          />
        </div>
      </div>

      {requirements.length > 0 && (
        <PreviewTable requirements={requirements} />
      )}
    </div>
  );
}

/** З6-1: returns a function that looks up the short name for a subject */
function buildSubjectShortNameMap(plan: CurriculumPlan | null): (fullName: string) => string {
  if (!plan) return (name) => name;
  const map = new Map<string, string>();
  for (const grade of plan.grades) {
    for (const subject of grade.subjects) {
      if (subject.shortName && !map.has(subject.name)) {
        map.set(subject.name, subject.shortName);
      }
    }
  }
  return (fullName) => map.get(fullName) ?? fullName;
}

function PreviewTable({ requirements }: { requirements: LessonRequirement[] }) {
  const [tab, setTab] = useState<'class' | 'group'>('class');
  const rows = requirements.filter((r) => r.type === tab);

  return (
    <div className={styles.preview}>
      <div className={styles.previewTabs}>
        <button
          className={tab === 'class' ? styles.previewTabActive : styles.previewTab}
          onClick={() => setTab('class')}
        >
          Классы ({requirements.filter((r) => r.type === 'class').length})
        </button>
        <button
          className={tab === 'group' ? styles.previewTabActive : styles.previewTab}
          onClick={() => setTab('group')}
        >
          Группы ({requirements.filter((r) => r.type === 'group').length})
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {tab === 'class' ? (
                <>
                  <th>Класс</th><th>Предмет</th><th>Учитель</th><th>Ч/нед</th>
                </>
              ) : (
                <>
                  <th>Группа</th><th>Класс</th><th>Предмет</th><th>Учитель</th><th>Парал. группа</th><th>Ч/нед</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {tab === 'class' ? (
                  <>
                    <td>{r.classOrGroup}</td>
                    <td>{r.subject}</td>
                    <td>{r.teacher}</td>
                    <td className={styles.numCell}>{r.countPerWeek}</td>
                  </>
                ) : (
                  <>
                    <td>{r.classOrGroup}</td>
                    <td>{r.className}</td>
                    <td>{r.subject}</td>
                    <td>{r.teacher}</td>
                    <td>{r.parallelGroup}</td>
                    <td className={styles.numCell}>{r.countPerWeek}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
