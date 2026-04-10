/**
 * AppHeader - Main navigation header with version info
 */

import { useState, useCallback } from 'react';
import type { AppTab, VersionType } from '@/types';
import { useUIStore, useScheduleStore, useDataStore } from '@/stores';
import { formatWeekFull } from '@/utils/dateFormat';
import { Modal } from './Modal';
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

  const isReadOnlyYear = useDataStore((state) => state.isReadOnlyYear);
  const readOnlyYearLabel = useDataStore((state) => state.readOnlyYearLabel);
  const exitReadOnlyYear = useDataStore((state) => state.exitReadOnlyYear);

  const [aboutOpen, setAboutOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');

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

  return (
    <>
    <header className={styles.header}>
      <h1 className={styles.logo}>
        РШР
        <button className={styles.versionBtn} onClick={() => setAboutOpen(true)}>
          v{import.meta.env.VITE_APP_VERSION}
        </button>
      </h1>

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
            onClick={() => window.__tauriCloseRequested?.()}
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

    <Modal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} title="О программе" size="small">
      <div className={styles.aboutContent}>
        <p className={styles.aboutVersion}>Версия {import.meta.env.VITE_APP_VERSION}</p>
        <p className={styles.aboutAuthors}>Авторы: Минухин В., Минухин Д., Клаудиа</p>
      </div>
    </Modal>
    </>
  );
}
