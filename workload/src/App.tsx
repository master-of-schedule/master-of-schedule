import { useState, useEffect, useRef } from 'react';
import { useStore } from './store';
import type { CurriculumPlan, RNTeacher, DeptGroup, Assignment, HomeroomAssignment } from './types';
import { ImportPage } from './pages/ImportPage';
import { TeachersPage } from './pages/TeachersPage';
import { DepartmentsPage } from './pages/DepartmentsPage';
import { AssignPage } from './pages/AssignPage';
import { HomeroomPage } from './pages/HomeroomPage';
import { ExportPage } from './pages/ExportPage';
import { useDownloadFolder, isFileSystemAccessSupported } from './hooks/useDownloadFolder';
import { useToast } from './hooks/useToast';
import { ToastContainer } from './components/ToastContainer';
import styles from './App.module.css';

const IS_TAURI = '__TAURI_INTERNALS__' in window;

const TABS = [
  { id: 'import', label: '1. Учебный план' },
  { id: 'departments', label: '2. Кафедры' },
  { id: 'teachers', label: '3. Учителя' },
  { id: 'assign', label: '4. Назначения' },
  { id: 'homeroom', label: '5. Классные руководители' },
  { id: 'export', label: '6. Экспорт' },
] as const;

export function App() {
  const {
    activeTab, setActiveTab, curriculumPlan, teachers, deptGroups, assignments, homeroomAssignments, loadFullState,
    importConflictBanner, setImportConflictBanner, resetAll,
  } = useStore();
  const { notify } = useToast();
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const isFirstRender = useRef(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);
  const { folderHandle, folderName, pickFolder, ensurePermission } = useDownloadFolder('save');

  // Mark dirty after any data change (skip initial hydration from localStorage)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setIsDirty(true);
    isDirtyRef.current = true;
  }, [teachers, deptGroups, assignments, homeroomAssignments, curriculumPlan]);

  // Register Tauri close interceptor
  useEffect(() => {
    if (!IS_TAURI) return;
    (window as unknown as Record<string, unknown>).__tauriCloseRequested = () => {
      if (!isDirtyRef.current) {
        import('@tauri-apps/api/core').then(({ invoke }) => invoke('confirm_and_exit'));
      } else {
        setShowCloseDialog(true);
      }
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__tauriCloseRequested;
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [dropdownOpen]);

  function buildBackupBlob() {
    const backup = {
      version: 1,
      savedAt: new Date().toISOString(),
      curriculumPlan,
      teachers,
      deptGroups,
      assignments,
      homeroomAssignments,
    };
    return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  }

  function buildFilename() {
    return `нагрузка-${new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')}.json`;
  }

  function fallbackDownload() {
    const blob = buildBackupBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildFilename();
    a.click();
    URL.revokeObjectURL(url);
  }

  async function writeToFolder(handle: FileSystemDirectoryHandle) {
    const filename = buildFilename();
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(buildBackupBlob());
    await writable.close();
  }

  async function handleSave() {
    if (IS_TAURI) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        defaultPath: buildFilename(),
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return; // user cancelled
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      const blob = buildBackupBlob();
      await writeTextFile(path, await blob.text());
      setIsDirty(false);
      isDirtyRef.current = false;
      notify('Сохранено', 'success');
      return;
    }
    if (!isFileSystemAccessSupported) {
      fallbackDownload();
    } else if (folderHandle) {
      const verified = await ensurePermission(folderHandle);
      if (verified) {
        await writeToFolder(verified);
      } else {
        // Permission denied, fall back to picker
        const newHandle = await pickFolder();
        if (newHandle) await writeToFolder(newHandle);
        else return; // cancelled
      }
    } else {
      // No folder stored yet — pick one
      const newHandle = await pickFolder();
      if (newHandle) await writeToFolder(newHandle);
      else return; // cancelled
    }
    setIsDirty(false);
    isDirtyRef.current = false;
    notify('Сохранено', 'success');
  }

  async function handleLoadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setDropdownOpen(false);
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as Record<string, unknown>;
      if (raw.version !== 1 || !raw.curriculumPlan) {
        notify('Неверный формат файла', 'error');
        return;
      }
      if (!confirm('Загрузить файл и заменить текущие данные в браузере?')) return;
      loadFullState({
        curriculumPlan: (raw.curriculumPlan as CurriculumPlan) ?? null,
        teachers: (raw.teachers as RNTeacher[]) ?? [],
        deptGroups: (raw.deptGroups as DeptGroup[]) ?? [],
        assignments: (raw.assignments as Assignment[]) ?? [],
        homeroomAssignments: (raw.homeroomAssignments as HomeroomAssignment[]) ?? [],
      });
      setIsDirty(false);
      isDirtyRef.current = false;
      notify('Файл загружен', 'success');
    } catch {
      notify('Ошибка при чтении файла', 'error');
    }
  }

  function handleClearData() {
    setDropdownOpen(false);
    if (!confirm('Очистить все данные и начать заново? Это действие нельзя отменить.')) return;
    resetAll();
    setIsDirty(false);
    isDirtyRef.current = false;
  }

  async function handlePickOtherFolder() {
    setDropdownOpen(false);
    const newHandle = await pickFolder();
    if (newHandle) {
      await writeToFolder(newHandle);
      setIsDirty(false);
      isDirtyRef.current = false;
      notify('Сохранено', 'success');
    }
  }

  async function handleCloseSave() {
    await handleSave();
    // After saving, allow Tauri to exit
    if (IS_TAURI) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('confirm_and_exit');
    }
  }

  async function handleCloseDiscard() {
    setShowCloseDialog(false);
    if (IS_TAURI) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('confirm_and_exit');
    }
  }

  const dirtyClass = isDirty ? styles.saveBtnDirty : '';

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Редактор нагрузки
          <button className={styles.versionBtn} onClick={() => setAboutOpen(true)}>
            v{import.meta.env.VITE_APP_VERSION}
          </button>
        </h1>
        <div className={styles.headerRight}>
          <input
            ref={loadInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleLoadFile}
          />
          {isFileSystemAccessSupported ? (
            <div className={`${styles.splitBtn} ${dirtyClass}`} ref={dropdownRef}>
              <button className={styles.splitMain} onClick={handleSave}>
                Сохранить
              </button>
              <button
                className={styles.splitArrow}
                onClick={() => setDropdownOpen((o) => !o)}
                title="Выбрать папку"
              >▾</button>
              {dropdownOpen && (
                <div className={styles.splitDropdown}>
                  {folderName && (
                    <div className={styles.splitDropdownFolder}>📁 {folderName}</div>
                  )}
                  <button className={styles.splitDropdownItem} onClick={handlePickOtherFolder}>
                    Выбрать другую папку…
                  </button>
                  <button className={styles.splitDropdownItem} onClick={() => { setDropdownOpen(false); fallbackDownload(); }}>
                    Скачать как файл
                  </button>
                  <button className={styles.splitDropdownItem} onClick={() => { setDropdownOpen(false); loadInputRef.current?.click(); }}>
                    Загрузить файл…
                  </button>
                  <hr className={styles.splitDropdownDivider} />
                  <button className={`${styles.splitDropdownItem} ${styles.splitDropdownDanger}`} onClick={handleClearData}>
                    Очистить данные…
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className={`${styles.saveBtn} ${dirtyClass}`}
                onClick={fallbackDownload}
              >
                Сохранить
              </button>
              <button
                className={styles.saveBtn}
                onClick={() => loadInputRef.current?.click()}
              >
                Загрузить
              </button>
              <button
                className={`${styles.saveBtn} ${styles.clearDataBtn}`}
                onClick={handleClearData}
              >
                Очистить…
              </button>
            </div>
          )}
        </div>
      </header>

      <nav className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {importConflictBanner && (
        <div className={styles.conflictBanner}>
          <div className={styles.conflictBannerText}>
            <strong>Файл кафедры «{importConflictBanner.groupName}» импортирован.</strong>{' '}
            Учебный план изменился — {importConflictBanner.conflicts.orphanedCount} назначений
            не совпадают с текущим планом и удалены. Заново назначьте их в таблице.
            {importConflictBanner.conflicts.unknownSubjects.length > 0 && (
              <> Предметы: {importConflictBanner.conflicts.unknownSubjects.join(', ')}.</>
            )}
            {importConflictBanner.conflicts.unknownClassNames.length > 0 && (
              <> Классы: {importConflictBanner.conflicts.unknownClassNames.join(', ')}.</>
            )}
          </div>
          <button
            className={styles.conflictBannerClose}
            onClick={() => setImportConflictBanner(null)}
            title="Закрыть"
          >×</button>
        </div>
      )}

      <main className={styles.content}>
        {/* ImportPage and AssignPage are always mounted so their undo stacks (refs) survive tab switches */}
        <div style={activeTab !== 'import' ? { display: 'none' } : undefined}><ImportPage /></div>
        {activeTab === 'teachers' && <TeachersPage />}
        {activeTab === 'departments' && <DepartmentsPage />}
        <div style={activeTab !== 'assign' ? { display: 'none' } : undefined}><AssignPage plan={curriculumPlan} /></div>
        {activeTab === 'homeroom' && <HomeroomPage plan={curriculumPlan} />}
        {activeTab === 'export' && <ExportPage />}
      </main>

      <ToastContainer />

      {showCloseDialog && (
        <div className={styles.aboutOverlay}>
          <div className={styles.aboutModal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.closeDialogTitle}>Несохранённые изменения</h2>
            <p className={styles.closeDialogMsg}>Сохранить перед выходом?</p>
            <div className={styles.closeDialogActions}>
              <button className={styles.closeDialogCancel} onClick={() => setShowCloseDialog(false)}>Отмена</button>
              <button className={styles.closeDialogDiscard} onClick={handleCloseDiscard}>Выйти без сохранения</button>
              <button className={styles.closeDialogSave} onClick={handleCloseSave}>Сохранить и выйти</button>
            </div>
          </div>
        </div>
      )}

      {aboutOpen && (
        <div className={styles.aboutOverlay} onClick={() => setAboutOpen(false)}>
          <div className={styles.aboutModal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.aboutTitle}>Редактор нагрузки</h2>
            <p className={styles.aboutVersion}>Версия {import.meta.env.VITE_APP_VERSION}</p>
            <p className={styles.aboutAuthors}>Авторы: Минухин В., Минухин Д., Клаудиа</p>
            <button className={styles.aboutClose} onClick={() => setAboutOpen(false)}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}
