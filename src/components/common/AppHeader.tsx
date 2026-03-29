/**
 * AppHeader - Main navigation header with version info
 */

import { useState, useCallback } from 'react';
import type { AppTab, VersionType } from '@/types';
import { useUIStore, useScheduleStore, useDataStore } from '@/stores';
import { formatWeekFull } from '@/utils/dateFormat';
import { exportToJson, saveJsonFile, pickJsonFile, parseExportData, getExportSummary, importFromJson, type ExportSummary } from '@/db/import-export';
import { createBackup } from '@/db/backup';
import { Modal } from './Modal';
import { ImportConfirmModal } from './ImportConfirmModal';
import styles from './AppHeader.module.css';

const IS_TAURI = '__TAURI_INTERNALS__' in window;

const TABS: { id: AppTab; label: string; title: string }[] = [
  { id: 'start', label: 'Главная', title: 'Управление версиями и импорт данных' },
  { id: 'editor', label: 'Редактор', title: 'Редактирование расписания' },
  { id: 'export', label: 'Экспорт', title: 'Экспорт расписания для печати' },
  { id: 'data', label: 'Данные', title: 'Просмотр и редактирование справочников' },
  { id: 'settings', label: 'Настройки', title: 'Настройки приложения' },
];

const VERSION_TYPE_LABELS: Record<VersionType, string> = {
  technical: 'Техническое',
  template: 'Шаблон',
  weekly: 'На неделю',
};

export function AppHeader() {
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);

  const versionType = useScheduleStore((state) => state.versionType);
  const versionName = useScheduleStore((state) => state.versionName);
  const mondayDate = useScheduleStore((state) => state.mondayDate);
  const updateVersionName = useScheduleStore((state) => state.updateVersionName);
  const hasSchedule = useScheduleStore((state) => Object.keys(state.schedule).length > 0);
  const isDirty = useScheduleStore((state) => state.isDirty);

  const hasData = useDataStore((state) => Object.keys(state.teachers).length > 0);
  const reloadData = useDataStore((state) => state.reloadData);
  const isReadOnlyYear = useDataStore((state) => state.isReadOnlyYear);
  const readOnlyYearLabel = useDataStore((state) => state.readOnlyYearLabel);
  const exitReadOnlyYear = useDataStore((state) => state.exitReadOnlyYear);

  const [aboutOpen, setAboutOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');

  // File operation state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importSummary, setImportSummary] = useState<ExportSummary | null>(null);
  const [pendingImportJson, setPendingImportJson] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleStartEditName = useCallback(() => {
    setEditedName(versionName);
    setIsEditingName(true);
  }, [versionName]);

  const handleSaveName = useCallback(() => {
    if (editedName.trim()) {
      updateVersionName(editedName.trim());
    }
    setIsEditingName(false);
  }, [editedName, updateVersionName]);

  const handleCancelEditName = useCallback(() => {
    setIsEditingName(false);
    setEditedName('');
  }, []);

  const handleExportJson = useCallback(async () => {
    const json = await exportToJson();
    const date = new Date().toISOString().slice(0, 10);
    await saveJsonFile(json, `timetable-${date}.json`);
  }, []);

  const handleImportJsonStart = useCallback(async () => {
    const file = await pickJsonFile();
    if (!file) return;
    try {
      const text = await file.text();
      const data = parseExportData(text);
      setPendingImportJson(text);
      setImportSummary(getExportSummary(data));
      setImportModalOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка чтения файла');
    }
  }, []);

  const handleImportJsonConfirm = useCallback(async () => {
    if (!pendingImportJson) return;
    setIsImporting(true);
    try {
      if (hasData) {
        await createBackup('Импорт JSON');
      }
      await importFromJson(pendingImportJson);
      await reloadData();
      setImportModalOpen(false);
      setPendingImportJson(null);
      setImportSummary(null);
      setActiveTab('start');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка импорта');
    } finally {
      setIsImporting(false);
    }
  }, [pendingImportJson, hasData, reloadData, setActiveTab]);

  return (
    <>
    <header className={styles.header}>
      <h1 className={styles.logo}>
        РШР
        <button className={styles.versionBtn} onClick={() => setAboutOpen(true)}>
          v{import.meta.env.VITE_APP_VERSION}
        </button>
      </h1>

      <div className={styles.fileActions}>
        <button
          className={`${styles.fileButton} ${isDirty ? styles.fileButtonDirty : ''}`}
          onClick={handleExportJson}
          disabled={!hasData || isReadOnlyYear}
          title="Сохранить файл"
        >
          Сохранить
        </button>
        <button
          className={styles.fileButton}
          onClick={handleImportJsonStart}
          disabled={isReadOnlyYear}
          title="Открыть файл"
        >
          Открыть
        </button>
      </div>

      {hasSchedule && (
        <div className={styles.versionInfo}>
          <span className={styles.versionType}>
            {VERSION_TYPE_LABELS[versionType]}
            {versionType === 'weekly' && mondayDate && (
              <span className={styles.weekRange}> ({formatWeekFull(mondayDate)})</span>
            )}
          </span>
          {isEditingName ? (
            <input
              type="text"
              className={styles.versionNameInput}
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName();
                if (e.key === 'Escape') handleCancelEditName();
              }}
              autoFocus
            />
          ) : (
            <button
              className={styles.versionNameButton}
              onClick={handleStartEditName}
              title="Нажмите для редактирования"
            >
              {versionName || 'Без названия'}
            </button>
          )}
        </div>
      )}

      <nav className={styles.nav}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.navItem} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.id)}
            title={tab.title}
          >
            {tab.label}
          </button>
        ))}
        {IS_TAURI && (
          <button
            className={styles.exitButton}
            onClick={() => (window as unknown as Record<string, () => void>).__tauriCloseRequested?.()}
            title="Закрыть приложение"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        )}
      </nav>
    </header>

    {isReadOnlyYear && (
      <div className={styles.readOnlyBanner}>
        <span>Просмотр {readOnlyYearLabel}</span>
        <button className={styles.readOnlyBackButton} onClick={exitReadOnlyYear}>
          Вернуться
        </button>
      </div>
    )}

    <ImportConfirmModal
      isOpen={importModalOpen}
      onClose={() => {
        setImportModalOpen(false);
        setPendingImportJson(null);
        setImportSummary(null);
      }}
      onConfirm={handleImportJsonConfirm}
      summary={importSummary}
      isImporting={isImporting}
    />
    <Modal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} title="О программе" size="small">
      <div className={styles.aboutContent}>
        <p className={styles.aboutVersion}>Версия {import.meta.env.VITE_APP_VERSION}</p>
        <p className={styles.aboutAuthors}>Авторы: Минухин В., Минухин Д., Клаудиа</p>
      </div>
    </Modal>
    </>
  );
}
